import { OpenAI } from "openai"
import { NextResponse } from "next/server"
import { requireGeminiText } from "@/lib/ai/gemini"
import { parsePotentialJsonContent } from "@/lib/ai/json"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { parseJsonRequest } from "@/lib/server/request-validation"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import { resolveEffectivePlanTier } from "@/lib/server/effective-plan"
import { enforceUsageQuota, recordUsage } from "@/lib/server/usage-quota"
import { generateRequestSchema } from "@/lib/validation/api-schemas"
import { ANONYMOUS_GENERATE_LIMIT } from "@/lib/free-tier"
import { normalizeEstimatePayload } from "@/lib/estimates/normalize"

type UserMessageContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }

type GeminiMessageContentPart =
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }

type ModelGenerationResult = {
    content: string
    promptTokens: number
    completionTokens: number
}

type SourceLanguage = "auto" | "en" | "es" | "ko"
type GenerateWorkflow = "standard" | "photo_estimate"

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

const OPENAI_GENERATE_MODEL = process.env.OPENAI_GENERATE_MODEL?.trim() || "gpt-4o"
const GEMINI_GENERATE_MODEL = process.env.GEMINI_GENERATE_MODEL?.trim() || "gemini-2.5-flash"
const GENERATE_PROVIDER = process.env.GENERATE_AI_PROVIDER?.trim().toLowerCase() || "auto"
const GENERATE_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const GENERATE_RATE_LIMIT_MAX = 20
const ANONYMOUS_GENERATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const PRO_TIERS = new Set(["pro", "team"])

function parseBase64ImageDataUrl(raw: string): { mimeType: string; data: string } | null {
    const trimmed = raw.trim()
    const match = /^data:([^;]+);base64,([a-z0-9+/=\s]+)$/i.exec(trimmed)
    if (!match) return null

    const mimeType = match[1]?.trim().toLowerCase() || ""
    const data = (match[2] || "").replace(/\s+/g, "")

    if (!mimeType.startsWith("image/")) return null
    if (!data) return null

    return {
        mimeType,
        data,
    }
}

function resolveGenerateProvider(): "openai" | "gemini" {
    if (GENERATE_PROVIDER === "openai") {
        return "openai"
    }

    if (GENERATE_PROVIDER === "gemini") {
        return "gemini"
    }

    return process.env.GEMINI_API_KEY?.trim() ? "gemini" : "openai"
}

async function generateWithGemini(params: {
    systemPrompt: string
    notes?: string
    images?: string[]
}): Promise<ModelGenerationResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) {
        throw new Error("Gemini is not configured. Please add GEMINI_API_KEY.")
    }

    const parts: GeminiMessageContentPart[] = []

    if (params.notes?.trim()) {
        parts.push({ text: `Field Notes:\n${params.notes}` })
    } else {
        parts.push({ text: "Please generate an estimate based on the attached images." })
    }

    for (const rawImage of params.images || []) {
        const inlineData = parseBase64ImageDataUrl(rawImage)
        if (inlineData) {
            parts.push({
                inlineData: {
                    mimeType: inlineData.mimeType,
                    data: inlineData.data,
                },
            })
            continue
        }

        parts.push({
            text: `Reference image URL: ${rawImage}`,
        })
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_GENERATE_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify({
            systemInstruction: {
                role: "system",
                parts: [{ text: params.systemPrompt }],
            },
            contents: [
                {
                    role: "user",
                    parts,
                },
            ],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1500,
                responseMimeType: "application/json",
            },
        }),
        cache: "no-store",
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
        const providerMessage =
            typeof payload?.error?.message === "string" && payload.error.message.trim()
                ? payload.error.message.trim()
                : `Gemini request failed (${response.status})`
        throw new Error(providerMessage)
    }

    const content = requireGeminiText(payload)
    return {
        content,
        promptTokens: Number(payload?.usageMetadata?.promptTokenCount || 0),
        completionTokens: Number(payload?.usageMetadata?.candidatesTokenCount || 0),
    }
}

async function generateWithOpenAI(params: {
    systemPrompt: string
    notes?: string
    images?: string[]
}): Promise<ModelGenerationResult> {
    const userMessageContent: UserMessageContentPart[] = []

    if (params.notes) {
        userMessageContent.push({ type: "text", text: `Field Notes:\n${params.notes}` })
    } else {
        userMessageContent.push({ type: "text", text: "Please generate an estimate based on the attached images." })
    }

    if (params.images && Array.isArray(params.images)) {
        params.images.forEach((imageUrl: string) => {
            userMessageContent.push({
                type: "image_url",
                image_url: {
                    url: imageUrl,
                },
            })
        })
    }

    const response = await openai.chat.completions.create({
        model: OPENAI_GENERATE_MODEL,
        messages: [
            { role: "system", content: params.systemPrompt },
            {
                role: "user",
                content: userMessageContent,
            },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 1500,
    })

    const content = response.choices[0].message.content
    if (!content) {
        throw new Error("No content generated")
    }

    return {
        content,
        promptTokens: Number(response.usage?.prompt_tokens || 0),
        completionTokens: Number(response.usage?.completion_tokens || 0),
    }
}

// V5 LITE - Optimized System Prompt (650 tokens, 100/100 score)
function getSourceLanguageGuidance(sourceLanguage: SourceLanguage): string {
    if (sourceLanguage === "es") {
        return "Source notes are primarily Spanish. Resolve trade slang into professional North American English."
    }

    if (sourceLanguage === "ko") {
        return "Source notes are primarily Korean. Resolve field shorthand into professional North American English."
    }

    if (sourceLanguage === "en") {
        return "Source notes are primarily English. Clean up field shorthand into professional English."
    }

    return "Source notes may mix English, Spanish, and Korean. Detect the language and normalize everything into professional English."
}

function getSystemPromptV5(userProfile: {
    city?: string
    country?: string
    taxRate?: number
    businessName?: string
    priceList?: string  // Price list formatted for prompt
}, projectType: 'residential' | 'commercial' = 'residential', sourceLanguage: SourceLanguage = "auto", workflow: GenerateWorkflow = "standard", photoContext = "") {
    const city = userProfile.city || "Toronto"
    const country = userProfile.country || "Canada"
    const taxRate = userProfile.taxRate || 13
    const businessName = userProfile.businessName || "Our Company"
    const currencyCode = country === "Canada" ? "CAD" : "USD"
    const priceList = userProfile.priceList || ""

    // Build price list section if available
    const priceListSection = priceList ? `
═══════════════════════════════════════
📋 CONTRACTOR'S PRICE LIST (USE THESE PRICES!)
═══════════════════════════════════════
The contractor has a FIXED price list. When matching items, USE THESE EXACT PRICES:

${priceList}

RULES:
- If the user's input matches an item above (by name OR keywords), USE THAT EXACT PRICE.
- If no match is found, set unit_price = 0 and add "(Price TBD)" to description.
- Match keywords in any language (English, Korean, Spanish, etc.).

` : ""

    const projectContext = projectType === 'commercial'
        ? `TYPE: COMMERCIAL / INDUSTRIAL
   - MATERIALS: Use commercial specs (EMT/Rigid Conduit, Steel Studs, Plenum Cable, Drop Ceilings).
   - TONE: Professional, Facility Manager focused (e.g., "shutdown coordination", "safety compliance").`
        : `TYPE: RESIDENTIAL
   - MATERIALS: Use residential specs (Romex, Wood Studs, PVC, Drywall).
   - TONE: Homeowner friendly, warm but professional.`
    const photoEstimateContext = workflow === "photo_estimate"
        ? `
PHOTO ESTIMATE MODE:
- This request is specifically for jobsite photo estimating.
- Use the photos as your primary evidence, and use notes only to clarify trade or room context.
- If the photo does not prove a condition, do not state it as fact.
- Add a "photoAnalysis" object with:
  - "observations": short factual site observations from the images
  - "suggestedScope": short scope bullets the contractor should review
  - "materialSuggestions": likely materials with quantity, unit, and reason
  - "pricingConfidence": "low" | "medium" | "high"
- Prefer line items that cover visible materials, labor, cleanup, and verification steps.
- Add warnings for any hidden conditions, measurements, or code assumptions that still need on-site verification.
${photoContext ? `- Extra jobsite context: ${photoContext}` : "- No extra jobsite context was provided."}
`
        : ""

    return `
You are an expert North American Trade Estimator.
Goal: Create a professional, DETAILED estimate from rough notes.

${priceListSection}CONTEXT:
- Location: ${city}, ${country}
- Tax Rate: ${taxRate}%
- Business: ${businessName}
- ${projectContext}
${photoEstimateContext}

INPUT DATA:
- Text: Rough notes (English, Spanish, Korean, mixed slang)
- Images: Optional site photos
- Source language hint: ${sourceLanguage}

═══════════════════════════════════════
CRITICAL INSTRUCTIONS
═══════════════════════════════════════

1. 📋 ITEMIZATION (Professional Format):
   ALWAYS output items with separate category and unit fields.
   
   Categories:
   - "PARTS" - Physical materials/components
   - "LABOR" - Work hours/installation time  
   - "SERVICE" - Diagnostic, testing, permits, disposal
   - "OTHER" - Miscellaneous
   
   Units (choose appropriate):
   - "ea" - Each (for parts)
   - "LS" - Lump Sum (fixed price work)
   - "hr" - Hourly (for labor)
   - "day" - Daily rate
   - "SF" - Square Foot
   - "LF" - Linear Foot
   - "%" - Percentage

2. 👀 VISION ANALYSIS (If images provided):
   ✓ Identify visible Brands (Kohler, Moen), Materials (PEX, Copper), and Issues.
   ⚠️ ONLY state what is factually visible. Do not guess.

3. 🌐 LANGUAGE PROCESSING (Spanish/Korean/English):
   - The user is a professional working in North America.
   - **ASSUME ALL CURRENCY IS LOCAL (\${currencyCode}).**
   - ${getSourceLanguageGuidance(sourceLanguage)}
   - Translate Spanish or Korean trade terms into professional English.
   - Keep customer-facing output in English for all fields.
   - Preserve trade intent over literal wording.
   - Common Spanish field terms may include: "fuga", "llave angular", "desague", "tomacorriente", "interruptor", "condensador", "mano de obra".
   - Common Korean field terms may include: "누수", "배관", "수전", "차단기", "콘센트", "배수", "노무".
   - Do NOT perform currency exchange calculations.

4. ✍️ PROFESSIONALIZATION (The "Expensive" Touch):
   ❌ "fix leak" → ✅ category:"LABOR", description:"Hydraulic Seal Replacement & Pressure Test"
   ❌ "new faucet" → ✅ category:"PARTS", description:"Kitchen Faucet (Chrome Finish)"

5. 🛡️ PRICING LOGIC:
   - IF price provided: Distribute across parts/labor/service logically.
   - IF price missing: Estimate using **Canadian market pricing (CAD)**.
   - Reference pricing: Home Depot Canada, Rona, Home Hardware, Canadian Tire.
   - Labor rates: Based on Canadian provincial averages ($60-$120/hr depending on trade).
   - IF price > $5,000: Add warning "High-value estimate - please verify".

6. 💸 AUTO-UPSELL OPTIONS (Good-Better-Best):
   - Generate up to 2 optional upsell packages in "upsellOptions".
   - Allowed tiers: "better", "best".
   - Each option must include:
     - "tier"
     - "title"
     - "description"
     - "addedItems" (same schema as regular items)
   - Keep upsell realistic and relevant to the original scope.
   - If no strong upsell exists, return "upsellOptions: []".

7. 🇨🇦/🇺🇸 REGIONAL FORMATTING:
   IF Canada: "Labour", "HST/GST applies", use CAD pricing
   IF USA: "Labor", "Sales tax applies", use USD pricing

═══════════════════════════════════════
OUTPUT FORMAT (JSON ONLY)
═══════════════════════════════════════
Response must be raw JSON. Use the new professional format:

{
  "items": [
    {
      "id": "item-1",
      "itemNumber": 1,
      "category": "PARTS",
      "description": "Kitchen Faucet (Chrome Finish)",
      "quantity": 1,
      "unit": "ea",
      "unit_price": 180.00
    },
    {
      "id": "item-2", 
      "itemNumber": 2,
      "category": "LABOR",
      "description": "Faucet Installation & Testing",
      "quantity": 2,
      "unit": "hr",
      "unit_price": 75.00
    },
    {
      "id": "item-3",
      "itemNumber": 3,
      "category": "SERVICE",
      "description": "Permit Fee",
      "quantity": 1,
      "unit": "LS",
      "unit_price": 50.00
    }
  ],
  "summary_note": "Concise scope summary.",
  "payment_terms": "\${country === 'Canada' ? 'Payment due upon completion. E-transfer or credit card accepted. HST applies.' : 'Payment due upon completion. Check, Zelle, or card accepted.'}",
  "closing_note": "Thank you for choosing \${businessName}. We stand behind our work with a 90-day guarantee.",
  "warnings": [],
  "upsellOptions": [
    {
      "tier": "better",
      "title": "Performance Upgrade",
      "description": "Add higher-efficiency components for longer service life.",
      "addedItems": [
        {
          "id": "upsell-1",
          "itemNumber": 1,
          "category": "PARTS",
          "description": "Premium-grade replacement component",
          "quantity": 1,
          "unit": "ea",
          "unit_price": 185.00
        }
      ]
    },
    {
      "tier": "best",
      "title": "Protection + Priority Package",
      "description": "Includes premium materials plus priority support.",
      "addedItems": [
        {
          "id": "upsell-2",
          "itemNumber": 1,
          "category": "SERVICE",
          "description": "Extended workmanship warranty add-on",
          "quantity": 1,
          "unit": "LS",
          "unit_price": 240.00
        }
      ]
    }
  ]${workflow === "photo_estimate" ? `,
  "photoAnalysis": {
    "observations": ["Observed condition from the photos"],
    "suggestedScope": ["Scope bullet the contractor should review"],
    "materialSuggestions": [
      {
        "label": "Suggested material",
        "quantity": 1,
        "unit": "ea",
        "reason": "Why the photo suggests this material"
      }
    ],
    "pricingConfidence": "medium"
  }` : ""}
}

TONE: Professional, confident, sales-oriented. Sound like a trusted expert.
`.trim()
}

async function resolveGeneratePlanTier(
    userId: string
): Promise<{ ok: true; planTier: string } | { ok: false; status: number; error: string }> {
    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return {
            ok: false,
            status: 500,
            error: "Supabase service configuration is missing.",
        }
    }

    const { data, error } = await supabase
        .from("profiles")
        .select("plan_tier, stripe_subscription_status, referral_trial_ends_at, referral_bonus_ends_at")
        .eq("id", userId)
        .maybeSingle()

    if (error) {
        return {
            ok: false,
            status: 500,
            error: error.message || "Failed to resolve plan tier",
        }
    }

    return {
        ok: true,
        planTier: resolveEffectivePlanTier(data || {}),
    }
}

export async function POST(req: Request) {
    try {
        const parsedPayload = await parseJsonRequest(req, generateRequestSchema)
        if (!parsedPayload.ok) {
            return parsedPayload.response
        }

        const {
            images,
            notes,
            sourceLanguage,
            userProfile,
            projectType,
            workflow = "standard",
            photoContext,
        } = parsedPayload.data

        if (workflow === "photo_estimate" && (!images || images.length === 0)) {
            return NextResponse.json(
                { error: "At least one jobsite photo is required for photo estimate mode." },
                { status: 400 }
            )
        }

        if (workflow === "photo_estimate") {
            const auth = await requireAuthenticatedUser(req)
            if (!auth.ok) {
                return NextResponse.json(
                    { error: "Log in required for photo estimate mode." },
                    { status: 401 }
                )
            }

            const planTierResult = await resolveGeneratePlanTier(auth.userId)
            if (!planTierResult.ok) {
                return NextResponse.json(
                    { error: planTierResult.error },
                    { status: planTierResult.status }
                )
            }

            if (!PRO_TIERS.has(planTierResult.planTier)) {
                return NextResponse.json(
                    { error: "Photo estimate mode requires a Pro or Team plan." },
                    { status: 402 }
                )
            }
        }

        const quota = await enforceUsageQuota(req, "generate", { requireAuth: false })
        if (!quota.ok) {
            return NextResponse.json(
                {
                    error: quota.error || "Free plan limit reached",
                    code: "FREE_PLAN_LIMIT_REACHED",
                    metric: "generate",
                    usage: quota.used,
                    limit: quota.limit,
                },
                { status: quota.status || 402 }
            )
        }

        const ip = getClientIp(req)
        if (quota.isAnonymous && workflow !== "photo_estimate") {
            const anonymousQuota = await checkRateLimit({
                key: `generate:anonymous:${ip}`,
                limit: ANONYMOUS_GENERATE_LIMIT,
                windowMs: ANONYMOUS_GENERATE_WINDOW_MS,
            })

            if (!anonymousQuota.allowed) {
                const used = ANONYMOUS_GENERATE_LIMIT - Math.max(0, anonymousQuota.remaining ?? 0)
                return NextResponse.json(
                    {
                        error: "Anonymous trial limit reached. Sign in to continue generating estimates.",
                        code: "FREE_PLAN_LIMIT_REACHED",
                        metric: "generate",
                        usage: used,
                        limit: ANONYMOUS_GENERATE_LIMIT,
                    },
                    { status: 402 }
                )
            }
        }

        const rateLimit = await checkRateLimit({
            key: `generate:${ip}`,
            limit: GENERATE_RATE_LIMIT_MAX,
            windowMs: GENERATE_RATE_LIMIT_WINDOW_MS,
        })

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: "Too many requests. Please wait and try again." },
                { status: 429 }
            )
        }

        // Use provided userProfile or defaults
        const profile = userProfile || {}
        const systemPrompt = getSystemPromptV5(
            profile,
            projectType,
            sourceLanguage || "auto",
            workflow,
            photoContext || ""
        )

        const provider = resolveGenerateProvider()
        const modelResult =
            provider === "gemini"
                ? await generateWithGemini({ systemPrompt, notes, images })
                : await generateWithOpenAI({ systemPrompt, notes, images })

        const rawEstimate = parsePotentialJsonContent(modelResult.content)
        const estimate = normalizeEstimatePayload(rawEstimate)

        await recordUsage(quota.context, "generate", {
            promptTokens: modelResult.promptTokens,
            completionTokens: modelResult.completionTokens,
        })

        return NextResponse.json(estimate)
    } catch (error) {
        console.error("Error generating estimate:", error)
        return NextResponse.json(
            { error: "Failed to generate estimate" },
            { status: 500 }
        )
    }
}

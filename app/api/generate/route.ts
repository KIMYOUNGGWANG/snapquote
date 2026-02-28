import { OpenAI } from "openai"
import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { enforceUsageQuota, recordUsage } from "@/lib/server/usage-quota"

type UserMessageContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }

type NormalizedUpsellOption = {
    tier: "better" | "best"
    title: string
    description: string
    addedItems: Array<ReturnType<typeof normalizeItem>>
}

type NormalizedEstimate = {
    items: Array<ReturnType<typeof normalizeItem>>
    sections?: Array<{
        id: string
        name: string
        divisionCode?: string
        items: Array<ReturnType<typeof normalizeItem>>
    }>
    summary_note: string
    payment_terms: string
    closing_note: string
    warnings: string[]
    upsellOptions?: NormalizedUpsellOption[]
}

type ModelGenerationResult = {
    content: string
    promptTokens: number
    completionTokens: number
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

const OPENAI_GENERATE_MODEL = process.env.OPENAI_GENERATE_MODEL?.trim() || "gpt-4o"
const GEMINI_GENERATE_MODEL = process.env.GEMINI_GENERATE_MODEL?.trim() || "gemini-2.5-flash"
const GENERATE_PROVIDER = process.env.GENERATE_AI_PROVIDER?.trim().toLowerCase() || "auto"

function toFiniteNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return fallback
}

function normalizeItem(item: any, index: number) {
    const quantity = toFiniteNumber(item?.quantity, 1)
    const unitPrice = toFiniteNumber(item?.unit_price, 0)
    const total = toFiniteNumber(item?.total, quantity * unitPrice)

    return {
        id: typeof item?.id === "string" && item.id.trim() ? item.id : `item-${index + 1}`,
        itemNumber: Math.max(1, Math.floor(toFiniteNumber(item?.itemNumber, index + 1))),
        category: typeof item?.category === "string" && item.category.trim() ? item.category : "PARTS",
        description: typeof item?.description === "string" ? item.description.trim() : "",
        quantity,
        unit: typeof item?.unit === "string" && item.unit.trim() ? item.unit : "ea",
        unit_price: unitPrice,
        total,
    }
}

function normalizeUpsellTier(value: unknown, fallback: "better" | "best"): "better" | "best" {
    if (typeof value !== "string") return fallback
    const normalized = value.trim().toLowerCase()
    if (normalized === "better" || normalized === "best") {
        return normalized
    }
    return fallback
}

function normalizeUpsellOptions(rawOptions: unknown): NormalizedUpsellOption[] {
    if (!Array.isArray(rawOptions)) return []

    return rawOptions
        .map((option: any, optionIndex: number) => {
            const fallbackTier = optionIndex === 0 ? "better" : "best"
            const tier = normalizeUpsellTier(option?.tier, fallbackTier)
            const title =
                typeof option?.title === "string" && option.title.trim()
                    ? option.title.trim()
                    : tier === "better"
                        ? "Better Option"
                        : "Best Option"
            const description =
                typeof option?.description === "string" ? option.description.trim() : ""

            const addedItems = (Array.isArray(option?.addedItems) ? option.addedItems : [])
                .map((item: any, itemIndex: number) => normalizeItem(item, itemIndex))
                .filter((item: any) => item.description !== "")

            if (addedItems.length === 0) {
                return null
            }

            return {
                tier,
                title,
                description,
                addedItems,
            }
        })
        .filter((option): option is NormalizedUpsellOption => option !== null)
}

function parsePotentialJsonContent(input: string): any {
    const trimmed = input.trim()
    if (!trimmed) throw new Error("Model response is empty")

    try {
        return JSON.parse(trimmed)
    } catch {
        const unwrapped = trimmed
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim()
        return JSON.parse(unwrapped)
    }
}

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

function extractGeminiText(responseBody: any): string {
    const candidates = Array.isArray(responseBody?.candidates) ? responseBody.candidates : []
    const firstCandidate = candidates[0]
    const parts = Array.isArray(firstCandidate?.content?.parts) ? firstCandidate.content.parts : []

    const text = parts
        .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
        .find((value: string) => value.trim().length > 0)

    if (text && text.trim()) {
        return text
    }

    const blockReason = responseBody?.promptFeedback?.blockReason
    if (typeof blockReason === "string" && blockReason.trim()) {
        throw new Error(`Gemini blocked the request: ${blockReason}`)
    }

    throw new Error("Gemini returned empty content")
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

    const parts: any[] = []

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

    const content = extractGeminiText(payload)
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

function normalizeEstimate(rawEstimate: any): NormalizedEstimate {
    const normalizedItems = (Array.isArray(rawEstimate?.items) ? rawEstimate.items : [])
        .map((item: any, index: number) => normalizeItem(item, index))
        .filter((item: any) => item.description !== "")

    const normalizedSections = (Array.isArray(rawEstimate?.sections) ? rawEstimate.sections : [])
        .map((section: any, sectionIndex: number) => {
            const sectionItems = (Array.isArray(section?.items) ? section.items : [])
                .map((item: any, itemIndex: number) => normalizeItem(item, itemIndex))
                .filter((item: any) => item.description !== "")

            return {
                id:
                    typeof section?.id === "string" && section.id.trim()
                        ? section.id
                        : `section-${sectionIndex + 1}`,
                name:
                    typeof section?.name === "string" && section.name.trim()
                        ? section.name.trim()
                        : `Section ${sectionIndex + 1}`,
                divisionCode:
                    typeof section?.divisionCode === "string" && section.divisionCode.trim()
                        ? section.divisionCode.trim()
                        : undefined,
                items: sectionItems,
            }
        })
        .filter((section: any) => section.items.length > 0)

    const warnings = Array.isArray(rawEstimate?.warnings)
        ? rawEstimate.warnings
            .filter((warning: any) => typeof warning === "string" && warning.trim())
            .map((warning: string) => warning.trim())
        : []
    const upsellOptions = normalizeUpsellOptions(rawEstimate?.upsellOptions)

    return {
        items: normalizedItems,
        ...(normalizedSections.length > 0 ? { sections: normalizedSections } : {}),
        summary_note: typeof rawEstimate?.summary_note === "string" ? rawEstimate.summary_note : "",
        payment_terms: typeof rawEstimate?.payment_terms === "string" ? rawEstimate.payment_terms : "",
        closing_note: typeof rawEstimate?.closing_note === "string" ? rawEstimate.closing_note : "",
        warnings,
        ...(upsellOptions.length > 0 ? { upsellOptions } : {}),
    }
}

// V5 LITE - Optimized System Prompt (650 tokens, 100/100 score)
function getSystemPromptV5(userProfile: {
    city?: string
    country?: string
    taxRate?: number
    businessName?: string
    priceList?: string  // Price list formatted for prompt
}, projectType: 'residential' | 'commercial' = 'residential') {
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

    return `
You are an expert North American Trade Estimator.
Goal: Create a professional, DETAILED estimate from rough notes.

${priceListSection}CONTEXT:
- Location: ${city}, ${country}
- Tax Rate: ${taxRate}%
- Business: ${businessName}
- ${projectContext}

INPUT DATA:
- Text: Rough notes (English, Korean, mixed slang)
- Images: Optional site photos

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

3. 🌐 LANGUAGE PROCESSING (Korean/English):
   - The user is a professional working in North America.
   - **ASSUME ALL CURRENCY IS LOCAL (\${currencyCode}).**
   - Translate Korean terms to Professional English.
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
  ]
}

TONE: Professional, confident, sales-oriented. Sound like a trusted expert.
`.trim()
}

export async function POST(req: Request) {
    try {
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

        const { images, notes, userProfile, projectType } = await req.json()
        const ip = getClientIp(req)
        const rateLimit = await checkRateLimit({
            key: `generate:${ip}`,
            limit: 20,
            windowMs: 10 * 60 * 1000,
        })

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: "Too many requests. Please wait and try again." },
                { status: 429 }
            )
        }

        if (notes && (typeof notes !== "string" || notes.length > 8000)) {
            return NextResponse.json(
                { error: "Invalid notes input" },
                { status: 400 }
            )
        }

        if (images !== undefined) {
            if (!Array.isArray(images) || images.length > 8) {
                return NextResponse.json(
                    { error: "Invalid images input" },
                    { status: 400 }
                )
            }

            const hasInvalidImage = images.some((image) =>
                typeof image !== "string" || image.length > 2_000_000
            )

            if (hasInvalidImage) {
                return NextResponse.json(
                    { error: "Invalid image payload" },
                    { status: 400 }
                )
            }
        }

        // Use provided userProfile or defaults
        const profile = userProfile || {}
        const systemPrompt = getSystemPromptV5(profile, projectType)

        const provider = resolveGenerateProvider()
        const modelResult =
            provider === "gemini"
                ? await generateWithGemini({ systemPrompt, notes, images })
                : await generateWithOpenAI({ systemPrompt, notes, images })

        const rawEstimate = parsePotentialJsonContent(modelResult.content)
        const estimate = normalizeEstimate(rawEstimate)

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

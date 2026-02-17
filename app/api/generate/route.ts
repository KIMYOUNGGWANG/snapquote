import { OpenAI } from "openai"
import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { enforceUsageQuota, recordUsage } from "@/lib/server/usage-quota"

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

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

6. 🇨🇦/🇺🇸 REGIONAL FORMATTING:
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
  "warnings": []
}

TONE: Professional, confident, sales-oriented. Sound like a trusted expert.
`.trim()
}

export async function POST(req: Request) {
    try {
        const quota = await enforceUsageQuota(req, "generate", { requireAuth: true })
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

        const userMessageContent: any[] = []

        if (notes) {
            userMessageContent.push({ type: "text", text: `Field Notes:\n${notes}` })
        } else {
            userMessageContent.push({ type: "text", text: "Please generate an estimate based on the attached images." })
        }

        if (images && Array.isArray(images)) {
            images.forEach((imageUrl: string) => {
                userMessageContent.push({
                    type: "image_url",
                    image_url: {
                        url: imageUrl,
                    },
                })
            })
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
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

        const estimate = JSON.parse(content)

        // Process items
        if (estimate.items) {
            // Filter out items with empty descriptions
            estimate.items = estimate.items.filter((item: any) =>
                item.description && item.description.trim() !== ''
            )

            // Calculate totals
            estimate.items.forEach((item: any) => {
                if (item.total === undefined) {
                    item.total = item.quantity * item.unit_price
                }
            })
        }

        // Ensure warnings array exists
        if (!estimate.warnings) {
            estimate.warnings = []
        }

        await recordUsage(quota.context, "generate", {
            promptTokens: response.usage?.prompt_tokens || 0,
            completionTokens: response.usage?.completion_tokens || 0,
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

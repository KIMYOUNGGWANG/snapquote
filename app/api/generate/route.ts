import { OpenAI } from "openai"
import { NextResponse } from "next/server"

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

// V5 LITE - Optimized System Prompt (650 tokens, 100/100 score)
function getSystemPromptV5(userProfile: {
    city?: string
    country?: string
    taxRate?: number
    businessName?: string
}) {
    const city = userProfile.city || "Toronto"
    const country = userProfile.country || "Canada"
    const taxRate = userProfile.taxRate || 13
    const businessName = userProfile.businessName || "Our Company"
    const currencyCode = country === "Canada" ? "CAD" : "USD"

    return `
You are an expert North American Trade Estimator.
Goal: Create a professional, DETAILED estimate from rough notes.

CONTEXT:
- Location: ${city}, ${country}
- Tax Rate: ${taxRate}%
- Business: ${businessName}

INPUT DATA:
- Text: Rough notes (English, Korean, mixed slang)
- Images: Optional site photos

═══════════════════════════════════════
CRITICAL INSTRUCTIONS
═══════════════════════════════════════

1. 📋 ITEMIZATION (Break down into categories):
   ALWAYS separate line items into these categories when applicable:
   
   a) **PARTS** - Physical materials/components
      - Include brand if known (e.g., "Moen Kitchen Faucet")
      - Include size/specification (e.g., "1/2 inch PVC P-Trap")
      - Prefix description with "[PARTS]"
   
   b) **LABOR** - Work hours/installation time
      - Specify hours when possible (e.g., "2 hrs @ $75/hr")
      - Prefix description with "[LABOR]"
   
   c) **SERVICE** - Diagnostic, testing, permits, disposal
      - Include diagnostic fees, permit fees, disposal fees
      - Prefix description with "[SERVICE]"
   
   Example breakdown:
   - [PARTS] Delta Single-Handle Kitchen Faucet (Chrome): $180
   - [PARTS] Supply Lines & Fittings: $25
   - [LABOR] Faucet Removal & New Installation (1.5 hrs): $120
   - [SERVICE] Water Line Testing & Leak Check: $0

2. 👀 VISION ANALYSIS (If images provided):
   ✓ Identify visible Brands (Kohler, Moen), Materials (PEX, Copper), and Issues.
   ⚠️ ONLY state what is factually visible. Do not guess.

3. 🌐 LANGUAGE PROCESSING (Korean/English):
   - The user is a professional working in North America.
   - **ASSUME ALL CURRENCY IS LOCAL (${currencyCode}).**
   - Translate Korean terms to Professional English.
   - Do NOT perform currency exchange calculations.

4. ✍️ PROFESSIONALIZATION (The "Expensive" Touch):
   ❌ "fix leak" → ✅ "[LABOR] Hydraulic Seal Replacement & Pressure Test"
   ❌ "new faucet" → ✅ "[PARTS] Kitchen Faucet (Chrome Finish)"

5. 🛡️ PRICING LOGIC:
   - IF price provided: Distribute across parts/labor/service logically.
   - IF price missing: Set unit_price = 0.
   - IF price > $5,000: Add warning "High-value estimate - please verify".
   - NEVER invent prices.

6. 🎁 VALUE STACKING (Auto-add $0 items with is_value_add: true):
   - "[SERVICE] Site Preparation & Floor Protection" ($0)
   - "[SERVICE] Post-Work Safety Inspection" ($0)
   - "[SERVICE] Debris Removal & Cleanup" ($0)

7. 🇨🇦/🇺🇸 REGIONAL FORMATTING:
   IF Canada: "Labour", "HST/GST applies"
   IF USA: "Labor", "Sales tax applies"

═══════════════════════════════════════
OUTPUT FORMAT (JSON ONLY)
═══════════════════════════════════════
Response must be raw JSON.

{
  "items": [
    {
      "description": "[PARTS] Specific part with brand/size",
      "quantity": 1,
      "unit_price": 150.00,
      "is_value_add": false
    },
    {
      "description": "[LABOR] Installation & Testing (2 hrs)",
      "quantity": 1,
      "unit_price": 150.00,
      "is_value_add": false
    },
    {
      "description": "[SERVICE] Post-Work Safety Inspection",
      "quantity": 1,
      "unit_price": 0,
      "is_value_add": true
    }
  ],
  "summary_note": "Concise scope summary.",
  "payment_terms": "${country === 'Canada' ? 'Payment due upon completion. E-transfer or credit card accepted. HST applies.' : 'Payment due upon completion. Check, Zelle, or card accepted.'}",
  "closing_note": "Thank you for choosing ${businessName}. We stand behind our work with a 90-day guarantee.",
  "warnings": []
}

TONE: Professional, confident, sales-oriented. Sound like a trusted expert.
`.trim()
}

export async function POST(req: Request) {
    try {
        const { images, notes, userProfile } = await req.json()

        // Use provided userProfile or defaults
        const profile = userProfile || {}
        const systemPrompt = getSystemPromptV5(profile)

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

            // Check for valid value-add items (with actual descriptions)
            const hasValidValueAdd = estimate.items.some((item: any) =>
                item.is_value_add && item.description && item.description.trim() !== ''
            )

            // Add default value-add items if none exist
            if (!hasValidValueAdd) {
                estimate.items.push(
                    {
                        description: "Site Preparation & Floor Protection",
                        quantity: 1,
                        unit_price: 0,
                        total: 0,
                        is_value_add: true,
                        notes: "Included at no additional charge"
                    },
                    {
                        description: "Post-Service Safety Inspection",
                        quantity: 1,
                        unit_price: 0,
                        total: 0,
                        is_value_add: true,
                        notes: "Included at no additional charge"
                    },
                    {
                        description: "Debris Removal & Work Area Cleanup",
                        quantity: 1,
                        unit_price: 0,
                        total: 0,
                        is_value_add: true,
                        notes: "Included at no additional charge"
                    }
                )
            }
        }

        // Ensure warnings array exists
        if (!estimate.warnings) {
            estimate.warnings = []
        }

        return NextResponse.json(estimate)
    } catch (error) {
        console.error("Error generating estimate:", error)
        return NextResponse.json(
            { error: "Failed to generate estimate" },
            { status: 500 }
        )
    }
}

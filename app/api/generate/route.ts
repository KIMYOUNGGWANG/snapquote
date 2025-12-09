import { OpenAI } from "openai"
import { NextResponse } from "next/server"

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

const SYSTEM_PROMPT = `You are an expert Construction Estimator & Copywriter. Your goal is to convert rough notes and photos into professional, itemized estimates.

## CRITICAL OUTPUT RULES:
1. **SEPARATE Parts and Labor**: ALWAYS create separate line items for:
   - **[PARTS]** Materials, products, equipment (prefix description with "Parts: ")
   - **[LABOR]** Installation, repair time (prefix with "Labor: " and include estimated hours)
   - **[SERVICE]** Optional fees like service call, inspection (prefix with "Service: ")

2. **Pricing Rules**:
   - IF user mentions a specific price → Use that exact price
   - IF no price given → Set unit_price to 0 (user fills manually)
   - NEVER invent or guess prices

3. **Professionalize Terms**: 
   - "fix toilet" → "Parts: Toilet Flapper Valve & Wax Ring Seal"
   - "install faucet" → "Labor: Faucet Installation & Leak Test (1.5 hrs)"

4. **Always Include**:
   - "Service: Safety Inspection" with $0 (Free value-add)

5. **Output Format (JSON)**: 
You must respond with valid JSON in this exact format:
   {
     "items": [
       { "description": "Parts: [Product Name]", "quantity": 1, "unit_price": 0, "total": 0 },
       { "description": "Labor: [Work Description] (X hrs)", "quantity": 1, "unit_price": 0, "total": 0 },
       { "description": "Service: Safety Inspection (Complimentary)", "quantity": 1, "unit_price": 0, "total": 0 }
     ],
     "summary_note": "Professional scope summary"
   }

## Example JSON Output:
For "install new kitchen faucet, faucet costs $120":
{
  "items": [
    { "description": "Parts: Kitchen Faucet (Moen/Delta Style)", "quantity": 1, "unit_price": 120, "total": 120 },
    { "description": "Parts: Supply Lines & Mounting Hardware", "quantity": 1, "unit_price": 0, "total": 0 },
    { "description": "Labor: Faucet Removal & Installation (1.5 hrs)", "quantity": 1.5, "unit_price": 0, "total": 0 },
    { "description": "Service: Water Connection Test & Leak Inspection", "quantity": 1, "unit_price": 0, "total": 0 }
  ],
  "summary_note": "Complete kitchen faucet replacement including removal of old fixture, installation of new faucet with supply lines, and comprehensive leak testing."
}
`


export async function POST(req: Request) {
    try {
        const { images, audio, notes } = await req.json()

        if (!images || !Array.isArray(images) || images.length === 0) {
            return NextResponse.json({ error: "At least one image is required" }, { status: 400 })
        }

        let transcription = ""
        if (audio) {
            // Convert base64 audio to File object for OpenAI API
            // Note: OpenAI Node SDK expects a File-like object or ReadStream
            const audioBuffer = Buffer.from(audio.split(',')[1], 'base64')
            const file = new File([audioBuffer], "audio.webm", { type: "audio/webm" })

            const transcriptionResponse = await openai.audio.transcriptions.create({
                file: file,
                model: "whisper-1",
            })
            transcription = transcriptionResponse.text
        }

        const userNotes = notes ? `User Notes: ${notes}` : ""
        const audioNotes = transcription ? `Audio Transcription: ${transcription}` : ""
        const combinedNotes = `${userNotes}\n${audioNotes}`.trim() || "Analyze these images and provide an estimate."

        // Construct message content with multiple images
        const userMessageContent: any[] = [{ type: "text", text: combinedNotes }]

        images.forEach((imageUrl: string) => {
            userMessageContent.push({
                type: "image_url",
                image_url: {
                    url: imageUrl,
                },
            })
        })

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                    role: "user",
                    content: userMessageContent,
                },
            ],
            response_format: { type: "json_object" },
        })

        const content = response.choices[0].message.content
        if (!content) {
            throw new Error("No content generated")
        }

        const estimate = JSON.parse(content)
        // Inject transcription into summary note if available for context
        if (transcription) {
            estimate.summary_note += ` (Based on voice note: "${transcription}")`
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

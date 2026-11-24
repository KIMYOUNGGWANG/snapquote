import { NextResponse } from "next/server"
import { OpenAI } from "openai"
import { parsePotentialJsonContent } from "@/lib/ai/json"
import { buildDiagnoseSystemPrompt, buildDiagnoseUserText, normalizeAiDiagnosis } from "@/lib/ai/diagnose-prompt"
import { DIAGNOSIS_DISCLAIMER, diagnoseRequestSchema } from "@/lib/customer-requests"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { loadPublicContractor, signDiagnosis } from "@/lib/server/customer-requests"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"

const HOUR_MS = 60 * 60 * 1000
// 3 photos x 400,000 chars + JSON overhead. Vercel caps bodies at 4.5MB anyway.
const MAX_BODY_BYTES = 1_300_000
const OPENAI_DIAGNOSE_MODEL = process.env.OPENAI_DIAGNOSE_MODEL?.trim() || "gpt-4o-mini"

function extractMessageContent(content: unknown): string {
    if (typeof content === "string") return content
    if (Array.isArray(content)) {
        return content
            .map((part: Record<string, unknown>) => (typeof part?.text === "string" ? part.text : ""))
            .join("\n")
            .trim()
    }
    return ""
}

/** Public: a homeowner's photos → likely cause, urgency, price range. Nothing is stored. */
export async function POST(request: Request) {
    const ipLimit = await checkRateLimit({ key: `public-diagnose:ip:${getClientIp(request)}`, limit: 10, windowMs: HOUR_MS })
    if (!ipLimit.allowed) {
        return NextResponse.json({ error: "Too many photo checks. Try again in an hour." }, { status: 429 })
    }

    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
        return NextResponse.json({ error: "Photos are too large" }, { status: 413 })
    }

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const parsed = diagnoseRequestSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json({ error: "Add 1 to 3 photos (JPEG, PNG or WebP) and pick an area." }, { status: 400 })
    }
    const { slug, space, note, photos } = parsed.data

    // Per link too, so rotating IPs cannot run up one contractor's AI bill.
    const slugLimit = await checkRateLimit({ key: `public-diagnose:slug:${slug}`, limit: 60, windowMs: HOUR_MS })
    if (!slugLimit.allowed) {
        return NextResponse.json({ error: "This link is busy right now. Try again later." }, { status: 429 })
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 500 })
    const contractor = await loadPublicContractor(supabase, slug)
    if (!contractor) return NextResponse.json({ error: "This request link does not exist." }, { status: 404 })

    const promptInput = { businessName: contractor.businessName, businessAddress: contractor.address, space, note }
    try {
        const completion = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat.completions.create({
            model: OPENAI_DIAGNOSE_MODEL,
            messages: [
                { role: "system", content: buildDiagnoseSystemPrompt(promptInput) },
                {
                    role: "user",
                    content: [
                        { type: "text", text: buildDiagnoseUserText(promptInput) },
                        ...photos.map((url) => ({ type: "image_url" as const, image_url: { url } })),
                    ],
                },
            ],
            temperature: 0.2,
            max_tokens: 600,
            response_format: { type: "json_object" },
        })

        const raw = extractMessageContent(completion.choices?.[0]?.message?.content)
        const diagnosis = raw ? normalizeAiDiagnosis(parsePotentialJsonContent(raw, { emptyMessage: "Empty AI response" })) : null
        if (!diagnosis) {
            return NextResponse.json({ error: "We could not read a repair problem in these photos. Try a closer, brighter photo." }, { status: 502 })
        }

        const shown = contractor.hidePriceRange ? { ...diagnosis, priceRange: undefined } : diagnosis
        const diagnosisToken = signDiagnosis({ slug, diagnosis: shown, photos })
        if (!diagnosisToken) return NextResponse.json({ error: "Not configured" }, { status: 500 })

        return NextResponse.json({
            ok: true,
            diagnosis: shown,
            diagnosisToken,
            priceRangeHidden: contractor.hidePriceRange,
            disclaimer: DIAGNOSIS_DISCLAIMER,
        })
    } catch (error) {
        console.error("[public/diagnose] Error:", error instanceof Error ? error.message : error)
        return NextResponse.json({ error: "Photo check failed. Please try again." }, { status: 502 })
    }
}

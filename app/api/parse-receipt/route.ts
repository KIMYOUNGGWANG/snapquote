import { OpenAI } from "openai"
import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 20
const OPENAI_RECEIPT_MODEL = process.env.OPENAI_RECEIPT_MODEL?.trim() || "gpt-4o-mini"
const PRO_TIERS = new Set(["pro", "team"])

type ChatMessagePart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }

type NormalizedParsedReceiptItem = {
    id: string
    description: string
    quantity: number
    unit_price: number
    total: number
    confidence_score: number
    original_text?: string
}

type NormalizedParsedReceipt = {
    ok: true
    vendorName?: string
    date?: string
    subtotal: number
    tax: number
    total: number
    items: NormalizedParsedReceiptItem[]
    warnings?: string[]
}

function toFiniteNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return fallback
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function toTrimmedString(value: unknown, maxLength: number): string {
    if (typeof value !== "string") return ""
    return value.trim().slice(0, maxLength)
}

function parsePotentialJsonContent(input: string): any {
    const trimmed = input.trim()
    if (!trimmed) {
        throw new Error("Parse provider returned empty content")
    }

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

function extractMessageContent(content: unknown): string {
    if (typeof content === "string") return content
    if (Array.isArray(content)) {
        return content
            .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
            .join("\n")
            .trim()
    }
    return ""
}

function dedupeWarnings(input: string[]): string[] {
    const seen = new Set<string>()
    const warnings: string[] = []
    for (const value of input) {
        const warning = value.trim()
        if (!warning) continue
        if (seen.has(warning)) continue
        seen.add(warning)
        warnings.push(warning)
    }
    return warnings
}

function normalizeParsedReceipt(raw: any): NormalizedParsedReceipt {
    const rawItems = Array.isArray(raw?.items) ? raw.items : []
    const modelWarnings = Array.isArray(raw?.warnings)
        ? raw.warnings
            .filter((warning: unknown) => typeof warning === "string")
            .map((warning: string) => warning.trim())
            .filter(Boolean)
        : []

    const lowConfidenceWarnings: string[] = []
    const items: NormalizedParsedReceiptItem[] = rawItems
        .map((item: any, index: number) => {
            const description = toTrimmedString(item?.description, 320)
            if (!description) return null

            const rawQuantity = toFiniteNumber(item?.quantity, 1)
            const quantity = rawQuantity > 0 ? rawQuantity : 1

            const unitPrice = Math.max(0, toFiniteNumber(item?.unit_price, 0))
            const fallbackTotal = quantity * unitPrice
            const normalizedTotal = toFiniteNumber(item?.total, fallbackTotal)
            const total = normalizedTotal >= 0 ? normalizedTotal : fallbackTotal

            const confidenceScore = clamp(toFiniteNumber(item?.confidence_score, 0.5), 0, 1)
            if (confidenceScore < 0.8) {
                lowConfidenceWarnings.push(`Low confidence parse: "${description}"`)
            }

            const id = toTrimmedString(item?.id, 64) || `receipt-item-${index + 1}`
            const originalText = toTrimmedString(item?.original_text, 320)

            return {
                id,
                description,
                quantity,
                unit_price: unitPrice,
                total,
                confidence_score: confidenceScore,
                ...(originalText ? { original_text: originalText } : {}),
            }
        })
        .filter((item: NormalizedParsedReceiptItem | null): item is NormalizedParsedReceiptItem => item !== null)

    const subtotal = Math.max(0, toFiniteNumber(raw?.subtotal, 0))
    const tax = Math.max(0, toFiniteNumber(raw?.tax, 0))
    const fallbackTotal = subtotal + tax
    const total = Math.max(0, toFiniteNumber(raw?.total, fallbackTotal))

    const vendorName = toTrimmedString(raw?.vendorName, 120)
    const date = toTrimmedString(raw?.date, 40)
    const warnings = dedupeWarnings([...modelWarnings, ...lowConfidenceWarnings])

    return {
        ok: true,
        ...(vendorName ? { vendorName } : {}),
        ...(date ? { date } : {}),
        subtotal,
        tax,
        total,
        items,
        ...(warnings.length > 0 ? { warnings } : {}),
    }
}

async function fileToDataUrl(file: File): Promise<string> {
    const mimeType = toTrimmedString(file.type, 120) || "application/octet-stream"
    const bytes = Buffer.from(await file.arrayBuffer())
    const base64 = bytes.toString("base64")
    return `data:${mimeType};base64,${base64}`
}

function buildSystemPrompt(context: string): string {
    const contextHint = context
        ? `Context hint: ${context}\n`
        : ""

    return [
        "You extract structured material line items from receipt/cart images.",
        "Return strict JSON only (no markdown).",
        "JSON shape:",
        `{
  "vendorName": string?,
  "date": string?,
  "subtotal": number,
  "tax": number,
  "total": number,
  "items": [
    {
      "id": string?,
      "description": string,
      "quantity": number,
      "unit_price": number,
      "total": number,
      "confidence_score": number,
      "original_text": string?
    }
  ],
  "warnings": string[]?
}`,
        "Rules:",
        "- Keep descriptions concise and trade-ready.",
        "- confidence_score must be 0.0 to 1.0.",
        "- If fields are unknown, use sensible numeric defaults and add a warning.",
        contextHint,
    ].join("\n")
}

async function resolvePlanTier(
    supabase: any,
    userId: string
): Promise<{ planTier: string; error: string | null }> {
    const { data, error } = await supabase
        .from("profiles")
        .select("plan_tier")
        .eq("id", userId)
        .maybeSingle()

    if (error) {
        return {
            planTier: "free",
            error: error.message || "Failed to resolve plan tier",
        }
    }

    return {
        planTier: toTrimmedString(data?.plan_tier, 24).toLowerCase() || "free",
        error: null,
    }
}

export async function POST(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `parse-receipt:${auth.userId}:${ip}`,
        limit: RATE_LIMIT_MAX,
        windowMs: RATE_LIMIT_WINDOW_MS,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: "Too many requests. Please try again later." },
            { status: 429 }
        )
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json(
            { error: "Supabase service configuration is missing." },
            { status: 500 }
        )
    }

    const tier = await resolvePlanTier(supabase, auth.userId)
    if (tier.error) {
        return NextResponse.json(
            { error: tier.error },
            { status: 500 }
        )
    }

    if (!PRO_TIERS.has(tier.planTier)) {
        return NextResponse.json(
            { error: "Receipt parser requires Pro or Team plan." },
            { status: 402 }
        )
    }

    let formData: FormData
    try {
        formData = await req.formData()
    } catch {
        return NextResponse.json(
            { error: "Invalid multipart form payload" },
            { status: 400 }
        )
    }

    const file = formData.get("file")
    if (!(file instanceof File)) {
        return NextResponse.json(
            { error: "No file provided" },
            { status: 400 }
        )
    }

    if (!file.type.startsWith("image/")) {
        return NextResponse.json(
            { error: "Invalid file type" },
            { status: 400 }
        )
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
            { error: "Image file too large" },
            { status: 413 }
        )
    }

    const context = toTrimmedString(formData.get("context"), 500)

    try {
        const imageDataUrl = await fileToDataUrl(file)
        const systemPrompt = buildSystemPrompt(context)

        const messageContent: ChatMessagePart[] = [
            {
                type: "text",
                text: context
                    ? `Parse this receipt image. Context: ${context}`
                    : "Parse this receipt image.",
            },
            {
                type: "image_url",
                image_url: { url: imageDataUrl },
            },
        ]

        const completion = await openai.chat.completions.create({
            model: OPENAI_RECEIPT_MODEL,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: messageContent as any },
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 1400,
        })

        const content = extractMessageContent(completion.choices?.[0]?.message?.content)
        if (!content) {
            throw new Error("Parse provider returned empty message")
        }

        const parsed = parsePotentialJsonContent(content)
        const normalized = normalizeParsedReceipt(parsed)

        if (normalized.items.length === 0) {
            return NextResponse.json(
                { error: "No parsable line items found" },
                { status: 422 }
            )
        }

        return NextResponse.json(normalized)
    } catch (error: any) {
        console.error("Parse receipt error:", error)
        return NextResponse.json(
            { error: "Failed to parse receipt" },
            { status: 500 }
        )
    }
}

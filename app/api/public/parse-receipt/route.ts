import { NextResponse } from "next/server"
import { OpenAI } from "openai"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000 // 1 day
const RATE_LIMIT_MAX = 2 // Strict: 2 per IP per day
const OPENAI_RECEIPT_MODEL = process.env.OPENAI_RECEIPT_MODEL?.trim() || "gpt-4o-mini"

type ChatMessagePart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }

function toFiniteNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return fallback
}

function toTrimmedString(value: unknown, maxLength: number): string {
    if (typeof value !== "string") return ""
    return value.trim().slice(0, maxLength)
}

function parsePotentialJsonContent(input: string): unknown {
    const trimmed = input.trim()
    if (!trimmed) throw new Error("Empty AI response")

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
            .map((part: Record<string, unknown>) => (typeof part?.text === "string" ? part.text : ""))
            .join("\n")
            .trim()
    }
    return ""
}

async function fileToDataUrl(file: File): Promise<string> {
    const mimeType = toTrimmedString(file.type, 120) || "application/octet-stream"
    const bytes = Buffer.from(await file.arrayBuffer())
    const base64 = bytes.toString("base64")
    return `data:${mimeType};base64,${base64}`
}

export async function POST(request: Request) {
    try {
        const clientIp = getClientIp(request)

        // Strict IP-based rate limiting
        const rateLimitResult = await checkRateLimit({
            key: `public-parse-receipt:${clientIp}`,
            limit: RATE_LIMIT_MAX,
            windowMs: RATE_LIMIT_WINDOW_MS,
        })

        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                { error: "Daily limit reached (2 free scans per day). Sign up for unlimited access!" },
                { status: 429 }
            )
        }

        const contentType = request.headers.get("content-type") || ""
        if (!contentType.includes("multipart/form-data")) {
            return NextResponse.json(
                { error: "Expected multipart/form-data" },
                { status: 400 }
            )
        }

        const formData = await request.formData()
        const file = formData.get("file")

        if (!file || !(file instanceof File)) {
            return NextResponse.json(
                { error: "Missing file field" },
                { status: 400 }
            )
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json(
                { error: "File too large (max 10MB)" },
                { status: 413 }
            )
        }

        if (!file.type.startsWith("image/")) {
            return NextResponse.json(
                { error: "Only image files are accepted" },
                { status: 400 }
            )
        }

        const imageDataUrl = await fileToDataUrl(file)

        const messageParts: ChatMessagePart[] = [
            {
                type: "text",
                text: "Extract material line items from this receipt/image. Return JSON only.",
            },
            {
                type: "image_url",
                image_url: { url: imageDataUrl },
            },
        ]

        const systemPrompt = [
            "You extract structured material line items from receipt/cart images.",
            "Return strict JSON only (no markdown).",
            `JSON shape:
{
  "subtotal": number,
  "tax": number,
  "total": number,
  "itemCount": number
}`,
            "Rules:",
            "- Calculate subtotal, tax, and total from visible data.",
            "- Count the number of distinct line items as itemCount.",
            "- If a value is ambiguous, use your best guess.",
            "- Do NOT include individual item details in this response.",
        ].join("\n")

        const completion = await openai.chat.completions.create({
            model: OPENAI_RECEIPT_MODEL,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: messageParts },
            ],
            temperature: 0.1,
            max_tokens: 500,
        })

        const rawContent = extractMessageContent(completion.choices?.[0]?.message?.content)
        if (!rawContent) {
            return NextResponse.json(
                { error: "AI returned empty response" },
                { status: 500 }
            )
        }

        const parsed = parsePotentialJsonContent(rawContent) as Record<string, unknown>

        // PUBLIC response: only totals, no item details
        const response = {
            ok: true,
            subtotal: Math.max(0, toFiniteNumber(parsed?.subtotal, 0)),
            tax: Math.max(0, toFiniteNumber(parsed?.tax, 0)),
            total: Math.max(0, toFiniteNumber(parsed?.total, 0)),
            itemCount: Math.max(0, toFiniteNumber(parsed?.itemCount, 0)),
            remaining: rateLimitResult.remaining,
        }

        return NextResponse.json(response)
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Internal server error"
        console.error("[public/parse-receipt] Error:", errorMessage)
        return NextResponse.json(
            { error: "Failed to parse receipt. Please try again." },
            { status: 500 }
        )
    }
}

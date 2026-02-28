import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import { createAuthedSupabaseClient, parseBearerToken } from "@/lib/server/supabase-auth"

const FEEDBACK_TYPES = new Set(["bug", "feature", "general"])
const MAX_MESSAGE_LENGTH = 2000
const MAX_METADATA_BYTES = 8_000

type FeedbackPayload = {
    type: "bug" | "feature" | "general"
    message: string
    metadata: Record<string, unknown>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeFeedbackPayload(input: unknown): FeedbackPayload | null {
    if (!isPlainObject(input)) return null

    const typeRaw = typeof input.type === "string" ? input.type.trim().toLowerCase() : ""
    if (!FEEDBACK_TYPES.has(typeRaw)) return null

    const message = typeof input.message === "string" ? input.message.trim() : ""
    if (!message || message.length > MAX_MESSAGE_LENGTH) return null

    const metadataRaw = input.metadata
    const metadata = isPlainObject(metadataRaw) ? metadataRaw : {}
    const metadataBytes = Buffer.byteLength(JSON.stringify(metadata), "utf8")
    if (metadataBytes > MAX_METADATA_BYTES) return null

    return {
        type: typeRaw as FeedbackPayload["type"],
        message,
        metadata,
    }
}

async function resolveOptionalUserId(req: Request): Promise<string | null> {
    const token = parseBearerToken(req)
    if (!token) return null

    const supabase = createAuthedSupabaseClient(token)
    if (!supabase) return null

    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error || !user) return null
    return user.id
}

export async function POST(req: Request) {
    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `feedback:${ip}`,
        limit: 10,
        windowMs: 60 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: "Too many requests. Please try again later." },
            { status: 429 }
        )
    }

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 }
        )
    }

    const payload = normalizeFeedbackPayload(body)
    if (!payload) {
        return NextResponse.json(
            { error: "Invalid feedback payload" },
            { status: 400 }
        )
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json(
            { error: "Supabase service configuration is missing" },
            { status: 500 }
        )
    }

    const userId = await resolveOptionalUserId(req)
    const { data, error } = await supabase
        .from("feedback")
        .insert({
            user_id: userId,
            category: payload.type,
            description: payload.message,
            metadata: payload.metadata,
        })
        .select("id")
        .single()

    if (error || !data?.id) {
        console.error("Feedback insert failed:", error)
        return NextResponse.json(
            { error: "Failed to submit feedback" },
            { status: 500 }
        )
    }

    return NextResponse.json({
        ok: true,
        id: data.id,
    })
}

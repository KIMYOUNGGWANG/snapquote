import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"

type AnalyticsEventName =
    | "draft_saved"
    | "quote_sent"
    | "payment_link_created"
    | "payment_completed"
    | "referral_link_copied"
    | "free_quota_warning"
    | "free_quota_limit_hit"

const ALLOWED_EVENTS: Set<AnalyticsEventName> = new Set([
    "draft_saved",
    "quote_sent",
    "payment_link_created",
    "payment_completed",
    "referral_link_copied",
    "free_quota_warning",
    "free_quota_limit_hit",
])

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseBearerToken(req: Request): string {
    const authHeader = req.headers.get("authorization") || ""
    if (!authHeader.toLowerCase().startsWith("bearer ")) return ""
    return authHeader.slice(7).trim()
}

function normalizeOptionalString(value: unknown, maxLength: number): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed.slice(0, maxLength)
}

function normalizeOptionalUuid(value: unknown): string | null {
    const maybeValue = normalizeOptionalString(value, 64)
    if (!maybeValue) return null
    return UUID_PATTERN.test(maybeValue) ? maybeValue : null
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {}
    }

    const metadata = value as Record<string, unknown>
    const serialized = JSON.stringify(metadata)
    if (serialized.length > 6000) {
        throw new Error("Metadata payload too large")
    }
    return metadata
}

export async function POST(req: Request) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        return NextResponse.json(
            { error: { message: "Supabase is not configured", code: 500 } },
            { status: 500 }
        )
    }

    const token = parseBearerToken(req)
    if (!token) {
        return NextResponse.json(
            { error: { message: "Unauthorized", code: 401 } },
            { status: 401 }
        )
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            },
        }
    )

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
        return NextResponse.json(
            { error: { message: "Unauthorized", code: 401 } },
            { status: 401 }
        )
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `analytics-events:${user.id}:${ip}`,
        limit: 120,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    try {
        const body = await req.json()
        const eventNameRaw = normalizeOptionalString(body?.event, 64)

        if (!eventNameRaw || !ALLOWED_EVENTS.has(eventNameRaw as AnalyticsEventName)) {
            return NextResponse.json(
                { error: { message: "Invalid event name", code: 400 } },
                { status: 400 }
            )
        }

        const estimateId = normalizeOptionalUuid(body?.estimateId)
        const estimateNumber = normalizeOptionalString(body?.estimateNumber, 80)
        const channel = normalizeOptionalString(body?.channel, 32)
        const externalId = normalizeOptionalString(body?.externalId, 120)
        const metadata = normalizeMetadata(body?.metadata)

        const { data, error } = await supabase
            .from("analytics_events")
            .insert({
                user_id: user.id,
                event_name: eventNameRaw,
                estimate_id: estimateId,
                estimate_number: estimateNumber,
                channel,
                external_id: externalId,
                metadata,
            })
            .select("id")
            .single()

        if (error || !data?.id) {
            console.error("Failed to insert analytics event:", error)
            return NextResponse.json(
                { error: { message: "Failed to track event", code: 500 } },
                { status: 500 }
            )
        }

        return NextResponse.json({
            ok: true,
            eventId: data.id,
        })
    } catch (error: any) {
        const message =
            error instanceof Error && error.message.includes("Metadata payload too large")
                ? error.message
                : "Invalid request payload"

        return NextResponse.json(
            { error: { message, code: 400 } },
            { status: 400 }
        )
    }
}

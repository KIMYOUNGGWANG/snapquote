import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { createAuthedSupabaseClient, parseBearerToken } from "@/lib/server/supabase-auth"

type PricingEventName = "pricing_viewed" | "upgrade_clicked" | "waitlist_joined"

const ALLOWED_EVENTS: Set<PricingEventName> = new Set([
    "pricing_viewed",
    "upgrade_clicked",
    "waitlist_joined",
])

function normalizeOptionalString(value: unknown, maxLength: number): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed.slice(0, maxLength)
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
    const token = parseBearerToken(req)
    if (!token) {
        return NextResponse.json(
            { error: { message: "Unauthorized", code: 401 } },
            { status: 401 }
        )
    }

    const supabase = createAuthedSupabaseClient(token)
    if (!supabase) {
        return NextResponse.json(
            { error: { message: "Supabase is not configured", code: 500 } },
            { status: 500 }
        )
    }

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
        key: `pricing-events:${user.id}:${ip}`,
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

        if (!eventNameRaw || !ALLOWED_EVENTS.has(eventNameRaw as PricingEventName)) {
            return NextResponse.json(
                { error: { message: "Invalid event name", code: 400 } },
                { status: 400 }
            )
        }

        const experimentName = normalizeOptionalString(body?.experiment, 80) || "pricing_v1"
        const metadata = normalizeMetadata(body?.metadata)

        const { data: assignmentRows, error: assignmentError } = await supabase.rpc(
            "get_or_create_pricing_assignment",
            { experiment_name: experimentName }
        )

        if (assignmentError) {
            console.error("Failed to resolve pricing assignment:", assignmentError)
            return NextResponse.json(
                { error: { message: "Failed to resolve pricing assignment", code: 500 } },
                { status: 500 }
            )
        }

        const assignment = Array.isArray(assignmentRows) ? assignmentRows[0] : null
        if (!assignment?.experiment_id || !assignment?.variant) {
            return NextResponse.json(
                { error: { message: "No active pricing experiment", code: 404 } },
                { status: 404 }
            )
        }

        const dateKey = new Date().toISOString().slice(0, 10)
        const externalId =
            normalizeOptionalString(body?.externalId, 140) ||
            `pricing:${user.id}:${assignment.experiment_id}:${assignment.variant}:${eventNameRaw}:${dateKey}`

        const { data: inserted, error: insertError } = await supabase
            .from("pricing_conversions")
            .insert({
                experiment_id: assignment.experiment_id,
                user_id: user.id,
                variant: assignment.variant,
                event_name: eventNameRaw,
                external_id: externalId,
                metadata,
                occurred_at: new Date().toISOString(),
            })
            .select("id")
            .single()

        if (insertError || !inserted?.id) {
            // Duplicate external_id should be treated as ok.
            if (insertError?.code === "23505") {
                return NextResponse.json({ ok: true, deduped: true })
            }

            console.error("Failed to insert pricing event:", insertError)
            return NextResponse.json(
                { error: { message: "Failed to track pricing event", code: 500 } },
                { status: 500 }
            )
        }

        return NextResponse.json({ ok: true, eventId: inserted.id })
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


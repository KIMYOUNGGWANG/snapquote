import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"

const FUNNEL_EVENTS = [
    "draft_saved",
    "quote_sent",
    "customer_portal_link_created",
    "quote_viewed",
    "quote_approved",
    "quote_change_requested",
    "payment_link_created",
    "payment_completed",
] as const

function parseBearerToken(req: Request): string {
    const authHeader = req.headers.get("authorization") || ""
    if (!authHeader.toLowerCase().startsWith("bearer ")) return ""
    return authHeader.slice(7).trim()
}

function parseDateRange(req: Request): { fromIso: string; toIso: string } {
    const { searchParams } = new URL(req.url)
    const fromRaw = searchParams.get("from")
    const toRaw = searchParams.get("to")

    const now = new Date()
    const defaultFrom = new Date(now)
    defaultFrom.setDate(defaultFrom.getDate() - 30)

    const fromDate = fromRaw ? new Date(`${fromRaw}T00:00:00.000Z`) : defaultFrom
    const toDate = toRaw ? new Date(`${toRaw}T23:59:59.999Z`) : now

    if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) {
        throw new Error("Invalid date range")
    }

    return {
        fromIso: fromDate.toISOString(),
        toIso: toDate.toISOString(),
    }
}

function isNonTransitioningPaymentEvent(row: { event_name?: unknown; metadata?: unknown }): boolean {
    if (row.event_name !== "payment_completed") return false
    const metadata = row.metadata
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false

    return (metadata as Record<string, unknown>).status_transitioned === false
}

export async function GET(req: Request) {
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
        key: `analytics-funnel:${user.id}:${ip}`,
        limit: 60,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    try {
        const { fromIso, toIso } = parseDateRange(req)

        const { data, error } = await supabase
            .from("analytics_events")
            .select("event_name, metadata")
            .gte("created_at", fromIso)
            .lte("created_at", toIso)
            .in("event_name", [...FUNNEL_EVENTS])

        if (error) {
            console.error("Failed to fetch funnel analytics:", error)
            return NextResponse.json(
                { error: { message: "Failed to load funnel data", code: 500 } },
                { status: 500 }
            )
        }

        const counts: Record<(typeof FUNNEL_EVENTS)[number], number> = {
            draft_saved: 0,
            quote_sent: 0,
            customer_portal_link_created: 0,
            quote_viewed: 0,
            quote_approved: 0,
            quote_change_requested: 0,
            payment_link_created: 0,
            payment_completed: 0,
        }

        for (const row of data || []) {
            if (isNonTransitioningPaymentEvent(row)) continue
            const eventName = row.event_name as keyof typeof counts
            if (eventName in counts) {
                counts[eventName] += 1
            }
        }

        const sendRate =
            counts.draft_saved > 0 ? Number(((counts.quote_sent / counts.draft_saved) * 100).toFixed(1)) : 0
        const approvalLinkRate =
            counts.quote_sent > 0
                ? Number(((counts.customer_portal_link_created / counts.quote_sent) * 100).toFixed(1))
                : 0
        const viewRate =
            counts.customer_portal_link_created > 0
                ? Number(((counts.quote_viewed / counts.customer_portal_link_created) * 100).toFixed(1))
                : 0
        const approvalRate =
            counts.customer_portal_link_created > 0
                ? Number(((counts.quote_approved / counts.customer_portal_link_created) * 100).toFixed(1))
                : 0
        const changeRequestRate =
            counts.customer_portal_link_created > 0
                ? Number(((counts.quote_change_requested / counts.customer_portal_link_created) * 100).toFixed(1))
                : 0
        const paymentRate =
            counts.quote_sent > 0 ? Number(((counts.payment_completed / counts.quote_sent) * 100).toFixed(1)) : 0
        const paymentAfterApprovalRate =
            counts.quote_approved > 0 ? Number(((counts.payment_completed / counts.quote_approved) * 100).toFixed(1)) : 0

        return NextResponse.json({
            ok: true,
            from: fromIso,
            to: toIso,
            ...counts,
            send_rate: sendRate,
            approval_link_rate: approvalLinkRate,
            view_rate: viewRate,
            approval_rate: approvalRate,
            change_request_rate: changeRequestRate,
            payment_rate: paymentRate,
            payment_after_approval_rate: paymentAfterApprovalRate,
        })
    } catch {
        return NextResponse.json(
            { error: { message: "Invalid date range", code: 400 } },
            { status: 400 }
        )
    }
}

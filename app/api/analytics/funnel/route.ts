import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"

const FUNNEL_EVENTS = [
    "draft_saved",
    "quote_sent",
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
            .select("event_name")
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
            payment_link_created: 0,
            payment_completed: 0,
        }

        for (const row of data || []) {
            const eventName = row.event_name as keyof typeof counts
            if (eventName in counts) {
                counts[eventName] += 1
            }
        }

        const sendRate =
            counts.draft_saved > 0 ? Number(((counts.quote_sent / counts.draft_saved) * 100).toFixed(1)) : 0
        const paymentRate =
            counts.quote_sent > 0 ? Number(((counts.payment_completed / counts.quote_sent) * 100).toFixed(1)) : 0

        return NextResponse.json({
            ok: true,
            from: fromIso,
            to: toIso,
            ...counts,
            send_rate: sendRate,
            payment_rate: paymentRate,
        })
    } catch {
        return NextResponse.json(
            { error: { message: "Invalid date range", code: 400 } },
            { status: 400 }
        )
    }
}

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function isAuthorized(req: Request): boolean {
    const secret = process.env.CRON_SECRET
    if (!secret) return false

    const bearer = req.headers.get("authorization")
    const headerSecret = req.headers.get("x-cron-secret")

    return bearer === `Bearer ${secret}` || headerSecret === secret
}

function parseDateParam(value: string | null): string | null {
    if (!value) return null
    const trimmed = value.trim()
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(trimmed)) return null
    return trimmed
}

export async function GET(req: Request) {
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 })
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return NextResponse.json({ error: "Missing Supabase service credentials" }, { status: 500 })
    }
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const from = parseDateParam(url.searchParams.get("from"))
    const to = parseDateParam(url.searchParams.get("to"))

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    let query = supabase
        .from("pricing_conversions")
        .select("experiment_id, variant, event_name, occurred_at")

    if (from) query = query.gte("occurred_at", `${from}T00:00:00.000Z`)
    if (to) query = query.lte("occurred_at", `${to}T23:59:59.999Z`)

    const { data, error } = await query

    if (error) {
        console.error("Pricing report query failed:", error)
        return NextResponse.json({ error: "Failed to load report" }, { status: 500 })
    }

    const counts: Record<string, number> = {}

    for (const row of data || []) {
        const key = `${row.experiment_id}:${row.variant}:${row.event_name}`
        counts[key] = (counts[key] || 0) + 1
    }

    const results = Object.entries(counts).map(([key, count]) => {
        const [experimentId, variant, eventName] = key.split(":")
        return { experimentId, variant, eventName, count }
    })

    results.sort((a, b) => b.count - a.count)

    return NextResponse.json({
        ok: true,
        from,
        to,
        rows: results,
        totalEvents: (data || []).length,
    })
}


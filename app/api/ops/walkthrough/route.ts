import { NextResponse } from "next/server"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import { walkthroughAttachSchema } from "@/lib/server/walkthrough"

// Operator-only: attach a finished WalkPlan link to a requested estimate. Same CRON_SECRET guard as other ops routes.
function isAuthorized(request: Request): boolean {
    const secret = process.env.CRON_SECRET
    if (!secret) return false
    return (
        request.headers.get("authorization") === `Bearer ${secret}` ||
        request.headers.get("x-cron-secret") === secret
    )
}

export async function POST(request: Request) {
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 })
    }
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
    const parsed = walkthroughAttachSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json({ error: "Expected {userId, estimateId, url} with an https url" }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json({ error: "Missing Supabase service credentials" }, { status: 500 })
    }

    const { userId, estimateId, url } = parsed.data
    const { data, error } = await supabase
        .from("estimate_walkthroughs")
        .update({ status: "ready", url, ready_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("estimate_id", estimateId)
        .select("estimate_id")
        .maybeSingle()

    if (error) return NextResponse.json({ error: "Failed to attach the link" }, { status: 500 })
    // Only requested estimates can get a link, so a typo cannot attach a preview to someone else's quote.
    if (!data) return NextResponse.json({ error: "No walkthrough request for this estimate" }, { status: 404 })

    return NextResponse.json({ ok: true, status: "ready", url })
}

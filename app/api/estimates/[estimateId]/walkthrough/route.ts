import { NextResponse } from "next/server"
import { Resend } from "resend"
import { checkRateLimit } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient, ensureProfileExists } from "@/lib/server/stripe-connect"
import { loadWalkthrough, photoDataUrlToAttachment, walkthroughRequestSchema } from "@/lib/server/walkthrough"

const MAX_BODY_BYTES = 4_600_000
// A request whose email never arrived (crash, spam folder) can be sent again after this long.
const RESEND_AFTER_MS = 24 * 60 * 60 * 1000

function normalizeEstimateId(value: string): string | null {
    const trimmed = value.trim()
    if (!trimmed || trimmed.length > 120) return null
    return trimmed
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

function errorResponse(message: string, status: number) {
    return NextResponse.json({ error: { message, code: status } }, { status })
}

/** Contractor asks for a 3D "finished room" preview. The operator gets the scope and before photos by email. */
export async function POST(request: Request, context: { params: Promise<{ estimateId: string }> }) {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const estimateId = normalizeEstimateId((await context.params).estimateId)
    if (!estimateId) return errorResponse("Invalid estimate id", 400)

    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
        return errorResponse("Photos are too large", 413)
    }

    // Per user (not per IP) so switching networks does not multiply the operator's inbox load.
    const rateLimit = await checkRateLimit({
        key: `walkthrough-request:${auth.userId}`,
        limit: 5,
        windowMs: 60 * 60 * 1000,
    })
    if (!rateLimit.allowed) return errorResponse("Too many requests", 429)

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return errorResponse("Invalid request payload", 400)
    }
    const parsed = walkthroughRequestSchema.safeParse(body)
    if (!parsed.success) return errorResponse("Invalid walkthrough request", 400)

    const operatorEmail = process.env.WALKTHROUGH_OPERATOR_EMAIL
    if (!process.env.RESEND_API_KEY || !operatorEmail) {
        return errorResponse("3D preview requests are not configured", 500)
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) return errorResponse("Supabase service configuration is missing", 500)
    await ensureProfileExists(supabase, auth.userId)

    const existing = await loadWalkthrough(supabase, auth.userId, estimateId)
    if (existing.status === "ready") return NextResponse.json({ ok: true, status: "ready", url: existing.url })

    const isRetry = existing.status === "requested"
    if (isRetry) {
        const requestedAt = Date.parse(existing.requestedAt || "")
        if (!(Date.now() - requestedAt > RESEND_AFTER_MS)) return NextResponse.json({ ok: true, status: "requested" })
    } else {
        // Claim the row first; on conflict another request already claimed it, so no second email.
        const claim = await supabase
            .from("estimate_walkthroughs")
            .upsert(
                { user_id: auth.userId, estimate_id: estimateId, status: "requested" },
                { onConflict: "user_id,estimate_id", ignoreDuplicates: true }
            )
            .select("estimate_id")
        if (claim.error) return errorResponse("Failed to save the request", 500)
        if (!Array.isArray(claim.data) || claim.data.length === 0) return NextResponse.json({ ok: true, status: "requested" })
    }

    const { estimateNumber, scope, photos } = parsed.data
    let sendFailed = false
    try {
        const sent = await new Resend(process.env.RESEND_API_KEY).emails.send({
            // resend.dev can only deliver to the Resend account owner, so WALKTHROUGH_OPERATOR_EMAIL must be that address
            // until a domain is verified (same as app/api/send-email).
            from: "SnapQuote <onboarding@resend.dev>",
            to: [operatorEmail],
            subject: `3D preview request: ${estimateNumber || estimateId}${isRetry ? " (resent)" : ""}`,
            html: `
                <p><strong>3D walkthrough preview requested</strong></p>
                <p>userId: <code>${escapeHtml(auth.userId)}</code><br/>estimateId: <code>${escapeHtml(estimateId)}</code><br/>
                estimate: ${escapeHtml(estimateNumber || "-")}<br/>before photos attached: ${photos.length}</p>
                <p>Scope:</p>
                <pre style="white-space:pre-wrap">${escapeHtml(scope)}</pre>
                <p>When the preview is ready, POST {userId, estimateId, url} to /api/ops/walkthrough with the CRON_SECRET.</p>
            `,
            attachments: photos.map(photoDataUrlToAttachment),
        })
        sendFailed = Boolean(sent.error)
    } catch (error) {
        console.error("Failed to send walkthrough request email:", error)
        sendFailed = true
    }

    if (sendFailed) {
        if (!isRetry) {
            // Release the claim so the contractor can retry; if this fails too, the 24h resend window still recovers it.
            const release = await supabase
                .from("estimate_walkthroughs")
                .delete()
                .eq("user_id", auth.userId)
                .eq("estimate_id", estimateId)
                .eq("status", "requested")
            if (release.error) console.error("Failed to release walkthrough request:", release.error)
        }
        return errorResponse("Failed to send the request. Try again.", 502)
    }

    if (isRetry) {
        const touch = await supabase
            .from("estimate_walkthroughs")
            .update({ requested_at: new Date().toISOString() })
            .eq("user_id", auth.userId)
            .eq("estimate_id", estimateId)
            .eq("status", "requested")
        if (touch.error) console.warn("Failed to update walkthrough requested_at:", touch.error)
    }

    return NextResponse.json({ ok: true, status: "requested" })
}

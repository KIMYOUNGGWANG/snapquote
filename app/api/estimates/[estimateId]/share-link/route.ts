import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient, ensureProfileExists } from "@/lib/server/stripe-connect"
import {
    buildCustomerPortalUrl,
    createCustomerPortalLink,
    createCustomerPortalToken,
    getCustomerPortalQuoteForEstimate,
    hashCustomerPortalToken,
} from "@/lib/server/customer-portal"
import { customerQuoteShareLinkSchema } from "@/lib/validation/api-schemas"

function normalizeEstimateId(value: string): string | null {
    const trimmed = value.trim()
    if (!trimmed || trimmed.length > 120) return null
    return trimmed
}

export async function GET(req: Request, context: { params: Promise<{ estimateId: string }> }) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) return auth.response

    const { estimateId: rawEstimateId } = await context.params
    const estimateId = normalizeEstimateId(rawEstimateId)
    if (!estimateId) {
        return NextResponse.json(
            { error: { message: "Invalid estimate id", code: 400 } },
            { status: 400 }
        )
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `customer-share-link-status:${auth.userId}:${estimateId}:${ip}`,
        limit: 60,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json(
            { error: { message: "Supabase service configuration is missing", code: 500 } },
            { status: 500 }
        )
    }

    await ensureProfileExists(supabase, auth.userId)

    const result = await getCustomerPortalQuoteForEstimate(supabase, auth.userId, estimateId)
    if (!result.ok) {
        return NextResponse.json(
            { error: { message: result.error, code: result.status } },
            { status: result.status }
        )
    }

    return NextResponse.json({
        ok: true,
        shareUrl: result.data.shareUrl,
        portal: {
            status: result.data.status,
            viewedAt: result.data.viewedAt,
            approvedAt: result.data.approvedAt,
            changeRequestedAt: result.data.changeRequestedAt,
            customerName: result.data.customerName,
            customerEmail: result.data.customerEmail,
            customerNote: result.data.customerNote,
        },
        estimate: {
            paymentStatus: result.data.estimate.paymentStatus,
            paymentCompletedAt: result.data.estimate.paymentCompletedAt,
        },
    })
}

export async function POST(req: Request, context: { params: Promise<{ estimateId: string }> }) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) return auth.response

    const { estimateId: rawEstimateId } = await context.params
    const estimateId = normalizeEstimateId(rawEstimateId)
    if (!estimateId) {
        return NextResponse.json(
            { error: { message: "Invalid estimate id", code: 400 } },
            { status: 400 }
        )
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `customer-share-link:${auth.userId}:${estimateId}:${ip}`,
        limit: 20,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: { message: "Invalid request payload", code: 400 } },
            { status: 400 }
        )
    }

    const parsed = customerQuoteShareLinkSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: { message: "Invalid customer quote payload", code: 400 } },
            { status: 400 }
        )
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json(
            { error: { message: "Supabase service configuration is missing", code: 500 } },
            { status: 500 }
        )
    }

    await ensureProfileExists(supabase, auth.userId)

    const token = createCustomerPortalToken()
    const tokenHash = hashCustomerPortalToken(token)
    if (!tokenHash) {
        return NextResponse.json(
            { error: { message: "Failed to create customer quote token", code: 500 } },
            { status: 500 }
        )
    }

    const shareUrl = buildCustomerPortalUrl(req, token)
    const result = await createCustomerPortalLink(supabase, {
        userId: auth.userId,
        estimateId,
        estimate: parsed.data.estimate,
        shareUrl,
        tokenHash,
        resetCustomerDecision: parsed.data.resetCustomerDecision,
    })

    if (!result.ok) {
        return NextResponse.json(
            { error: { message: result.error, code: result.status } },
            { status: result.status }
        )
    }

    return NextResponse.json({
        ok: true,
        shareUrl: result.data.shareUrl || shareUrl,
        portal: {
            status: result.data.status,
            viewedAt: result.data.viewedAt,
            approvedAt: result.data.approvedAt,
            changeRequestedAt: result.data.changeRequestedAt,
            customerName: result.data.customerName,
            customerEmail: result.data.customerEmail,
            customerNote: result.data.customerNote,
        },
        estimate: {
            paymentStatus: result.data.estimate.paymentStatus,
            paymentCompletedAt: result.data.estimate.paymentCompletedAt,
        },
    })
}

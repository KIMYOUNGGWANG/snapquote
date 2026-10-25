import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { resolveCallerEstimateForPaymentLink } from "@/lib/server/payment-estimate-ownership"
import { createEstimatePaymentLink } from "@/lib/server/stripe-payment-link"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const MAX_IDEMPOTENCY_KEY_LENGTH = 255

function normalizeIdempotencyKey(value: string | null): string | null {
    if (!value) return null
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH)
}

export async function POST(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `create-payment-link:${ip}`,
        limit: 30,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: "Too many requests. Please try again later." },
            { status: 429 }
        )
    }

    // Initialize Stripe lazily to avoid build-time errors
    if (!process.env.STRIPE_SECRET_KEY) {
        return NextResponse.json(
            { error: "Stripe is not configured. Please add STRIPE_SECRET_KEY." },
            { status: 500 }
        )
    }
    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json(
            { error: "Supabase service configuration is missing." },
            { status: 500 }
        )
    }

    try {
        const { amount, customerName, estimateNumber, estimateId } = await req.json()
        const normalizedAmount = Number(amount)
        const safeCustomerName = typeof customerName === "string" ? customerName.trim().slice(0, 120) : ""
        const safeEstimateNumber = typeof estimateNumber === "string" ? estimateNumber.trim().slice(0, 80) : ""
        const safeEstimateId = typeof estimateId === "string" ? estimateId.trim().slice(0, 80) : ""

        // Validate amount
        if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0 || normalizedAmount > 500000) {
            return NextResponse.json(
                { error: "Invalid amount" },
                { status: 400 }
            )
        }

        if (safeEstimateId && !UUID_PATTERN.test(safeEstimateId)) {
            return NextResponse.json(
                { error: "Invalid estimateId" },
                { status: 400 }
            )
        }

        const estimateResolution = await resolveCallerEstimateForPaymentLink(supabase, {
            estimateId: safeEstimateId,
            estimateNumber: safeEstimateNumber,
            userId: auth.userId,
        })
        if (estimateResolution && !estimateResolution.ok) {
            return NextResponse.json(
                { error: estimateResolution.error },
                { status: estimateResolution.status }
            )
        }

        const resolvedEstimateId = estimateResolution?.estimate.id || safeEstimateId
        const resolvedEstimateNumber =
            estimateResolution?.estimate.estimate_number?.trim() ||
            safeEstimateNumber

        const result = await createEstimatePaymentLink({
            userId: auth.userId,
            estimateId: resolvedEstimateId,
            estimateNumber: resolvedEstimateNumber,
            customerName: safeCustomerName,
            amount: normalizedAmount,
            idempotencyKey: normalizeIdempotencyKey(req.headers.get("idempotency-key")) || undefined,
        })
        if (!result.ok) {
            return NextResponse.json(
                result.code ? { error: result.error, code: result.code } : { error: result.error },
                { status: result.status }
            )
        }

        return NextResponse.json({
            url: result.url,
            id: result.id,
        })
    } catch (error: unknown) {
        console.error("Stripe Payment Link error:", error)

        return NextResponse.json(
            { error: (error instanceof Error && error.message) || "Failed to create payment link" },
            { status: 500 }
        )
    }
}

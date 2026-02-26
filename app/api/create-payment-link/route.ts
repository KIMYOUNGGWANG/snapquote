import { NextResponse } from "next/server"
import Stripe from "stripe"
import { createHash } from "node:crypto"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import {
    createServiceSupabaseClient,
    getStripeConnectProfile,
    upsertStripeConnectProfile,
} from "@/lib/server/stripe-connect"

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const MAX_IDEMPOTENCY_KEY_LENGTH = 255

function normalizeIdempotencyKey(value: string | null): string | null {
    if (!value) return null
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH)
}

function createDeterministicIdempotencyKey(input: {
    userId: string
    estimateId: string
    estimateNumber: string
    amountInCents: number
}): string {
    const basis = [
        input.userId,
        input.estimateId || "no-estimate-id",
        input.estimateNumber || "no-estimate-number",
        String(input.amountInCents),
    ].join("|")

    const digest = createHash("sha256").update(basis).digest("hex")
    return `payment_link:${digest}`.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH)
}

function buildPaymentSuccessRedirectUrl(input: { estimateId: string; estimateNumber: string }): string {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://snapquote.app"
    const normalizedAppUrl = /^https?:\/\//i.test(appUrl) ? appUrl : `https://${appUrl}`

    try {
        const successUrl = new URL("/payment-success", normalizedAppUrl)
        if (input.estimateId) {
            successUrl.searchParams.set("estimateId", input.estimateId)
        }
        if (input.estimateNumber) {
            successUrl.searchParams.set("estimateNumber", input.estimateNumber)
        }
        return successUrl.toString()
    } catch {
        return "https://snapquote.app/payment-success"
    }
}

function toAccountFlags(account: Stripe.Account | Stripe.DeletedAccount) {
    if ("deleted" in account && account.deleted) {
        return {
            detailsSubmitted: false,
            chargesEnabled: false,
            payoutsEnabled: false,
        }
    }

    return {
        detailsSubmitted: Boolean(account.details_submitted),
        chargesEnabled: Boolean(account.charges_enabled),
        payoutsEnabled: Boolean(account.payouts_enabled),
    }
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

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2025-12-15.clover",
    })

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

        // Convert to cents (Stripe uses smallest currency unit)
        const amountInCents = Math.round(normalizedAmount * 100)
        const requestIdempotencyKey = normalizeIdempotencyKey(req.headers.get("idempotency-key"))
        const idempotencyKey =
            requestIdempotencyKey ||
            createDeterministicIdempotencyKey({
                userId: auth.userId,
                estimateId: safeEstimateId,
                estimateNumber: safeEstimateNumber,
                amountInCents,
            })

        const { data: profile, error: profileError } = await getStripeConnectProfile(supabase, auth.userId)
        if (profileError) {
            return NextResponse.json(
                { error: "Failed to load Stripe Connect account." },
                { status: 500 }
            )
        }

        const connectedAccountId = profile?.stripe_account_id?.trim() || ""
        if (!connectedAccountId) {
            return NextResponse.json(
                {
                    error: "Stripe Connect account is not linked. Connect Stripe in Profile first.",
                    code: "STRIPE_CONNECT_REQUIRED",
                },
                { status: 403 }
            )
        }

        const connectedAccount = await stripe.accounts.retrieve(connectedAccountId)
        const flags = toAccountFlags(connectedAccount)

        await upsertStripeConnectProfile(supabase, auth.userId, {
            stripe_account_id: connectedAccountId,
            stripe_details_submitted: flags.detailsSubmitted,
            stripe_charges_enabled: flags.chargesEnabled,
            stripe_payouts_enabled: flags.payoutsEnabled,
            stripe_onboarded_at: flags.detailsSubmitted && flags.chargesEnabled
                ? (profile?.stripe_onboarded_at || new Date().toISOString())
                : profile?.stripe_onboarded_at || null,
        })

        if (!flags.detailsSubmitted || !flags.chargesEnabled) {
            return NextResponse.json(
                {
                    error: "Stripe Connect onboarding is incomplete. Complete onboarding in Profile first.",
                    code: "STRIPE_CONNECT_INCOMPLETE",
                },
                { status: 403 }
            )
        }

        const metadata: Record<string, string> = {
            estimateId: safeEstimateId,
            estimateNumber: safeEstimateNumber,
            userId: auth.userId,
        }
        const successRedirectUrl = buildPaymentSuccessRedirectUrl({
            estimateId: safeEstimateId,
            estimateNumber: safeEstimateNumber,
        })

        // Create a Payment Link with dynamic pricing
        const paymentLink = await stripe.paymentLinks.create(
            {
                metadata,
                payment_intent_data: {
                    metadata,
                },
                line_items: [
                    {
                        price_data: {
                            currency: "cad",
                            product_data: {
                                name: safeEstimateNumber
                                    ? `Estimate Payment - ${safeEstimateNumber}`
                                    : "Estimate Payment",
                                description: safeCustomerName
                                    ? `Service for ${safeCustomerName}`
                                    : "Professional service payment",
                            },
                            unit_amount: amountInCents,
                        },
                        quantity: 1,
                    },
                ],
                after_completion: {
                    type: "redirect",
                    redirect: {
                        url: successRedirectUrl,
                    },
                },
            },
            {
                idempotencyKey,
                stripeAccount: connectedAccountId,
            }
        )

        return NextResponse.json({
            url: paymentLink.url,
            id: paymentLink.id,
        })
    } catch (error: any) {
        console.error("Stripe Payment Link error:", error)

        // Handle Stripe-specific errors
        if (error.type === 'StripeAuthenticationError') {
            return NextResponse.json(
                { error: "Invalid Stripe API key. Please check your configuration." },
                { status: 401 }
            )
        }

        return NextResponse.json(
            { error: error.message || "Failed to create payment link" },
            { status: 500 }
        )
    }
}

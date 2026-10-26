import Stripe from "stripe"
import { createHash } from "node:crypto"
import { recordOpsAlert } from "@/lib/ops-alerts"
import {
    createServiceSupabaseClient,
    getStripeConnectProfile,
    upsertStripeConnectProfile,
} from "@/lib/server/stripe-connect"

const MAX_IDEMPOTENCY_KEY_LENGTH = 255
const STRIPE_PAYMENT_LINK_CURRENCY = "usd"

export type EstimatePaymentLinkInput = {
    userId: string
    estimateId: string
    estimateNumber: string
    customerName: string
    amount: number
    /** Client-supplied key; falls back to a deterministic one. */
    idempotencyKey?: string
}

export type EstimatePaymentLinkResult =
    | { ok: true; url: string; id: string }
    | { ok: false; status: number; error: string; code?: string }

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
        successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}")
        return successUrl.toString().replace("session_id=%7BCHECKOUT_SESSION_ID%7D", "session_id={CHECKOUT_SESSION_ID}")
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

function toFailure(error: unknown): EstimatePaymentLinkResult & { ok: false } {
    console.error("Stripe Payment Link error:", error)

    const type = typeof error === "object" && error !== null && "type" in error
        ? (error as { type?: unknown }).type
        : undefined
    if (type === "StripeAuthenticationError") {
        return { ok: false, status: 401, error: "Invalid Stripe API key. Please check your configuration." }
    }

    const message = error instanceof Error ? error.message : ""
    return { ok: false, status: 500, error: message || "Failed to create payment link" }
}

/**
 * Creates a Stripe Payment Link on the user's connected account.
 * Caller must have already verified that `userId` owns the estimate.
 */
export async function createEstimatePaymentLink(
    input: EstimatePaymentLinkInput
): Promise<EstimatePaymentLinkResult> {
    if (!process.env.STRIPE_SECRET_KEY) {
        return { ok: false, status: 500, error: "Stripe is not configured. Please add STRIPE_SECRET_KEY." }
    }
    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return { ok: false, status: 500, error: "Supabase service configuration is missing." }
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2025-12-15.clover",
    })

    try {
        const amountInCents = Math.round(input.amount * 100)
        const idempotencyKey =
            input.idempotencyKey ||
            createDeterministicIdempotencyKey({
                userId: input.userId,
                estimateId: input.estimateId,
                estimateNumber: input.estimateNumber,
                amountInCents,
            })

        const { data: profile, error: profileError } = await getStripeConnectProfile(supabase, input.userId)
        if (profileError) {
            return { ok: false, status: 500, error: "Failed to load Stripe Connect account." }
        }

        const connectedAccountId = profile?.stripe_account_id?.trim() || ""
        if (!connectedAccountId) {
            return {
                ok: false,
                status: 403,
                error: "Stripe Connect account is not linked. Connect Stripe in Profile first.",
                code: "STRIPE_CONNECT_REQUIRED",
            }
        }

        const connectedAccount = await stripe.accounts.retrieve(connectedAccountId)
        const flags = toAccountFlags(connectedAccount)

        await upsertStripeConnectProfile(supabase, input.userId, {
            stripe_account_id: connectedAccountId,
            stripe_details_submitted: flags.detailsSubmitted,
            stripe_charges_enabled: flags.chargesEnabled,
            stripe_payouts_enabled: flags.payoutsEnabled,
            stripe_onboarded_at: flags.detailsSubmitted && flags.chargesEnabled
                ? (profile?.stripe_onboarded_at || new Date().toISOString())
                : profile?.stripe_onboarded_at || null,
        })

        if (!flags.detailsSubmitted || !flags.chargesEnabled) {
            return {
                ok: false,
                status: 403,
                error: "Stripe Connect onboarding is incomplete. Complete onboarding in Profile first.",
                code: "STRIPE_CONNECT_INCOMPLETE",
            }
        }

        const metadata: Record<string, string> = {
            estimateId: input.estimateId,
            estimateNumber: input.estimateNumber,
            userId: input.userId,
        }
        const successRedirectUrl = buildPaymentSuccessRedirectUrl({
            estimateId: input.estimateId,
            estimateNumber: input.estimateNumber,
        })

        const paymentLink = await stripe.paymentLinks.create(
            {
                metadata,
                payment_intent_data: {
                    metadata,
                },
                line_items: [
                    {
                        price_data: {
                            currency: STRIPE_PAYMENT_LINK_CURRENCY,
                            product_data: {
                                name: input.estimateNumber
                                    ? `Estimate Payment - ${input.estimateNumber}`
                                    : "Estimate Payment",
                                description: input.customerName
                                    ? `Service for ${input.customerName}`
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

        return { ok: true, url: paymentLink.url, id: paymentLink.id }
    } catch (error: unknown) {
        return toFailure(error)
    }
}

/** Turns an old payment link off. Never throws; failures become an ops alert. */
export async function deactivatePaymentLink(input: { userId: string; paymentLinkId: string }): Promise<void> {
    try {
        if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured")
        const supabase = createServiceSupabaseClient()
        if (!supabase) throw new Error("Supabase service configuration is missing")

        const { data: profile, error } = await getStripeConnectProfile(supabase, input.userId)
        if (error) throw new Error(error.message)
        const stripeAccount = profile?.stripe_account_id?.trim() || ""
        if (!stripeAccount) throw new Error("Stripe Connect account is not linked")

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-12-15.clover" })
        await stripe.paymentLinks.update(input.paymentLinkId, { active: false }, { stripeAccount })
    } catch (error: unknown) {
        console.error("Failed to deactivate payment link:", error)
        await recordOpsAlert({
            source: "payment_link",
            severity: "warning",
            alertKey: `payment_link_deactivate_failed:${input.paymentLinkId}`,
            message: "Failed to deactivate previous Stripe payment link",
            context: {
                userId: input.userId,
                paymentLinkId: input.paymentLinkId,
                error: error instanceof Error ? error.message : String(error),
            },
        }).catch(() => undefined)
    }
}

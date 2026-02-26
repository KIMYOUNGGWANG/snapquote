import { NextResponse } from "next/server"
import Stripe from "stripe"
import { recordOpsAlert } from "@/lib/ops-alerts"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import {
    getSubscriptionPriceId,
    normalizeSubscriptionStatus,
    toPlanTierFromSubscription,
    unixToIso,
} from "@/lib/server/stripe-billing"

type BillingStateInput = {
    customerId?: string | null
    subscriptionId?: string | null
    status?: string | null
    priceId?: string | null
    metadataPlanTier?: string | null
    currentPeriodEnd?: string | null
    cancelAtPeriodEnd?: boolean
}

function toNonEmptyString(value: unknown): string {
    if (typeof value !== "string") return ""
    return value.trim()
}

function toStripeId(value: unknown): string {
    if (typeof value === "string") return value.trim()
    if (value && typeof value === "object" && "id" in value) {
        return toNonEmptyString((value as { id?: unknown }).id)
    }
    return ""
}

function readMetadataUserId(metadata: Stripe.Metadata | null | undefined): string {
    if (!metadata || typeof metadata !== "object") return ""
    return toNonEmptyString(metadata.userId)
}

function readMetadataPlanTier(metadata: Stripe.Metadata | null | undefined): string {
    if (!metadata || typeof metadata !== "object") return ""
    return toNonEmptyString(metadata.planTier)
}

async function resolveUserIdByCustomer(supabase: ReturnType<typeof createServiceSupabaseClient>, customerId: string): Promise<string> {
    if (!supabase || !customerId) return ""

    const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle()

    if (error || !data?.id) return ""
    return data.id
}

async function applyBillingState(
    supabase: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
    userId: string,
    input: BillingStateInput
) {
    const normalizedStatus = normalizeSubscriptionStatus(input.status)
    const normalizedPriceId = toNonEmptyString(input.priceId)
    const planTier = toPlanTierFromSubscription({
        status: normalizedStatus,
        priceId: normalizedPriceId || null,
        metadataPlanTier: input.metadataPlanTier,
    })

    const payload = {
        id: userId,
        plan_tier: planTier,
        stripe_customer_id: toNonEmptyString(input.customerId) || null,
        stripe_subscription_id: toNonEmptyString(input.subscriptionId) || null,
        stripe_subscription_status: normalizedStatus,
        stripe_subscription_price_id: normalizedPriceId || null,
        stripe_subscription_current_period_end: input.currentPeriodEnd || null,
        stripe_cancel_at_period_end: Boolean(input.cancelAtPeriodEnd),
        stripe_subscription_updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" })

    if (error) {
        throw error
    }
}

async function resolveStateFromSubscription(
    stripe: Stripe,
    subscriptionId: string
): Promise<BillingStateInput | null> {
    if (!subscriptionId) return null

    const subscription = (await stripe.subscriptions.retrieve(subscriptionId)) as unknown as Stripe.Subscription
    const customerId = toStripeId(subscription.customer)
    const priceId = getSubscriptionPriceId(subscription)
    const status = normalizeSubscriptionStatus(subscription.status)

    return {
        customerId,
        subscriptionId: subscription.id,
        status,
        priceId,
        metadataPlanTier: readMetadataPlanTier(subscription.metadata),
        currentPeriodEnd: unixToIso(getSubscriptionCurrentPeriodEndUnix(subscription)),
        cancelAtPeriodEnd: getSubscriptionCancelAtPeriodEnd(subscription),
    }
}

function getSubscriptionCurrentPeriodEndUnix(subscription: Stripe.Subscription): number | null {
    const raw = (subscription as any).current_period_end ?? (subscription as any).currentPeriodEnd
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null
}

function getSubscriptionCancelAtPeriodEnd(subscription: Stripe.Subscription): boolean {
    const raw = (subscription as any).cancel_at_period_end ?? (subscription as any).cancelAtPeriodEnd
    return Boolean(raw)
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string {
    const raw =
        (invoice as any).subscription ??
        (invoice as any).parent?.subscription_details?.subscription
    return toStripeId(raw)
}

export async function POST(req: Request) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim()
    const webhookSecret = process.env.STRIPE_BILLING_WEBHOOK_SECRET?.trim()

    if (!stripeSecretKey || !webhookSecret) {
        await recordOpsAlert({
            source: "stripe_billing_webhook",
            severity: "error",
            alertKey: "stripe_billing_webhook_missing_config",
            message: "Missing Stripe Billing webhook configuration",
            context: {
                hasStripeSecretKey: Boolean(stripeSecretKey),
                hasBillingWebhookSecret: Boolean(webhookSecret),
            },
        })
        return new NextResponse("Server configuration error", { status: 500 })
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        await recordOpsAlert({
            source: "stripe_billing_webhook",
            severity: "error",
            alertKey: "stripe_billing_webhook_missing_supabase",
            message: "Missing Supabase service configuration for billing webhook handler",
        })
        return new NextResponse("Server configuration error", { status: 500 })
    }

    const signature = req.headers.get("stripe-signature")
    if (!signature) {
        await recordOpsAlert({
            source: "stripe_billing_webhook",
            severity: "warning",
            alertKey: "stripe_billing_webhook_missing_signature",
            message: "Stripe billing webhook request missing signature",
        })
        return new NextResponse("Webhook Error: Missing signature", { status: 400 })
    }

    const body = await req.text()
    const stripe = new Stripe(stripeSecretKey, {
        apiVersion: "2025-12-15.clover",
    })

    let event: Stripe.Event
    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (error: any) {
        await recordOpsAlert({
            source: "stripe_billing_webhook",
            severity: "warning",
            alertKey: "stripe_billing_webhook_signature_verification_failed",
            message: "Stripe billing webhook signature verification failed",
            context: { error: error?.message || "unknown" },
        })
        return new NextResponse(`Webhook Error: ${error?.message || "invalid signature"}`, { status: 400 })
    }

    try {
        if (event.type === "checkout.session.completed") {
            const session = event.data.object as Stripe.Checkout.Session
            if (session.mode !== "subscription") {
                return new NextResponse("Received", { status: 200 })
            }

            const customerId = toStripeId(session.customer)
            const subscriptionId = toStripeId(session.subscription)

            let userId =
                readMetadataUserId(session.metadata) ||
                toNonEmptyString(session.client_reference_id)

            if (!userId && customerId) {
                userId = await resolveUserIdByCustomer(supabase, customerId)
            }

            if (!userId) {
                await recordOpsAlert({
                    source: "stripe_billing_webhook",
                    severity: "warning",
                    alertKey: "stripe_billing_webhook_missing_user_mapping",
                    message: "Unable to resolve user for checkout.session.completed",
                    context: { customerId, subscriptionId },
                })
                return new NextResponse("Received", { status: 200 })
            }

            if (subscriptionId) {
                const state = await resolveStateFromSubscription(stripe, subscriptionId)
                if (state) {
                    await applyBillingState(supabase, userId, state)
                }
            } else {
                await applyBillingState(supabase, userId, {
                    customerId,
                    subscriptionId: null,
                    status: null,
                    priceId: null,
                    currentPeriodEnd: null,
                    cancelAtPeriodEnd: false,
                })
            }

            return new NextResponse("Received", { status: 200 })
        }

        if (
            event.type === "customer.subscription.created" ||
            event.type === "customer.subscription.updated" ||
            event.type === "customer.subscription.deleted"
        ) {
            const subscription = event.data.object as Stripe.Subscription
            const customerId = toStripeId(subscription.customer)
            let userId = readMetadataUserId(subscription.metadata)

            if (!userId && customerId) {
                userId = await resolveUserIdByCustomer(supabase, customerId)
            }

            if (!userId) {
                await recordOpsAlert({
                    source: "stripe_billing_webhook",
                    severity: "warning",
                    alertKey: "stripe_billing_webhook_missing_user_mapping",
                    message: "Unable to resolve user for subscription event",
                    context: {
                        eventType: event.type,
                        customerId,
                        subscriptionId: subscription.id,
                    },
                })
                return new NextResponse("Received", { status: 200 })
            }

            await applyBillingState(supabase, userId, {
                customerId,
                subscriptionId: subscription.id,
                status: normalizeSubscriptionStatus(subscription.status),
                priceId: getSubscriptionPriceId(subscription),
                metadataPlanTier: readMetadataPlanTier(subscription.metadata),
                currentPeriodEnd: unixToIso(getSubscriptionCurrentPeriodEndUnix(subscription)),
                cancelAtPeriodEnd: getSubscriptionCancelAtPeriodEnd(subscription),
            })

            return new NextResponse("Received", { status: 200 })
        }

        if (event.type === "invoice.payment_failed") {
            const invoice = event.data.object as Stripe.Invoice
            const customerId = toStripeId(invoice.customer)
            const subscriptionId = getInvoiceSubscriptionId(invoice)

            let userId = readMetadataUserId(invoice.metadata)
            if (!userId && customerId) {
                userId = await resolveUserIdByCustomer(supabase, customerId)
            }

            if (!userId) {
                await recordOpsAlert({
                    source: "stripe_billing_webhook",
                    severity: "warning",
                    alertKey: "stripe_billing_webhook_missing_user_mapping",
                    message: "Unable to resolve user for invoice.payment_failed",
                    context: { customerId, subscriptionId },
                })
                return new NextResponse("Received", { status: 200 })
            }

            if (subscriptionId) {
                const subscriptionState = await resolveStateFromSubscription(stripe, subscriptionId)
                if (subscriptionState) {
                    await applyBillingState(supabase, userId, subscriptionState)
                    return new NextResponse("Received", { status: 200 })
                }
            }

            await applyBillingState(supabase, userId, {
                customerId,
                subscriptionId: subscriptionId || null,
                status: "past_due",
                priceId: null,
                currentPeriodEnd: null,
                cancelAtPeriodEnd: false,
            })
        }

        return new NextResponse("Received", { status: 200 })
    } catch (error: any) {
        console.error("Stripe billing webhook error:", error)
        await recordOpsAlert({
            source: "stripe_billing_webhook",
            severity: "error",
            alertKey: "stripe_billing_webhook_handler_failure",
            message: "Unhandled Stripe billing webhook failure",
            context: {
                eventType: event.type,
                error: error?.message || "unknown",
            },
        })
        return new NextResponse("Webhook handler error", { status: 500 })
    }
}

import { NextResponse } from "next/server"
import Stripe from "stripe"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createAuthedSupabaseClient, parseBearerToken } from "@/lib/server/supabase-auth"
import { createServiceSupabaseClient, ensureProfileExists } from "@/lib/server/stripe-connect"
import {
    type PaidBillingPlanTier,
    getBillingPlanPriceId,
    isAllowedBillingPriceId,
    isPaidSubscriptionStatus,
    normalizePaidPlanTier,
    normalizeRelativePath,
    resolvePlanTierByPriceId,
} from "@/lib/server/stripe-billing"

interface BillingProfileRow {
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    stripe_subscription_status: string | null
}

function toSafeString(value: unknown, maxLength: number): string {
    if (typeof value !== "string") return ""
    return value.trim().slice(0, maxLength)
}

async function resolveUserEmail(req: Request): Promise<string | null> {
    const token = parseBearerToken(req)
    if (!token) return null

    const authedSupabase = createAuthedSupabaseClient(token)
    if (!authedSupabase) return null

    const {
        data: { user },
    } = await authedSupabase.auth.getUser()

    if (!user?.email || typeof user.email !== "string") return null
    const email = user.email.trim()
    return email || null
}

export async function POST(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `billing-checkout:${auth.userId}:${ip}`,
        limit: 20,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim()
    let appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
    if (!stripeSecretKey || !appUrl) {
        return NextResponse.json(
            { error: { message: "Billing is not configured", code: 500 } },
            { status: 500 }
        )
    }

    if (!appUrl.startsWith("http://") && !appUrl.startsWith("https://")) {
        appUrl = `https://${appUrl}`
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json(
            { error: { message: "Supabase service configuration is missing", code: 500 } },
            { status: 500 }
        )
    }

    const body = await req.json().catch(() => ({}))
    const normalizedPlanTier = normalizePaidPlanTier(body?.planTier)
    const selectedPlanTier: PaidBillingPlanTier = normalizedPlanTier || "pro"
    if (body?.planTier && !normalizedPlanTier) {
        return NextResponse.json(
            { error: { message: "Invalid planTier", code: 400 } },
            { status: 400 }
        )
    }

    const requestedPriceId = toSafeString(body?.priceId, 120)
    if (requestedPriceId && !isAllowedBillingPriceId(requestedPriceId)) {
        return NextResponse.json(
            { error: { message: "Invalid priceId", code: 400 } },
            { status: 400 }
        )
    }

    const requestedPriceTier = requestedPriceId ? resolvePlanTierByPriceId(requestedPriceId) : null
    if (requestedPriceId && requestedPriceTier && requestedPriceTier !== selectedPlanTier) {
        return NextResponse.json(
            { error: { message: "priceId does not match selected planTier", code: 400 } },
            { status: 400 }
        )
    }

    const configuredPriceId = getBillingPlanPriceId(selectedPlanTier)
    const selectedPriceId = requestedPriceId || configuredPriceId
    if (!selectedPriceId) {
        return NextResponse.json(
            { error: { message: "Selected plan is not configured", code: 500 } },
            { status: 500 }
        )
    }
    const successPath = normalizeRelativePath(body?.successPath, "/pricing?checkout=success")
    const cancelPath = normalizeRelativePath(body?.cancelPath, "/pricing?checkout=cancel")

    try {
        await ensureProfileExists(supabase, auth.userId)

        const { data: profileData, error: profileError } = await supabase
            .from("profiles")
            .select("stripe_customer_id, stripe_subscription_id, stripe_subscription_status")
            .eq("id", auth.userId)
            .maybeSingle()

        if (profileError) {
            return NextResponse.json(
                { error: { message: "Failed to load billing profile", code: 500 } },
                { status: 500 }
            )
        }

        const profile = (profileData as BillingProfileRow | null) ?? null
        if (
            isPaidSubscriptionStatus(profile?.stripe_subscription_status) &&
            profile?.stripe_customer_id &&
            profile?.stripe_subscription_id
        ) {
            return NextResponse.json(
                { error: { message: "Subscription already active", code: 409 } },
                { status: 409 }
            )
        }

        const stripe = new Stripe(stripeSecretKey, {
            apiVersion: "2025-12-15.clover",
        })

        let customerId = profile?.stripe_customer_id?.trim() || ""
        if (!customerId) {
            const email = await resolveUserEmail(req)
            const customer = await stripe.customers.create({
                ...(email ? { email } : {}),
                metadata: { userId: auth.userId },
            })
            customerId = customer.id
        }

        await supabase
            .from("profiles")
            .upsert(
                {
                    id: auth.userId,
                    stripe_customer_id: customerId,
                    stripe_subscription_updated_at: new Date().toISOString(),
                },
                { onConflict: "id" }
            )

        const checkoutSession = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: customerId,
            client_reference_id: auth.userId,
            line_items: [{ price: selectedPriceId, quantity: 1 }],
            success_url: new URL(successPath, appUrl).toString(),
            cancel_url: new URL(cancelPath, appUrl).toString(),
            allow_promotion_codes: true,
            metadata: {
                userId: auth.userId,
                planTier: selectedPlanTier,
            },
            subscription_data: {
                metadata: {
                    userId: auth.userId,
                    planTier: selectedPlanTier,
                },
            },
        })

        if (!checkoutSession.url) {
            return NextResponse.json(
                { error: { message: "Failed to create checkout session", code: 500 } },
                { status: 500 }
            )
        }

        return NextResponse.json({
            url: checkoutSession.url,
            sessionId: checkoutSession.id,
            customerId,
            planTier: selectedPlanTier,
        })
    } catch (error: any) {
        console.error("Stripe Billing checkout error:", error)

        const stripeType = typeof error?.type === "string" ? error.type : ""
        const status = stripeType === "StripeAuthenticationError" ? 401 : 500
        const message = status === 401
            ? "Stripe authentication failed"
            : "Failed to create billing checkout session"

        return NextResponse.json(
            { error: { message, code: status } },
            { status }
        )
    }
}

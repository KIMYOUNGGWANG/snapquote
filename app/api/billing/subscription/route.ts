import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import {
    isPaidSubscriptionStatus,
    normalizeBillingPlanTier,
    normalizeSubscriptionStatus,
} from "@/lib/server/stripe-billing"

function toPlanTier(value: unknown): "free" | "starter" | "pro" | "team" {
    return normalizeBillingPlanTier(value)
}

function toOptionalIsoString(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed
}

export async function GET(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `billing-subscription:${auth.userId}:${ip}`,
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

    const { data: profile, error } = await supabase
        .from("profiles")
        .select(
            "plan_tier, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_subscription_price_id, stripe_subscription_current_period_end, stripe_cancel_at_period_end"
        )
        .eq("id", auth.userId)
        .maybeSingle()

    if (error) {
        return NextResponse.json(
            { error: { message: "Failed to load subscription status", code: 500 } },
            { status: 500 }
        )
    }

    const planTier = toPlanTier(profile?.plan_tier)
    const status = normalizeSubscriptionStatus(profile?.stripe_subscription_status)
    const subscribed = isPaidSubscriptionStatus(status)
    const customerId =
        typeof profile?.stripe_customer_id === "string" ? profile.stripe_customer_id.trim() : ""
    const subscriptionId =
        typeof profile?.stripe_subscription_id === "string" ? profile.stripe_subscription_id.trim() : ""
    const priceId =
        typeof profile?.stripe_subscription_price_id === "string"
            ? profile.stripe_subscription_price_id.trim()
            : ""
    const currentPeriodEnd = toOptionalIsoString(profile?.stripe_subscription_current_period_end)
    const cancelAtPeriodEnd = Boolean(profile?.stripe_cancel_at_period_end)

    return NextResponse.json({
        ok: true,
        planTier,
        subscribed,
        status,
        ...(customerId ? { customerId } : {}),
        ...(subscriptionId ? { subscriptionId } : {}),
        ...(priceId ? { priceId } : {}),
        ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
        cancelAtPeriodEnd,
    })
}

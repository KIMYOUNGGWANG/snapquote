import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import {
    normalizeBillingPlanTier,
} from "@/lib/server/stripe-billing"
import { resolveEffectiveSubscriptionView } from "@/lib/server/effective-plan"

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
            "plan_tier, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_subscription_price_id, stripe_subscription_current_period_end, stripe_cancel_at_period_end, referral_trial_ends_at, referral_bonus_ends_at, referral_credit_balance_months"
        )
        .eq("id", auth.userId)
        .maybeSingle()

    if (error) {
        return NextResponse.json(
            { error: { message: "Failed to load subscription status", code: 500 } },
            { status: 500 }
        )
    }

    const normalizedPlanTier = normalizeBillingPlanTier(profile?.plan_tier)
    const view = resolveEffectiveSubscriptionView({
        ...profile,
        plan_tier: normalizedPlanTier,
    })
    const customerId =
        typeof profile?.stripe_customer_id === "string" ? profile.stripe_customer_id.trim() : ""
    const subscriptionId =
        typeof profile?.stripe_subscription_id === "string" ? profile.stripe_subscription_id.trim() : ""
    const priceId =
        typeof profile?.stripe_subscription_price_id === "string"
            ? profile.stripe_subscription_price_id.trim()
            : ""
    const cancelAtPeriodEnd = Boolean(profile?.stripe_cancel_at_period_end)

    return NextResponse.json({
        ok: true,
        planTier: view.planTier,
        subscribed: view.subscribed,
        status: view.status,
        ...(customerId ? { customerId } : {}),
        ...(subscriptionId ? { subscriptionId } : {}),
        ...(priceId ? { priceId } : {}),
        ...(view.currentPeriodEnd ? { currentPeriodEnd: view.currentPeriodEnd } : {}),
        cancelAtPeriodEnd,
    })
}

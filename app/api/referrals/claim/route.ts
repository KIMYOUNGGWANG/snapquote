import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient, ensureProfileExists } from "@/lib/server/stripe-connect"
import {
    REFERRAL_TOKEN_PATTERN,
    addDaysIso,
    asTrimmedReferralSource,
    normalizeReferralToken,
    toNonNegativeInt,
    toOptionalIsoString,
} from "@/lib/server/referrals"
import { isPaidSubscriptionStatus } from "@/lib/server/stripe-billing"

function hasActiveStripeSubscription(profile: Record<string, unknown> | null | undefined): boolean {
    const subscriptionId =
        typeof profile?.stripe_subscription_id === "string" ? profile.stripe_subscription_id.trim() : ""
    return Boolean(subscriptionId) && isPaidSubscriptionStatus(profile?.stripe_subscription_status)
}

export async function POST(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `referral-claim:${auth.userId}:${ip}`,
        limit: 20,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    let body: any
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: { message: "Invalid request payload", code: 400 } },
            { status: 400 }
        )
    }

    const token = normalizeReferralToken(body?.token)
    const source = asTrimmedReferralSource(body?.source)
    if (!REFERRAL_TOKEN_PATTERN.test(token)) {
        return NextResponse.json(
            { error: { message: "Invalid token", code: 400 } },
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

    const { data: existingClaim, error: existingClaimError } = await supabase
        .from("referral_claims")
        .select("id, referrer_reward_mode, referrer_reward_ends_at, referred_reward_ends_at, reward_credit_months")
        .eq("referred_user_id", auth.userId)
        .maybeSingle()

    if (existingClaimError) {
        return NextResponse.json(
            { error: { message: "Failed to load referral claim state", code: 500 } },
            { status: 500 }
        )
    }

    if (existingClaim?.id) {
        return NextResponse.json({
            ok: true,
            claimed: false,
            deduped: true,
            reason: "already_claimed",
            referrerReward: {
                mode:
                    existingClaim.referrer_reward_mode === "pro_trial" ||
                    existingClaim.referrer_reward_mode === "pending_credit"
                        ? existingClaim.referrer_reward_mode
                        : "none",
                ...(toOptionalIsoString(existingClaim.referrer_reward_ends_at)
                    ? { endsAt: existingClaim.referrer_reward_ends_at.trim() }
                    : {}),
                ...(toNonNegativeInt(existingClaim.reward_credit_months) > 0
                    ? { creditMonths: toNonNegativeInt(existingClaim.reward_credit_months) }
                    : {}),
            },
            referredReward: {
                applied: Boolean(toOptionalIsoString(existingClaim.referred_reward_ends_at)),
                ...(toOptionalIsoString(existingClaim.referred_reward_ends_at)
                    ? {
                          planTier: "pro",
                          endsAt: existingClaim.referred_reward_ends_at.trim(),
                      }
                    : {}),
            },
        })
    }

    const { data: tokenRow, error: tokenError } = await supabase
        .from("referral_tokens")
        .select("token, user_id")
        .eq("token", token)
        .maybeSingle()

    if (tokenError) {
        return NextResponse.json(
            { error: { message: "Failed to resolve referral token", code: 500 } },
            { status: 500 }
        )
    }

    const referrerUserId = typeof tokenRow?.user_id === "string" ? tokenRow.user_id : ""
    if (!referrerUserId) {
        return NextResponse.json({
            ok: true,
            claimed: false,
            reason: "token_not_found",
            referrerReward: { mode: "none" },
            referredReward: { applied: false },
        })
    }

    if (referrerUserId === auth.userId) {
        return NextResponse.json({
            ok: true,
            claimed: false,
            reason: "self_referral",
            referrerReward: { mode: "none" },
            referredReward: { applied: false },
        })
    }

    const { data: insertedClaim, error: insertClaimError } = await supabase
        .from("referral_claims")
        .insert({
            token,
            referrer_user_id: referrerUserId,
            referred_user_id: auth.userId,
            source,
            status: "processing",
        })
        .select("id")
        .single()

    if (insertClaimError) {
        if (insertClaimError.code === "23505") {
            return NextResponse.json({
                ok: true,
                claimed: false,
                deduped: true,
                reason: "already_claimed",
                referrerReward: { mode: "none" },
                referredReward: { applied: false },
            })
        }

        return NextResponse.json(
            { error: { message: "Failed to create referral claim", code: 500 } },
            { status: 500 }
        )
    }

    const claimId = typeof insertedClaim?.id === "string" ? insertedClaim.id : ""
    const failClaim = async (message: string) => {
        if (claimId) {
            await supabase
                .from("referral_claims")
                .update({ status: "failed", updated_at: new Date().toISOString() })
                .eq("id", claimId)
        }

        return NextResponse.json(
            { error: { message, code: 500 } },
            { status: 500 }
        )
    }

    const [referredProfileResult, referrerProfileResult] = await Promise.all([
        supabase
            .from("profiles")
            .select(
                "plan_tier, stripe_subscription_status, stripe_subscription_current_period_end, stripe_subscription_id, referral_trial_ends_at"
            )
            .eq("id", auth.userId)
            .maybeSingle(),
        supabase
            .from("profiles")
            .select(
                "plan_tier, stripe_subscription_status, stripe_subscription_current_period_end, stripe_subscription_id, referral_bonus_ends_at, referral_credit_balance_months"
            )
            .eq("id", referrerUserId)
            .maybeSingle(),
    ])

    if (referredProfileResult.error || referrerProfileResult.error) {
        return failClaim("Failed to load referral reward state")
    }

    const referredProfile = (referredProfileResult.data || {}) as Record<string, unknown>
    const referrerProfile = (referrerProfileResult.data || {}) as Record<string, unknown>

    let referrerRewardMode: "pro_trial" | "pending_credit" | "none" = "none"
    let referrerRewardEndsAt: string | null = null
    let rewardCreditMonths = 0
    let referredRewardEndsAt: string | null = null

    if (!hasActiveStripeSubscription(referredProfile)) {
        referredRewardEndsAt = addDaysIso(14)
        const { error } = await supabase.from("profiles").upsert(
            {
                id: auth.userId,
                plan_tier: "pro",
                stripe_subscription_status: "trialing",
                stripe_subscription_current_period_end: referredRewardEndsAt,
                stripe_cancel_at_period_end: false,
                referral_trial_ends_at: referredRewardEndsAt,
                referred_by_token: token,
            },
            { onConflict: "id" }
        )

        if (error) {
            return failClaim("Failed to apply referred-user reward")
        }
    }

    if (hasActiveStripeSubscription(referrerProfile)) {
        rewardCreditMonths = 1
        const nextCreditBalance = toNonNegativeInt(referrerProfile.referral_credit_balance_months) + rewardCreditMonths
        const { error } = await supabase.from("profiles").upsert(
            {
                id: referrerUserId,
                referral_credit_balance_months: nextCreditBalance,
            },
            { onConflict: "id" }
        )

        if (error) {
            return failClaim("Failed to bank referrer credit")
        }

        referrerRewardMode = "pending_credit"
    } else {
        const baseEnd = toOptionalIsoString(referrerProfile.referral_bonus_ends_at)
        referrerRewardEndsAt = addDaysIso(30, baseEnd)
        const { error } = await supabase.from("profiles").upsert(
            {
                id: referrerUserId,
                plan_tier: "pro",
                stripe_subscription_status: "trialing",
                stripe_subscription_current_period_end: referrerRewardEndsAt,
                stripe_cancel_at_period_end: false,
                referral_bonus_ends_at: referrerRewardEndsAt,
            },
            { onConflict: "id" }
        )

        if (error) {
            return failClaim("Failed to apply referrer reward")
        }

        referrerRewardMode = "pro_trial"
    }

    const { error: finalizeError } = await supabase
        .from("referral_claims")
        .update({
            status: "granted",
            referrer_reward_mode: referrerRewardMode,
            referrer_reward_ends_at: referrerRewardEndsAt,
            referred_reward_ends_at: referredRewardEndsAt,
            reward_credit_months: rewardCreditMonths,
            updated_at: new Date().toISOString(),
        })
        .eq("id", claimId)

    if (finalizeError) {
        return failClaim("Failed to finalize referral claim")
    }

    return NextResponse.json({
        ok: true,
        claimed: true,
        referrerReward: {
            mode: referrerRewardMode,
            ...(referrerRewardEndsAt ? { endsAt: referrerRewardEndsAt } : {}),
            ...(rewardCreditMonths > 0 ? { creditMonths: rewardCreditMonths } : {}),
        },
        referredReward: {
            applied: Boolean(referredRewardEndsAt),
            ...(referredRewardEndsAt ? { planTier: "pro", endsAt: referredRewardEndsAt } : {}),
        },
    })
}

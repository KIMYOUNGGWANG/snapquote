import {
    isPaidSubscriptionStatus,
    normalizeBillingPlanTier,
    normalizeSubscriptionStatus,
    type BillingPlanTier,
} from "@/lib/server/stripe-billing"
import { isFutureIso, toNonNegativeInt, toOptionalIsoString } from "@/lib/server/referrals"

export type ActiveReferralReward =
    | {
          kind: "referred_trial" | "referrer_bonus"
          planTier: "pro"
          endsAt: string
      }
    | null

export type EffectivePlanProfileRow = {
    plan_tier?: unknown
    stripe_subscription_status?: unknown
    stripe_subscription_current_period_end?: unknown
    referral_trial_ends_at?: unknown
    referral_bonus_ends_at?: unknown
    referral_credit_balance_months?: unknown
    stripe_customer_id?: unknown
    stripe_subscription_id?: unknown
    stripe_subscription_price_id?: unknown
    stripe_cancel_at_period_end?: unknown
}

export function resolveActiveReferralReward(
    profile: EffectivePlanProfileRow | null | undefined
): ActiveReferralReward {
    if (!profile) return null

    const referralTrialEndsAt = toOptionalIsoString(profile.referral_trial_ends_at)
    if (referralTrialEndsAt && isFutureIso(referralTrialEndsAt)) {
        return {
            kind: "referred_trial",
            planTier: "pro",
            endsAt: referralTrialEndsAt,
        }
    }

    const referralBonusEndsAt = toOptionalIsoString(profile.referral_bonus_ends_at)
    if (referralBonusEndsAt && isFutureIso(referralBonusEndsAt)) {
        return {
            kind: "referrer_bonus",
            planTier: "pro",
            endsAt: referralBonusEndsAt,
        }
    }

    return null
}

export function resolveEffectivePlanTier(
    profile: EffectivePlanProfileRow | null | undefined
): BillingPlanTier {
    const normalizedPlanTier = normalizeBillingPlanTier(profile?.plan_tier)
    const paidStatusActive = isPaidSubscriptionStatus(profile?.stripe_subscription_status)

    if (paidStatusActive) {
        return normalizedPlanTier === "free" ? "pro" : normalizedPlanTier
    }

    const activeReward = resolveActiveReferralReward(profile)
    if (activeReward) {
        return activeReward.planTier
    }

    const hadReferralWindow =
        Boolean(toOptionalIsoString(profile?.referral_trial_ends_at)) ||
        Boolean(toOptionalIsoString(profile?.referral_bonus_ends_at))

    if (hadReferralWindow && normalizedPlanTier === "pro") {
        return "free"
    }

    return normalizedPlanTier
}

export function resolveEffectiveSubscriptionView(
    profile: EffectivePlanProfileRow | null | undefined
): {
    planTier: BillingPlanTier
    status:
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "unpaid"
        | "paused"
        | null
    subscribed: boolean
    currentPeriodEnd: string | null
    pendingCreditMonths: number
    totalCreditMonths: number
    activeReward: ActiveReferralReward
} {
    const activeReward = resolveActiveReferralReward(profile)
    const paidStatus = normalizeSubscriptionStatus(profile?.stripe_subscription_status)
    const paidStatusActive = isPaidSubscriptionStatus(paidStatus)
    const planTier = resolveEffectivePlanTier(profile)

    if (paidStatusActive) {
        return {
            planTier,
            status: paidStatus,
            subscribed: true,
            currentPeriodEnd: toOptionalIsoString(profile?.stripe_subscription_current_period_end),
            pendingCreditMonths: toNonNegativeInt(profile?.referral_credit_balance_months),
            totalCreditMonths: toNonNegativeInt(profile?.referral_credit_balance_months),
            activeReward,
        }
    }

    if (activeReward) {
        return {
            planTier,
            status: "trialing",
            subscribed: true,
            currentPeriodEnd: activeReward.endsAt,
            pendingCreditMonths: toNonNegativeInt(profile?.referral_credit_balance_months),
            totalCreditMonths: toNonNegativeInt(profile?.referral_credit_balance_months),
            activeReward,
        }
    }

    return {
        planTier,
        status: null,
        subscribed: false,
        currentPeriodEnd: null,
        pendingCreditMonths: toNonNegativeInt(profile?.referral_credit_balance_months),
        totalCreditMonths: toNonNegativeInt(profile?.referral_credit_balance_months),
        activeReward: null,
    }
}

import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient, ensureProfileExists } from "@/lib/server/stripe-connect"
import { resolveEffectiveSubscriptionView } from "@/lib/server/effective-plan"
import {
    buildReferralShareMessages,
    buildReferralShareUrl,
    getOrCreateReferralToken,
    toOptionalIsoString,
} from "@/lib/server/referrals"

type ReferralEventName = "landing_visit" | "quote_share_click" | "signup_start"

function countReferralEvents(events: Array<{ event_name?: unknown }> | null | undefined) {
    const counts: Record<ReferralEventName, number> = {
        landing_visit: 0,
        quote_share_click: 0,
        signup_start: 0,
    }

    for (const event of events || []) {
        const name = typeof event?.event_name === "string" ? event.event_name : ""
        if (name === "landing_visit" || name === "quote_share_click" || name === "signup_start") {
            counts[name] += 1
        }
    }

    return counts
}

export async function GET(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `referral-status:${auth.userId}:${ip}`,
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

    const tokenResult = await getOrCreateReferralToken(supabase, auth.userId)
    if (tokenResult.error || !tokenResult.token) {
        return NextResponse.json(
            { error: { message: tokenResult.error || "Failed to load referral token", code: 500 } },
            { status: 500 }
        )
    }

    const [profileResult, eventsResult, claimsResult] = await Promise.all([
        supabase
            .from("profiles")
            .select(
                "plan_tier, stripe_subscription_status, stripe_subscription_current_period_end, stripe_subscription_id, stripe_customer_id, referral_trial_ends_at, referral_bonus_ends_at, referral_credit_balance_months"
            )
            .eq("id", auth.userId)
            .maybeSingle(),
        supabase
            .from("referral_events")
            .select("event_name")
            .eq("token", tokenResult.token),
        supabase
            .from("referral_claims")
            .select("id, created_at, referrer_reward_mode, referrer_reward_ends_at, referred_reward_ends_at")
            .eq("referrer_user_id", auth.userId)
            .order("created_at", { ascending: false })
            .limit(10),
    ])

    if (profileResult.error || eventsResult.error || claimsResult.error) {
        return NextResponse.json(
            { error: { message: "Failed to load referral status", code: 500 } },
            { status: 500 }
        )
    }

    const counts = countReferralEvents(eventsResult.data as Array<{ event_name?: unknown }>)
    const view = resolveEffectiveSubscriptionView(profileResult.data || {})
    const shareOrigin =
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        new URL(req.url).origin
    const shareUrl = buildReferralShareUrl(shareOrigin, tokenResult.token)
    const shareMessages = buildReferralShareMessages(shareUrl)
    const recentClaims = Array.isArray(claimsResult.data)
        ? claimsResult.data.map((claim: any) => ({
              claimId: typeof claim?.id === "string" ? claim.id : "",
              createdAt: typeof claim?.created_at === "string" ? claim.created_at : new Date().toISOString(),
              referrerRewardMode:
                  claim?.referrer_reward_mode === "pro_trial" || claim?.referrer_reward_mode === "pending_credit"
                      ? claim.referrer_reward_mode
                      : "none",
              ...(toOptionalIsoString(claim?.referrer_reward_ends_at)
                  ? { referrerRewardEndsAt: claim.referrer_reward_ends_at.trim() }
                  : {}),
              ...(toOptionalIsoString(claim?.referred_reward_ends_at)
                  ? { referredRewardEndsAt: claim.referred_reward_ends_at.trim() }
                  : {}),
          }))
        : []

    return NextResponse.json({
        ok: true,
        token: tokenResult.token,
        shareUrl,
        shareMessages,
        metrics: {
            visits: counts.landing_visit,
            shareClicks: counts.quote_share_click,
            signupStarts: counts.signup_start,
            successfulClaims: recentClaims.length,
        },
        rewards: {
            activeReward: view.activeReward,
            pendingCreditMonths: view.pendingCreditMonths,
            totalCreditMonths: view.totalCreditMonths,
        },
        recentClaims,
    })
}

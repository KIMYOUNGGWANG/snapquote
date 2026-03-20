import { withAuthHeaders } from "@/lib/auth-headers"

const TOKEN_PATTERN = /^[a-z0-9]{8,32}$/

interface ReferralTokenResponse {
    ok: boolean
    token: string
}

export interface ReferralStatusResponse {
    ok: true
    token: string
    shareUrl: string
    shareMessages: {
        en: string
        es: string
        ko: string
    }
    metrics: {
        visits: number
        shareClicks: number
        signupStarts: number
        successfulClaims: number
    }
    rewards: {
        activeReward:
            | {
                  kind: "referred_trial" | "referrer_bonus"
                  planTier: "pro"
                  endsAt: string
              }
            | null
        pendingCreditMonths: number
        totalCreditMonths: number
    }
    recentClaims: Array<{
        claimId: string
        createdAt: string
        referrerRewardMode: "pro_trial" | "pending_credit" | "none"
        referrerRewardEndsAt?: string
        referredRewardEndsAt?: string
    }>
}

export interface ReferralClaimResponse {
    ok: true
    claimed: boolean
    deduped?: boolean
    reason?: "self_referral" | "already_claimed" | "token_not_found"
    referrerReward: {
        mode: "pro_trial" | "pending_credit" | "none"
        endsAt?: string
        creditMonths?: number
    }
    referredReward: {
        applied: boolean
        planTier?: "pro"
        endsAt?: string
    }
}

function normalizeToken(value: unknown): string {
    if (typeof value !== "string") return ""
    return value.trim().toLowerCase()
}

export async function getReferralToken(): Promise<string> {
    try {
        const headers = await withAuthHeaders({ "content-type": "application/json" })
        if (!headers.authorization) return ""

        const response = await fetch("/api/referrals/token", {
            method: "POST",
            headers,
            body: JSON.stringify({}),
        })

        if (!response.ok) return ""

        const data = (await response.json()) as Partial<ReferralTokenResponse>
        const token = normalizeToken(data?.token)
        return TOKEN_PATTERN.test(token) ? token : ""
    } catch (error) {
        console.error("Failed to get referral token:", error)
        return ""
    }
}

export async function getReferralShareUrl(options?: { source?: string }): Promise<string> {
    const token = await getReferralToken()
    if (!token || typeof window === "undefined") return ""

    const url = new URL(window.location.origin)
    url.searchParams.set("ref", token)
    if (options?.source) {
        url.searchParams.set("src", options.source)
    }

    return url.toString()
}

export async function copyReferralShareUrl(options?: { source?: string }): Promise<string> {
    const shareUrl = await getReferralShareUrl(options)
    if (!shareUrl) return ""

    await navigator.clipboard.writeText(shareUrl)
    return shareUrl
}

export async function trackReferralEvent(input: {
    token: string
    event: "landing_visit" | "quote_share_click" | "signup_start"
    source?: string
    metadata?: Record<string, unknown>
}): Promise<void> {
    const token = normalizeToken(input.token)
    if (!TOKEN_PATTERN.test(token)) return

    try {
        await fetch("/api/referrals/track", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                token,
                event: input.event,
                source: input.source,
                metadata: input.metadata || {},
            }),
        })
    } catch (error) {
        console.error("Failed to track referral event:", error)
    }
}

export async function claimReferralToken(token: string, source = "app_auth"): Promise<ReferralClaimResponse | null> {
    const normalizedToken = normalizeToken(token)
    if (!TOKEN_PATTERN.test(normalizedToken)) return null

    try {
        const headers = await withAuthHeaders({ "content-type": "application/json" })
        if (!headers.authorization) return null

        const response = await fetch("/api/referrals/claim", {
            method: "POST",
            headers,
            body: JSON.stringify({
                token: normalizedToken,
                source,
            }),
        })

        if (!response.ok) return null
        return (await response.json()) as ReferralClaimResponse
    } catch (error) {
        console.error("Failed to claim referral token:", error)
        return null
    }
}

export async function getReferralStatus(): Promise<ReferralStatusResponse | null> {
    try {
        const headers = await withAuthHeaders()
        if (!headers.authorization) return null

        const response = await fetch("/api/referrals/status", {
            method: "GET",
            headers,
            cache: "no-store",
        })

        if (!response.ok) return null
        return (await response.json()) as ReferralStatusResponse
    } catch (error) {
        console.error("Failed to load referral status:", error)
        return null
    }
}

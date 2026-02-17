import { withAuthHeaders } from "@/lib/auth-headers"

const TOKEN_PATTERN = /^[a-z0-9]{8,32}$/

interface ReferralTokenResponse {
    ok: boolean
    token: string
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

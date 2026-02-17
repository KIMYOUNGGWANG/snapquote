import { supabase } from "@/lib/supabase"

export type AnalyticsEventName =
    | "draft_saved"
    | "quote_sent"
    | "payment_link_created"
    | "payment_completed"
    | "referral_link_copied"
    | "free_quota_warning"
    | "free_quota_limit_hit"

interface TrackEventInput {
    event: AnalyticsEventName
    estimateId?: string
    estimateNumber?: string
    channel?: string
    externalId?: string
    metadata?: Record<string, unknown>
}

export async function trackAnalyticsEvent(input: TrackEventInput): Promise<void> {
    try {
        const {
            data: { session },
        } = await supabase.auth.getSession()

        const accessToken = session?.access_token
        if (!accessToken) return

        await fetch("/api/analytics/events", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(input),
        })
    } catch (error) {
        // Analytics should never block product flows.
        console.error("Analytics event tracking failed:", error)
    }
}

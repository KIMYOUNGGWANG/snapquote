import { withAuthHeaders } from "@/lib/auth-headers"

export type PricingEventName = "pricing_viewed" | "upgrade_clicked" | "waitlist_joined"
export type BillingPlanTier = "free" | "starter" | "pro" | "team"
export type BillingPaidPlanTier = "starter" | "pro" | "team"

export type PricingOfferResponse =
    | {
        ok: true
        experiment: null
        variant: null
      }
    | {
        ok: true
        experiment: { id: string; name: string; currency: string }
        variant: { name: string; priceMonthly?: number; ctaLabel?: string }
      }

export interface BillingSubscriptionStatusResponse {
    ok: true
    planTier: BillingPlanTier
    subscribed: boolean
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
    customerId?: string
    subscriptionId?: string
    priceId?: string
    currentPeriodEnd?: string
    cancelAtPeriodEnd: boolean
}

export interface BillingCheckoutResponse {
    url: string
    sessionId: string
    customerId: string
    planTier: BillingPaidPlanTier
}

export async function getPricingOffer(): Promise<PricingOfferResponse | null> {
    try {
        const headers = await withAuthHeaders()
        if (!headers.authorization) return null

        const response = await fetch("/api/pricing/offer", {
            method: "GET",
            headers,
        })

        if (!response.ok) return null
        return (await response.json()) as PricingOfferResponse
    } catch {
        return null
    }
}

export async function getBillingSubscriptionStatus(): Promise<BillingSubscriptionStatusResponse | null> {
    try {
        const headers = await withAuthHeaders()
        if (!headers.authorization) return null

        const response = await fetch("/api/billing/subscription", {
            method: "GET",
            headers,
            cache: "no-store",
        })

        if (!response.ok) return null
        return (await response.json()) as BillingSubscriptionStatusResponse
    } catch {
        return null
    }
}

export async function createBillingCheckoutSession(input: {
    planTier?: BillingPaidPlanTier
    priceId?: string
} = {}): Promise<BillingCheckoutResponse> {
    const headers = await withAuthHeaders({ "content-type": "application/json" })
    if (!headers.authorization) {
        throw new Error("Log in required")
    }

    const response = await fetch("/api/billing/stripe/checkout", {
        method: "POST",
        headers,
        body: JSON.stringify(input),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.error || "Failed to create checkout session")
    }

    return payload as BillingCheckoutResponse
}

export async function createBillingPortalSession(): Promise<{ url: string }> {
    const headers = await withAuthHeaders({ "content-type": "application/json" })
    if (!headers.authorization) {
        throw new Error("Log in required")
    }

    const response = await fetch("/api/billing/stripe/portal", {
        method: "POST",
        headers,
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.error || "Failed to create billing portal session")
    }

    return payload as { url: string }
}

export async function trackPricingEvent(input: {
    event: PricingEventName
    metadata?: Record<string, unknown>
}): Promise<void> {
    try {
        const headers = await withAuthHeaders({ "content-type": "application/json" })
        if (!headers.authorization) return

        await fetch("/api/pricing/events", {
            method: "POST",
            headers,
            body: JSON.stringify(input),
        })
    } catch {
        // best-effort only
    }
}

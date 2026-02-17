import { withAuthHeaders } from "@/lib/auth-headers"

export type PricingEventName = "pricing_viewed" | "upgrade_clicked" | "waitlist_joined"

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


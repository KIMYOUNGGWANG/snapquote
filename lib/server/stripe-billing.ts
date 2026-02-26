import Stripe from "stripe"

export type PaidBillingPlanTier = "starter" | "pro" | "team"
export type BillingPlanTier = "free" | PaidBillingPlanTier

const PLAN_PRICE_ENV_KEYS: Record<PaidBillingPlanTier, readonly string[]> = {
    starter: [
        "STRIPE_BILLING_PRICE_STARTER_MONTHLY",
        "STRIPE_PRICE_STARTER_MONTHLY",
    ],
    pro: [
        "STRIPE_BILLING_PRICE_PRO_MONTHLY",
        "STRIPE_PRICE_PRO_MONTHLY",
    ],
    team: [
        "STRIPE_BILLING_PRICE_TEAM_MONTHLY",
        "STRIPE_PRICE_TEAM_MONTHLY",
    ],
}

const SUPPORTED_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
])

function getPriceIdByEnvKeys(keys: readonly string[]): string | null {
    for (const key of keys) {
        const value = process.env[key]?.trim()
        if (value) return value
    }
    return null
}

export function normalizePaidPlanTier(value: unknown): PaidBillingPlanTier | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    if (trimmed === "starter" || trimmed === "pro" || trimmed === "team") return trimmed
    return null
}

export function normalizeBillingPlanTier(value: unknown): BillingPlanTier {
    if (value === "free") return "free"
    return normalizePaidPlanTier(value) || "free"
}

export function getBillingPlanPriceId(planTier: PaidBillingPlanTier): string | null {
    return getPriceIdByEnvKeys(PLAN_PRICE_ENV_KEYS[planTier])
}

export function getBillingProPriceId(): string | null {
    return getBillingPlanPriceId("pro")
}

export function resolvePlanTierByPriceId(priceId: string): PaidBillingPlanTier | null {
    const normalizedPriceId = priceId.trim()
    if (!normalizedPriceId) return null

    if (normalizedPriceId === getBillingPlanPriceId("starter")) return "starter"
    if (normalizedPriceId === getBillingPlanPriceId("pro")) return "pro"
    if (normalizedPriceId === getBillingPlanPriceId("team")) return "team"
    return null
}

export function isAllowedBillingPriceId(priceId: string): boolean {
    return Boolean(resolvePlanTierByPriceId(priceId))
}

export function normalizeSubscriptionStatus(value: unknown): Stripe.Subscription.Status | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim() as Stripe.Subscription.Status
    return SUPPORTED_SUBSCRIPTION_STATUSES.has(trimmed) ? trimmed : null
}

export function isPaidSubscriptionStatus(value: unknown): boolean {
    const status = normalizeSubscriptionStatus(value)
    return status === "active" || status === "trialing"
}

export function getSubscriptionPriceId(subscription: Stripe.Subscription): string | null {
    const firstItem = subscription.items.data[0]
    const priceId = firstItem?.price?.id
    if (typeof priceId !== "string") return null
    const trimmed = priceId.trim()
    return trimmed || null
}

export function unixToIso(value: number | null | undefined): string | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null
    return new Date(value * 1000).toISOString()
}

export function toPlanTierFromSubscription(input: {
    status: unknown
    priceId?: string | null
    metadataPlanTier?: unknown
}): BillingPlanTier {
    const paid = isPaidSubscriptionStatus(input.status)
    if (!paid) return "free"

    const metadataPlanTier = normalizePaidPlanTier(input.metadataPlanTier)
    if (metadataPlanTier) return metadataPlanTier

    const normalizedPrice = typeof input.priceId === "string" ? input.priceId.trim() : ""
    if (!normalizedPrice) return "pro"
    const resolvedPlanTier = resolvePlanTierByPriceId(normalizedPrice)
    if (resolvedPlanTier) return resolvedPlanTier

    // Unknown paid price keeps paid tier to avoid accidental downgrade.
    return "pro"
}

export function normalizeRelativePath(path: unknown, fallbackPath: string): string {
    if (typeof path !== "string") return fallbackPath
    const trimmed = path.trim()
    if (!trimmed.startsWith("/")) return fallbackPath
    if (trimmed.startsWith("//")) return fallbackPath
    return trimmed
}

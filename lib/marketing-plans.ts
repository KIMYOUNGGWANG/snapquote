export type MarketingPlanTier = "starter" | "pro" | "team"

export const MARKETING_PLAN_OPTIONS: Array<{
    tier: MarketingPlanTier
    label: string
    priceLabel: string
    monthlyPrice: string
    billingLabel: string
    bestFor: string
    includes: string[]
    pricingCtaLabel: string
}> = [
    {
        tier: "starter",
        label: "Starter",
        priceLabel: "USD $34/mo",
        monthlyPrice: "USD $34",
        billingLabel: "per month",
        bestFor: "Solo owner-operators who speak Spanish or Korean on site and need clean English quotes out fast",
        includes: [
            "Up to 80 field estimates per month",
            "60 transcription minutes for multilingual on-site scope notes",
            "60 sent estimate emails per month",
            "Branded PDF header with your logo and payment link",
            "Spanish/Korean voice capture plus offline quote drafting",
        ],
        pricingCtaLabel: "See Starter Plan",
    },
    {
        tier: "pro",
        label: "Pro",
        priceLabel: "USD $59/mo",
        monthlyPrice: "USD $59",
        billingLabel: "per month",
        bestFor: "Owner-operators who want cleaner English wording, faster approvals, and deposit requests",
        includes: [
            "Up to 250 estimates per month",
            "180 transcription minutes for service-call volume",
            "200 sent estimate emails per month",
            "Receipt scan, English quote cleanup, and payment-ready quotes",
        ],
        pricingCtaLabel: "See Pro Plan",
    },
    {
        tier: "team",
        label: "Team",
        priceLabel: "USD $129/mo",
        monthlyPrice: "USD $129",
        billingLabel: "per month",
        bestFor: "2-10 tech crews standardizing English quote output across multilingual field teams",
        includes: [
            "Up to 800 estimates per month",
            "Shared English quote standards across techs",
            "Automation included",
            "Higher-volume quoting for multiple techs",
            "Priority support",
        ],
        pricingCtaLabel: "See Team Plan",
    },
]

export function getMarketingPlan(tier: string | null | undefined) {
    return MARKETING_PLAN_OPTIONS.find((plan) => plan.tier === tier) || MARKETING_PLAN_OPTIONS[0]
}

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Sparkles, ArrowRight } from "lucide-react"
import {
    createBillingCheckoutSession,
    createBillingPortalSession,
    getBillingSubscriptionStatus,
    getPricingOffer,
    trackPricingEvent,
    type BillingPaidPlanTier,
    type BillingSubscriptionStatusResponse,
    type PricingOfferResponse,
} from "@/lib/pricing"
import { toast } from "@/components/toast"

const PLAN_OPTIONS: Array<{
    tier: BillingPaidPlanTier
    label: string
    priceLabel: string
    includes: string[]
}> = [
    {
        tier: "starter",
        label: "Starter",
        priceLabel: "CAD $29/mo",
        includes: ["80 estimates/mo", "60 transcription minutes", "60 emails/mo"],
    },
    {
        tier: "pro",
        label: "Pro",
        priceLabel: "CAD $59/mo",
        includes: ["250 estimates/mo", "180 transcription minutes", "200 emails/mo"],
    },
    {
        tier: "team",
        label: "Team",
        priceLabel: "CAD $129/mo",
        includes: ["800 estimates/mo", "Team workflows", "Automation included"],
    },
]

export default function PricingPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [offer, setOffer] = useState<PricingOfferResponse | null>(null)
    const [subscription, setSubscription] = useState<BillingSubscriptionStatusResponse | null>(null)
    const [checkoutLoading, setCheckoutLoading] = useState(false)
    const [portalLoading, setPortalLoading] = useState(false)
    const [selectedPlanTier, setSelectedPlanTier] = useState<BillingPaidPlanTier>("starter")

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            const [offerData, subscriptionData] = await Promise.all([
                getPricingOffer(),
                getBillingSubscriptionStatus(),
            ])
            if (cancelled) return
            setOffer(offerData)
            setSubscription(subscriptionData)
            setLoading(false)
        }

        void load()

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        if (typeof window === "undefined") return
        const checkoutState = new URLSearchParams(window.location.search).get("checkout")
        if (checkoutState === "success") {
            toast("✅ Subscription checkout completed. Billing status will refresh shortly.", "success")
            return
        }
        if (checkoutState === "cancel") {
            toast("ℹ️ Subscription checkout was canceled.", "info")
        }
    }, [])

    useEffect(() => {
        const today = new Date().toISOString().slice(0, 10)
        const key = `snapquote_pricing_viewed:${today}`
        if (sessionStorage.getItem(key)) return
        sessionStorage.setItem(key, "1")

        void trackPricingEvent({
            event: "pricing_viewed",
            metadata: { path: "/pricing" },
        })
    }, [])

    const variant = offer?.ok && offer.variant ? offer.variant : null
    const selectedPlan = PLAN_OPTIONS.find((plan) => plan.tier === selectedPlanTier) || PLAN_OPTIONS[0]

    const isSubscribed = Boolean(subscription?.subscribed)

    const handleJoinWaitlist = async () => {
        await trackPricingEvent({
            event: "waitlist_joined",
            metadata: {
                variant: variant?.name || null,
                selectedPlanTier,
            },
        })
        toast("Thanks! We recorded your interest.", "success")
        router.push("/profile")
    }

    const handleUpgradeClick = async () => {
        setCheckoutLoading(true)
        try {
            await trackPricingEvent({
                event: "upgrade_clicked",
                metadata: {
                    variant: variant?.name || null,
                    selectedPlanTier,
                },
            })

            const checkout = await createBillingCheckoutSession({ planTier: selectedPlanTier })
            window.location.href = checkout.url
        } catch (error: any) {
            toast(`❌ ${error?.message || "Failed to start checkout."}`, "error")
        } finally {
            setCheckoutLoading(false)
        }
    }

    const handleManageBillingClick = async () => {
        setPortalLoading(true)
        try {
            const portal = await createBillingPortalSession()
            window.location.href = portal.url
        } catch (error: any) {
            toast(`❌ ${error?.message || "Failed to open billing portal."}`, "error")
        } finally {
            setPortalLoading(false)
        }
    }

    if (loading && !offer) {
        return (
            <div className="space-y-4">
                <Card>
                    <CardContent className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading pricing...
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (!offer) {
        return (
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Pricing</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Log in to see your current plan and subscription options.
                        </p>
                        <Link href="/login" className="block">
                            <Button className="w-full">Log in</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <Card className="border-primary/20">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Starter / Pro / Team
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {PLAN_OPTIONS.map((plan) => (
                            <Button
                                key={plan.tier}
                                type="button"
                                variant={selectedPlanTier === plan.tier ? "default" : "outline"}
                                onClick={() => setSelectedPlanTier(plan.tier)}
                                disabled={checkoutLoading || portalLoading}
                                className="w-full"
                            >
                                {plan.label}
                            </Button>
                        ))}
                    </div>

                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Selected plan</p>
                        <p className="text-2xl font-semibold">
                            {selectedPlan.priceLabel}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Tier: <span className="font-medium uppercase">{selectedPlan.tier}</span>
                        </p>
                        {variant?.name && (
                            <p className="text-xs text-muted-foreground">
                                Variant: <span className="font-mono">{variant.name}</span>
                            </p>
                        )}
                        {subscription && (
                            <p className="text-xs text-muted-foreground">
                                Current plan:{" "}
                                <span className="font-medium uppercase">{subscription.planTier}</span>
                                {subscription.status ? ` (${subscription.status})` : ""}
                            </p>
                        )}
                    </div>

                    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                        <p className="font-medium mb-2">Includes</p>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            {selectedPlan.includes.map((include) => (
                                <li key={include}>{include}</li>
                            ))}
                        </ul>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        <Button
                            onClick={handleUpgradeClick}
                            disabled={checkoutLoading || isSubscribed}
                            className="w-full justify-between"
                        >
                            {checkoutLoading
                                ? "Opening checkout..."
                                : isSubscribed
                                    ? "Subscription already active"
                                    : `Upgrade to ${selectedPlan.label}`}
                            {!isSubscribed && <ArrowRight className="h-4 w-4" />}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={handleManageBillingClick}
                            disabled={portalLoading || !subscription?.customerId}
                            className="w-full"
                        >
                            {portalLoading ? "Opening portal..." : "Manage billing"}
                        </Button>
                        <Button variant="outline" onClick={handleJoinWaitlist} className="w-full">
                            Join waitlist
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

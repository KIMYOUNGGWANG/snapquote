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
import { supabase } from "@/lib/supabase"

const PLAN_OPTIONS: Array<{
    tier: BillingPaidPlanTier
    label: string
    priceLabel: string
    bestFor: string
    includes: string[]
}> = [
        {
            tier: "starter",
            label: "Starter",
            priceLabel: "CAD $29/mo",
            bestFor: "Solo owner-operators quoting from the truck two or more times a week",
            includes: [
                "Up to 80 field estimates per month",
                "60 transcription minutes for on-site scope notes",
                "60 sent estimate emails per month",
                "Voice-first capture plus offline quote drafting",
            ],
        },
        {
            tier: "pro",
            label: "Pro",
            priceLabel: "CAD $59/mo",
            bestFor: "Owner-operators who want cleaner customer-facing wording, faster approvals, and deposit requests",
            includes: [
                "Up to 250 estimates per month",
                "180 transcription minutes for service-call volume",
                "200 sent estimate emails per month",
                "Receipt scan, payment-ready quotes, and better fit for higher-ticket jobs",
            ],
        },
        {
            tier: "team",
            label: "Team",
            priceLabel: "CAD $129/mo",
            bestFor: "2-10 tech crews standardizing field quotes across the team",
            includes: [
                "Up to 800 estimates per month",
                "Shared quoting standards across techs",
                "Automation included",
                "Built for higher-volume quoting and follow-up",
            ],
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
    const [isAuthed, setIsAuthed] = useState(false)

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

            const { data: authData } = await supabase.auth.getSession()
            if (cancelled) return
            setIsAuthed(Boolean(authData.session?.user))

            setLoading(false)
        }

        void load()

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            setIsAuthed(Boolean(session?.user))
        })

        return () => {
            cancelled = true
            authListener.subscription.unsubscribe()
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

    const handleUpgradeClick = async () => {
        if (!isAuthed) {
            toast("Please log in to start your subscription.", "info")
            const params = new URLSearchParams({ next: "/pricing" })
            router.push(`/login?${params.toString()}`)
            return
        }

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

    return (
        <div className="space-y-4">
            <Card className="border-primary/20">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Pricing for trade owner-operators
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading && (
                        <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Checking live pricing and billing status...
                        </div>
                    )}

                    <div className="rounded-lg border bg-primary/5 p-3 text-sm text-muted-foreground">
                        Pay for getting the quote out from the field, not for bloated office software you barely open.
                    </div>

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
                        <p className="text-sm text-foreground">
                            {selectedPlan.bestFor}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Best chosen by quote volume, not by seat count.
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
                        <p className="font-medium mb-2">What you get</p>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            {selectedPlan.includes.map((include) => (
                                <li key={include}>{include}</li>
                            ))}
                        </ul>
                    </div>

                    <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                        Best fit: repair calls, installs, replacements, change orders, and small projects that should be quoted before you drive off.
                    </div>

                    <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                        SnapQuote is not trying to replace dispatch, CRM, or accounting. It is for owner-operators and small crews who need a faster field quote workflow.
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        <Button
                            onClick={handleUpgradeClick}
                            disabled={loading || checkoutLoading || isSubscribed}
                            className="w-full justify-between"
                        >
                            {loading
                                ? "Loading live pricing..."
                                : checkoutLoading
                                ? "Opening checkout..."
                                : isSubscribed
                                    ? "Subscription already active"
                                    : !isAuthed ? "Log in to Subscribe" : `Upgrade to ${selectedPlan.label}`}
                            {!loading && !isSubscribed && <ArrowRight className="h-4 w-4" />}
                        </Button>
                        <Button
                            asChild
                            variant="outline"
                            className="w-full"
                        >
                            <Link href="/new-estimate">
                                Try 10 free field quotes first
                            </Link>
                        </Button>
                        {isAuthed && (
                            <Button
                                variant="outline"
                                onClick={handleManageBillingClick}
                                disabled={loading || portalLoading || !subscription?.customerId}
                                className="w-full"
                            >
                                {portalLoading ? "Opening portal..." : "Manage billing"}
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

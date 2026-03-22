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
    getBillingUsageSnapshot,
    getBillingSubscriptionStatus,
    getPricingOffer,
    trackPricingEvent,
    type BillingPaidPlanTier,
    type BillingUsageSnapshot,
    type BillingSubscriptionStatusResponse,
    type PricingOfferResponse,
} from "@/lib/pricing"
import { toast } from "@/components/toast"
import { supabase } from "@/lib/supabase"
import { FREE_PLAN_MARKETING_QUOTE_LIMIT } from "@/lib/free-tier"

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
            priceLabel: "CAD $34/mo",
            bestFor: "Solo owner-operators who speak Spanish or Korean on site and need clean English quotes out fast",
            includes: [
                "Up to 80 field estimates per month",
                "60 transcription minutes for multilingual on-site scope notes",
                "60 sent estimate emails per month",
                "Branded PDF header with your logo and payment link",
                "Spanish/Korean voice capture plus offline quote drafting",
            ],
        },
        {
            tier: "pro",
            label: "Pro",
            priceLabel: "CAD $59/mo",
            bestFor: "Owner-operators who want cleaner English wording, faster approvals, and deposit requests",
            includes: [
                "Up to 250 estimates per month",
                "180 transcription minutes for service-call volume",
                "200 sent estimate emails per month",
                "Custom full-page PDF background template",
                "QuickBooks sync and photo estimate workflow",
                "Receipt scan, English quote cleanup, and better fit for higher-ticket jobs",
            ],
        },
        {
            tier: "team",
            label: "Team",
            priceLabel: "CAD $129/mo",
            bestFor: "2-10 tech crews standardizing English quote output across multilingual field teams",
            includes: [
                "Up to 800 estimates per month",
                "Shared English quote standards across techs",
                "Shared premium PDF branding workflow",
                "Automation included",
                "Built for higher-volume quoting and follow-up",
            ],
        },
    ]

type BillingInterval = "monthly" | "annual"

export default function PricingPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [offer, setOffer] = useState<PricingOfferResponse | null>(null)
    const [subscription, setSubscription] = useState<BillingSubscriptionStatusResponse | null>(null)
    const [usageSnapshot, setUsageSnapshot] = useState<BillingUsageSnapshot | null>(null)
    const [checkoutLoading, setCheckoutLoading] = useState(false)
    const [portalLoading, setPortalLoading] = useState(false)
    const [selectedPlanTier, setSelectedPlanTier] = useState<BillingPaidPlanTier>("starter")
    const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly")
    const [isAuthed, setIsAuthed] = useState(false)

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            const [offerData, subscriptionData, usageData] = await Promise.all([
                getPricingOffer(),
                getBillingSubscriptionStatus(),
                getBillingUsageSnapshot(),
            ])
            if (cancelled) return
            setOffer(offerData)
            setSubscription(subscriptionData)
            setUsageSnapshot(usageData.authorized ? usageData.snapshot : null)

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
    const billingConfig = offer?.ok ? offer.billing.plans[selectedPlanTier] : null
    const usageRows = usageSnapshot ? [
        {
            label: "AI Generate",
            used: usageSnapshot.usage.generate,
            limit: usageSnapshot.limits.generate,
            percent: usageSnapshot.usageRatePct.generate,
        },
        {
            label: "Voice Transcribe",
            used: usageSnapshot.usage.transcribe,
            limit: usageSnapshot.limits.transcribe,
            percent: usageSnapshot.usageRatePct.transcribe,
        },
        {
            label: "Email Sends",
            used: usageSnapshot.usage.send_email,
            limit: usageSnapshot.limits.send_email,
            percent: usageSnapshot.usageRatePct.send_email,
        },
    ] : []
    const annualEnabled = Boolean(billingConfig?.annualEnabled)
    const annualDiscountPct = offer?.ok ? offer.billing.annualDiscountPct : 20
    const currentBillingInterval =
        subscription?.priceId && offer?.ok
            ? (Object.values(offer.billing.plans).some((plan) => plan.annualPriceId === subscription.priceId) ? "annual" : "monthly")
            : null

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
                    billingInterval,
                },
            })

            const checkout = await createBillingCheckoutSession({
                planTier: selectedPlanTier,
                ...(billingInterval === "annual" && billingConfig?.annualPriceId
                    ? { priceId: billingConfig.annualPriceId }
                    : {}),
            })
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
        <div className="app-shell space-y-4 px-4 pb-32 pt-6">
            <div className="ambient-orb left-[-80px] top-8 h-40 w-40 bg-sky-500/20" />
            <div className="ambient-orb right-[-40px] top-24 h-36 w-36 bg-amber-500/[0.15]" />

            <Card className="premium-panel mesh-border mx-auto w-full max-w-sm overflow-hidden border-primary/20">
                <CardHeader className="pb-3">
                    <div className="section-eyebrow w-fit">
                        <Sparkles className="h-4 w-4" />
                        Pricing for trade owner-operators
                    </div>
                    <CardTitle className="text-[1.85rem] font-semibold leading-[1.05] tracking-[-0.04em] text-white">
                        Pick the quoting pace your crew can actually keep up with
                    </CardTitle>
                    <p className="text-sm leading-6 text-slate-300">
                        SnapQuote is for multilingual field capture, cleaner English estimates, and faster follow-through from the truck.
                    </p>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading && (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Checking live pricing and billing status...
                        </div>
                    )}

                    <div className="rounded-[24px] border border-sky-300/10 bg-gradient-to-r from-sky-500/[0.12] via-cyan-400/10 to-amber-400/10 p-4 text-sm leading-6 text-slate-300">
                        Pay for turning Spanish or Korean field talk into clean English quotes, not for bloated office software you barely open.
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        {PLAN_OPTIONS.map((plan) => (
                            <button
                                key={plan.tier}
                                type="button"
                                onClick={() => setSelectedPlanTier(plan.tier)}
                                disabled={checkoutLoading || portalLoading}
                                className={`premium-card premium-card-hover w-full p-4 text-left ${selectedPlanTier === plan.tier
                                    ? "border-sky-300/30 bg-sky-400/10 shadow-[0_20px_60px_-36px_rgba(56,189,248,0.8)]"
                                    : "border-white/10 bg-white/[0.045]"
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-base font-semibold text-white">{plan.label}</p>
                                        <p className="mt-1 text-sm text-slate-300">{plan.priceLabel}</p>
                                    </div>
                                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${selectedPlanTier === plan.tier
                                        ? "bg-sky-300/15 text-sky-100"
                                        : "bg-white/[0.08] text-slate-300"
                                        }`}>
                                        {plan.tier}
                                    </span>
                                </div>
                                <p className="mt-3 text-xs leading-5 text-slate-400">{plan.bestFor}</p>
                            </button>
                        ))}
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-white">Billing cadence</p>
                                <p className="text-xs text-muted-foreground">
                                    Use annual billing when the plan is configured to reduce churn and push self-serve upgrades through Stripe Checkout.
                                </p>
                            </div>
                            {annualEnabled ? (
                                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
                                    Save up to {annualDiscountPct}%
                                </span>
                            ) : null}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                type="button"
                                variant={billingInterval === "monthly" ? "default" : "outline"}
                                onClick={() => setBillingInterval("monthly")}
                                disabled={checkoutLoading || portalLoading}
                                className="w-full rounded-2xl"
                            >
                                Monthly
                            </Button>
                            <Button
                                type="button"
                                variant={billingInterval === "annual" ? "default" : "outline"}
                                onClick={() => setBillingInterval("annual")}
                                disabled={checkoutLoading || portalLoading || !annualEnabled}
                                className="w-full rounded-2xl"
                            >
                                Annual
                            </Button>
                        </div>

                        <p className="text-xs text-muted-foreground">
                            {billingInterval === "annual"
                                ? annualEnabled
                                    ? "Stripe Checkout will use the annual billing price for this plan."
                                    : "Annual billing is not configured for this plan yet."
                                : "Stripe Checkout will use the monthly billing price for this plan."}
                        </p>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-slate-950/[0.45] p-4 space-y-2">
                        <p className="text-sm text-muted-foreground">Selected plan</p>
                        <p className="text-3xl font-semibold tracking-[-0.04em] text-white">
                            {selectedPlan.priceLabel}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Tier: <span className="font-medium uppercase">{selectedPlan.tier}</span>
                        </p>
                        <p className="text-sm leading-6 text-slate-200">
                            {selectedPlan.bestFor}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Best chosen by quote volume and language friction, not by seat count.
                        </p>
                        {variant?.name && (
                            <p className="text-xs text-muted-foreground">
                                Variant: <span className="font-mono">{variant.name}</span>
                            </p>
                        )}
                        {subscription && (
                            <div className="space-y-1 text-xs text-muted-foreground">
                                <p>
                                    Current plan:{" "}
                                    <span className="font-medium uppercase">{subscription.planTier}</span>
                                    {subscription.status ? ` (${subscription.status})` : ""}
                                    {currentBillingInterval ? ` · ${currentBillingInterval}` : ""}
                                </p>
                                {subscription.currentPeriodEnd && (
                                    <p>
                                        Renews or ends on: <span className="font-medium">{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</span>
                                    </p>
                                )}
                                {subscription.cancelAtPeriodEnd && (
                                    <p className="text-amber-300">
                                        Cancel at period end is enabled. Use the billing portal to resume or change plans.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {usageSnapshot && (
                        <div className="rounded-[24px] border border-white/10 bg-white/[0.045] p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium">Live monthly usage</p>
                                    <p className="text-xs text-muted-foreground">
                                        Measured from {usageSnapshot.periodStart} UTC month start.
                                    </p>
                                </div>
                                <span className="text-xs font-medium uppercase text-muted-foreground">
                                    {usageSnapshot.planTier}
                                </span>
                            </div>

                            <div className="space-y-2">
                                {usageRows.map((row) => {
                                    const width = Math.min(100, Math.max(0, row.percent))
                                    const color = row.percent >= 100
                                        ? "bg-red-500"
                                        : row.percent >= 80
                                            ? "bg-amber-500"
                                            : "bg-emerald-500"

                                    return (
                                        <div key={row.label} className="space-y-1">
                                            <div className="flex items-center justify-between text-xs">
                                                <span>{row.label}</span>
                                                <span>{row.used}/{row.limit}</span>
                                            </div>
                                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                                                <div className={`h-full transition-all ${color}`} style={{ width: `${width}%` }} />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {usageSnapshot.planTier === "free" && (
                                <p className="text-xs text-muted-foreground">
                                    You have {usageSnapshot.remaining.generate} free quote drafts left this month out of {FREE_PLAN_MARKETING_QUOTE_LIMIT}. Live usage here makes the upgrade point explicit before you hit the cap.
                                </p>
                            )}
                        </div>
                    )}

                    <div className="rounded-[24px] border border-white/10 bg-white/[0.045] p-4 text-sm">
                        <p className="mb-2 font-medium text-white">What you get</p>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            {selectedPlan.includes.map((include) => (
                                <li key={include}>{include}</li>
                            ))}
                        </ul>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-white/[0.045] p-4 space-y-3 text-sm">
                        <p className="font-medium text-white">PDF Branding by Plan</p>
                        <div className="space-y-2 text-muted-foreground">
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                                <p className="font-medium text-white">Free</p>
                                <p className="text-xs leading-5">Standard SnapQuote PDF layout and email watermarking.</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                                <p className="font-medium text-white">Starter</p>
                                <p className="text-xs leading-5">Unlock logo branding on the PDF header so estimates look like your business, not a generic tool.</p>
                            </div>
                            <div className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-3">
                                <p className="font-medium text-white">Pro and Team</p>
                                <p className="text-xs leading-5">Upload a full-page branded estimate background for premium customer-facing PDFs.</p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4 text-xs leading-5 text-muted-foreground">
                        Best fit: repair calls, installs, replacements, change orders, and small projects where the job is explained one way on site and sent another way to the customer.
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4 text-xs leading-5 text-muted-foreground">
                        SnapQuote is not trying to replace dispatch, CRM, or accounting. It is for owner-operators and small crews who need a faster multilingual field-to-English quote workflow.
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        <Button
                            onClick={handleUpgradeClick}
                            disabled={loading || checkoutLoading || isSubscribed || (billingInterval === "annual" && !annualEnabled)}
                            className="h-12 w-full justify-between rounded-[22px] border border-sky-300/20 bg-gradient-to-r from-sky-500 via-cyan-400 to-amber-400 font-semibold text-slate-950 shadow-[0_18px_50px_-18px_rgba(56,189,248,0.75)]"
                        >
                            {loading
                                ? "Loading live pricing..."
                                : checkoutLoading
                                ? "Opening checkout..."
                                : isSubscribed
                                    ? "Subscription already active"
                                    : !isAuthed ? "Log in to Subscribe" : `Upgrade to ${selectedPlan.label} ${billingInterval === "annual" ? "Annually" : "Monthly"}`}
                            {!loading && !isSubscribed && <ArrowRight className="h-4 w-4" />}
                        </Button>
                        <Button
                            asChild
                            variant="outline"
                            className="h-12 w-full rounded-[22px] border-white/[0.15] bg-white/5 text-white hover:bg-white/10"
                        >
                            <Link href="/new-estimate">
                                Try {FREE_PLAN_MARKETING_QUOTE_LIMIT} free English quote drafts first
                            </Link>
                        </Button>
                        {isAuthed && (
                            <Button
                                variant="outline"
                                onClick={handleManageBillingClick}
                                disabled={loading || portalLoading || !subscription?.customerId}
                                className="h-12 w-full rounded-[22px] border-white/[0.15] bg-white/5 text-white hover:bg-white/10"
                            >
                                {portalLoading ? "Opening portal..." : "Manage billing in Stripe"}
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

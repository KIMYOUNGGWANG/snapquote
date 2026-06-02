"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Loader2, Sparkles, ArrowRight, CheckCircle2, CreditCard, Gauge, ShieldCheck } from "lucide-react"
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
import { MARKETING_PLAN_OPTIONS, getMarketingPlan } from "@/lib/marketing-plans"
import { toast } from "@/components/toast"
import { supabase } from "@/lib/supabase"
import { FREE_PLAN_MARKETING_QUOTE_LIMIT } from "@/lib/free-tier"
import { cn } from "@/lib/utils"

type BillingInterval = "monthly" | "annual"
type PricingSource = "generate_quota" | "transcribe_quota" | "send_email_quota" | "sms_credits" | "quickbooks_sync"

const pricingBoxClass = "rounded-lg border border-white/10 bg-slate-950/55 p-4"
const pricingBoxSoftClass = "rounded-lg border border-white/10 bg-slate-900/55 p-4"
const pricingOutlineButtonClass = "border-white/10 bg-slate-950/60 text-slate-200 hover:bg-slate-900 hover:text-white"
const PRICING_SOURCE_CONTEXT: Record<PricingSource, {
    eyebrow: string
    title: string
    description: string
    recommendedPlanTier: BillingPaidPlanTier
    details: string[]
}> = {
    generate_quota: {
        eyebrow: "Quote generation limit",
        title: "Your field capture is saved.",
        description: "Upgrade to keep generating customer-ready estimates this month without rebuilding the job notes.",
        recommendedPlanTier: "starter",
        details: [
            "Starter unlocks 80 field estimates per month.",
            "Pro gives more room for heavier service-call weeks.",
        ],
    },
    transcribe_quota: {
        eyebrow: "Voice capture limit",
        title: "Keep turning recordings into quote-ready scope.",
        description: "Upgrade to keep processing jobsite voice notes when the crew is still moving between calls.",
        recommendedPlanTier: "starter",
        details: [
            "Starter includes 60 transcription minutes for multilingual on-site notes.",
            "Pro raises that to 180 minutes for busier service-call volume.",
        ],
    },
    send_email_quota: {
        eyebrow: "Email delivery quota",
        title: "Keep sending PDFs from the jobsite.",
        description: "Your estimate is still intact. Pick the email volume that matches how many customer-ready quotes you send.",
        recommendedPlanTier: "starter",
        details: [
            "Starter includes 60 sent estimate emails per month.",
            "Pro raises that to 200 when follow-ups get busy.",
        ],
    },
    sms_credits: {
        eyebrow: "SMS credits",
        title: "Add sending room for text follow-ups.",
        description: "SMS credits are tracked separately from quote generation. Choose a paid workflow when texts are part of closing the job.",
        recommendedPlanTier: "pro",
        details: [
            "Pro is preselected for contractors using SMS follow-ups regularly.",
            "Team keeps higher-volume delivery workflows in one shared account.",
        ],
    },
    quickbooks_sync: {
        eyebrow: "QuickBooks sync",
        title: "Push won estimates into accounting.",
        description: "Direct QuickBooks invoice sync is available on Pro and Team. CSV export stays available while you choose a plan.",
        recommendedPlanTier: "pro",
        details: [
            "Pro unlocks direct QuickBooks invoice sync from History.",
            "Team adds shared quoting when multiple techs need the same workflow.",
        ],
    },
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message
    return fallback
}

function getPricingSource(value: string | null): PricingSource | null {
    if (value === "generate_quota") return value
    if (value === "transcribe_quota") return value
    if (value === "send_email_quota") return value
    if (value === "sms_credits") return value
    if (value === "quickbooks_sync") return value
    return null
}

function getPricingPath(planTier: BillingPaidPlanTier, source: PricingSource | null, checkout?: "success" | "cancel") {
    const params = new URLSearchParams({ plan: planTier })
    if (source) params.set("source", source)
    if (checkout) params.set("checkout", checkout)
    return `/pricing?${params.toString()}`
}

function PricingPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const pricingSource = getPricingSource(searchParams.get("source"))
    const sourceContext = pricingSource ? PRICING_SOURCE_CONTEXT[pricingSource] : null
    const pricingSourceKey = pricingSource || "direct"
    const sourceTitle = sourceContext?.title || null
    const initialPlanTier = getMarketingPlan(searchParams.get("plan") || sourceContext?.recommendedPlanTier).tier as BillingPaidPlanTier
    const [loading, setLoading] = useState(true)
    const [offer, setOffer] = useState<PricingOfferResponse | null>(null)
    const [subscription, setSubscription] = useState<BillingSubscriptionStatusResponse | null>(null)
    const [usageSnapshot, setUsageSnapshot] = useState<BillingUsageSnapshot | null>(null)
    const [checkoutLoading, setCheckoutLoading] = useState(false)
    const [portalLoading, setPortalLoading] = useState(false)
    const [portalIssue, setPortalIssue] = useState<string | null>(null)
    const [selectedPlanTier, setSelectedPlanTier] = useState<BillingPaidPlanTier>(initialPlanTier)
    const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly")
    const [isAuthed, setIsAuthed] = useState(false)

    useEffect(() => {
        setSelectedPlanTier(initialPlanTier)
    }, [initialPlanTier])

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
            toast("Subscription checkout completed. Billing status will refresh shortly.", "success")
            return
        }
        if (checkoutState === "cancel") {
            toast("Subscription checkout was canceled.", "info")
        }
    }, [])

    useEffect(() => {
        const today = new Date().toISOString().slice(0, 10)
        const key = `snapquote_pricing_viewed:${today}:${pricingSourceKey}`
        if (sessionStorage.getItem(key)) return
        sessionStorage.setItem(key, "1")

        void trackPricingEvent({
            event: "pricing_viewed",
            metadata: {
                path: "/pricing",
                source: pricingSourceKey,
                selectedPlanTier: initialPlanTier,
                sourceTitle,
            },
        })
    }, [initialPlanTier, pricingSourceKey, sourceTitle])

    const variant = offer?.ok && offer.variant ? offer.variant : null
    const selectedPlan = getMarketingPlan(selectedPlanTier)
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
    const upgradeCtaLabel = loading
        ? "Loading live pricing..."
        : checkoutLoading
            ? "Opening checkout..."
            : isSubscribed
                ? "Subscription already active"
                : !isAuthed ? "Log in to Subscribe" : `Upgrade to ${selectedPlan.label} ${billingInterval === "annual" ? "Annually" : "Monthly"}`
    const upgradeDisabled = loading || checkoutLoading || isSubscribed || (billingInterval === "annual" && !annualEnabled)

    const handleUpgradeClick = async () => {
        if (!isAuthed) {
            toast("Please log in to start your subscription.", "info")
            const params = new URLSearchParams({ next: getPricingPath(selectedPlanTier, pricingSource) })
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
                    source: pricingSourceKey,
                },
            })

            const checkout = await createBillingCheckoutSession({
                planTier: selectedPlanTier,
                successPath: getPricingPath(selectedPlanTier, pricingSource, "success"),
                cancelPath: getPricingPath(selectedPlanTier, pricingSource, "cancel"),
                ...(billingInterval === "annual" && billingConfig?.annualPriceId
                    ? { priceId: billingConfig.annualPriceId }
                    : {}),
            })
            window.location.href = checkout.url
        } catch (error: unknown) {
            toast(getErrorMessage(error, "Failed to start checkout."), "error")
        } finally {
            setCheckoutLoading(false)
        }
    }

    const handlePlanSelect = (tier: BillingPaidPlanTier) => {
        setSelectedPlanTier(tier)
        const params = new URLSearchParams(searchParams.toString())
        params.set("plan", tier)
        router.replace(`/pricing?${params.toString()}`, { scroll: false })
    }

    const handleRefreshBillingStatus = async () => {
        setLoading(true)
        try {
            const [subscriptionData, usageData] = await Promise.all([
                getBillingSubscriptionStatus(),
                getBillingUsageSnapshot(),
            ])
            setSubscription(subscriptionData)
            setUsageSnapshot(usageData.authorized ? usageData.snapshot : null)

            const { data: authData } = await supabase.auth.getSession()
            setIsAuthed(Boolean(authData.session?.user))
            setPortalIssue(null)
            toast("Billing status refreshed.", "success")
        } catch (error: unknown) {
            toast(getErrorMessage(error, "Failed to refresh billing status."), "error")
        } finally {
            setLoading(false)
        }
    }

    const handleManageBillingClick = async () => {
        setPortalLoading(true)
        setPortalIssue(null)
        try {
            const portal = await createBillingPortalSession()
            window.location.href = portal.url
        } catch (error: unknown) {
            const message = getErrorMessage(error, "Failed to open billing portal.")
            setPortalIssue(message)
            toast(message, "error")
        } finally {
            setPortalLoading(false)
        }
    }

    return (
        <div className="field-app min-h-screen px-4 pb-16 pt-6 text-white">
            <div className="mx-auto max-w-5xl space-y-5">
                <section className="field-panel p-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="max-w-2xl space-y-3">
                            <div className="flex items-center gap-2 text-sm font-semibold text-blue-200">
                                <Sparkles className="h-4 w-4" />
                                SnapQuote
                            </div>
                            <div className="space-y-2">
                                <h1 className="text-3xl font-semibold leading-tight">SnapQuote Pricing</h1>
                                <p className="text-sm leading-6 text-slate-300">
                                    Choose the quote volume, multilingual capture, and PDF branding level that matches how your crew actually works from the field.
                                </p>
                            </div>
                        </div>

                        <div className="grid w-full grid-cols-3 gap-2 lg:max-w-md">
                            <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3 sm:p-4">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Free</p>
                                <p className="mt-2 text-xl font-semibold sm:text-2xl">{FREE_PLAN_MARKETING_QUOTE_LIMIT}</p>
                                <p className="mt-1 text-[11px] leading-4 text-slate-400">drafts</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3 sm:p-4">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Selected</p>
                                <p className="mt-2 text-xl font-semibold sm:text-2xl">{selectedPlan.label}</p>
                                <p className="mt-1 text-[11px] leading-4 text-slate-400">{billingInterval}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3 sm:p-4">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</p>
                                <p className="mt-2 text-xl font-semibold sm:text-2xl">{isSubscribed ? "Active" : "Open"}</p>
                                <p className="mt-1 text-[11px] leading-4 text-slate-400">{subscription?.planTier || "free"} plan</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 rounded-lg border border-sky-400/20 bg-sky-500/10 p-3" data-testid="pricing-hero-cta">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.2em] text-sky-200/80">Selected plan</p>
                                <p className="mt-1 text-lg font-semibold text-white">
                                    {selectedPlan.label} · {selectedPlan.priceLabel}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-slate-300">{selectedPlan.bestFor}</p>
                            </div>
                            <div className="grid gap-2 sm:w-72 sm:grid-cols-2">
                                <Button
                                    onClick={handleUpgradeClick}
                                    disabled={upgradeDisabled}
                                    className="h-11 rounded-lg border border-sky-300/20 bg-blue-600 text-sm font-semibold text-white hover:bg-blue-500"
                                    data-testid="pricing-hero-upgrade"
                                >
                                    {upgradeCtaLabel}
                                </Button>
                                <Button
                                    asChild
                                    variant="outline"
                                    className={cn("h-11 rounded-lg text-sm", pricingOutlineButtonClass)}
                                >
                                    <Link href="/new-estimate" data-testid="pricing-hero-free-drafts">
                                        Try free drafts
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </div>

                    {sourceContext && (
                        <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/10 p-3" data-testid="pricing-source-context">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <p className="text-xs uppercase tracking-[0.2em] text-amber-200/80" data-testid="pricing-source-eyebrow">
                                        {sourceContext.eyebrow}
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-white" data-testid="pricing-source-title">
                                        {sourceContext.title}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-amber-50/80" data-testid="pricing-source-description">
                                        {sourceContext.description}
                                    </p>
                                </div>
                                <div className="shrink-0 rounded-lg border border-white/10 bg-slate-950/45 px-3 py-2 text-xs text-slate-300" data-testid="pricing-source-recommended-plan">
                                    Recommended: <span className="font-semibold text-white">{getMarketingPlan(sourceContext.recommendedPlanTier).label}</span>
                                </div>
                            </div>
                            <ul className="mt-3 grid gap-2 text-xs leading-5 text-amber-50/80 sm:grid-cols-2" data-testid="pricing-source-details">
                                {sourceContext.details.map((detail) => (
                                    <li key={detail} className="flex gap-2">
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                                        <span>{detail}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </section>

                <section className="space-y-4">
                    {loading && (
                        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/55 p-3 text-sm text-slate-400">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Checking live pricing and billing status...
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-2 md:gap-3" data-testid="pricing-plan-selector">
                        {MARKETING_PLAN_OPTIONS.map((plan) => (
                            <button
                                key={plan.tier}
                                type="button"
                                onClick={() => handlePlanSelect(plan.tier)}
                                disabled={checkoutLoading || portalLoading}
                                data-testid={`pricing-plan-${plan.tier}`}
                                className={cn(
                                    "field-card min-w-0 w-full p-3 text-left transition-colors hover:border-white/20 hover:bg-slate-900 md:p-4",
                                    selectedPlanTier === plan.tier && "border-sky-400/35 bg-sky-500/10 ring-1 ring-sky-400/25"
                                )}
                            >
                                <div className="flex min-w-0 items-start justify-between gap-2 md:gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-white md:text-base">{plan.label}</p>
                                        <p className="mt-1 truncate text-[11px] leading-4 text-slate-300 md:text-sm">{plan.priceLabel}</p>
                                    </div>
                                    <span className={cn(
                                        "hidden rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] md:inline-flex",
                                        selectedPlanTier === plan.tier
                                            ? "border-sky-400/30 bg-sky-500/10 text-sky-100"
                                            : "border-white/10 bg-slate-950/65 text-slate-300"
                                    )}>
                                        {plan.tier}
                                    </span>
                                </div>
                                <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-400 md:mt-3 md:text-xs md:leading-5">{plan.bestFor}</p>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
                    <div className="space-y-5">
                        <div className="field-card space-y-4 p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-400/25 bg-sky-500/10 text-sky-200">
                                    <CreditCard className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-white">Billing cadence</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-400">
                                        Monthly keeps cash flow flexible. Annual uses the configured Stripe annual price when available.
                                    </p>
                                </div>
                            </div>

                            {annualEnabled ? (
                                <span className="w-fit rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
                                    Save up to {annualDiscountPct}%
                                </span>
                            ) : null}

                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    type="button"
                                    variant={billingInterval === "monthly" ? "default" : "outline"}
                                    onClick={() => setBillingInterval("monthly")}
                                    disabled={checkoutLoading || portalLoading}
                                    className={cn("w-full rounded-lg", billingInterval !== "monthly" && pricingOutlineButtonClass)}
                                >
                                    Monthly
                                </Button>
                                <Button
                                    type="button"
                                    variant={billingInterval === "annual" ? "default" : "outline"}
                                    onClick={() => setBillingInterval("annual")}
                                    disabled={checkoutLoading || portalLoading || !annualEnabled}
                                    className={cn("w-full rounded-lg", billingInterval !== "annual" && pricingOutlineButtonClass)}
                                >
                                    Annual
                                </Button>
                            </div>

                            <p className="text-xs text-slate-400">
                                {billingInterval === "annual"
                                    ? annualEnabled
                                        ? "Stripe Checkout will use the annual billing price for this plan."
                                        : "Annual billing is not configured for this plan yet."
                                    : "Stripe Checkout will use the monthly billing price for this plan."}
                            </p>
                        </div>

                        <div className="field-card space-y-3 p-4 text-sm">
                            <p className="font-semibold text-white">What you get</p>
                            <ul className="space-y-2 text-slate-300">
                                {selectedPlan.includes.map((include) => (
                                    <li key={include} className="flex gap-2">
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                                        <span className="leading-5">{include}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="field-card space-y-3 p-4 text-sm">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-400/25 bg-emerald-500/10 text-emerald-200">
                                    <ShieldCheck className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="font-semibold text-white">PDF branding by plan</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-400">
                                        Customer-facing PDFs should look like the contractor&apos;s business as the plan grows.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2 text-slate-300">
                                <div className={pricingBoxClass}>
                                    <p className="font-medium text-white">Free</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-400">Standard SnapQuote PDF layout and email watermarking.</p>
                                </div>
                                <div className={pricingBoxClass}>
                                    <p className="font-medium text-white">Starter</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-400">Logo branding on the PDF header so estimates look like your business.</p>
                                </div>
                                <div className="rounded-lg border border-sky-400/25 bg-sky-500/10 p-4">
                                    <p className="font-medium text-white">Pro and Team</p>
                                    <p className="mt-1 text-xs leading-5 text-sky-100/80">Full-page branded estimate background for premium customer-facing PDFs.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-5">
                        <div className="field-panel space-y-4 p-5">
                            <div>
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Selected plan</p>
                                <p className="mt-2 text-3xl font-semibold leading-[1.25] text-white" data-testid="pricing-selected-price">
                                    {selectedPlan.priceLabel}
                                </p>
                                <p className="mt-1 text-xs text-slate-400">
                                    Tier <span className="font-medium uppercase text-slate-200">{selectedPlan.tier}</span>
                                </p>
                            </div>

                            <p className="text-sm leading-6 text-slate-300">{selectedPlan.bestFor}</p>
                            <p className="text-xs leading-5 text-slate-500">
                                Best chosen by quote volume and language friction, not by seat count.
                            </p>

                            {variant?.name && (
                                <p className="rounded-lg border border-white/10 bg-slate-950/55 px-3 py-2 text-xs text-slate-400">
                                    Variant <span className="font-mono text-slate-200">{variant.name}</span>
                                </p>
                            )}

                            {subscription && (
                                <div className={pricingBoxSoftClass}>
                                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current subscription</p>
                                    <p className="mt-2 text-sm text-slate-300">
                                        <span className="font-medium uppercase text-white">{subscription.planTier}</span>
                                        {subscription.status ? ` (${subscription.status})` : ""}
                                        {currentBillingInterval ? ` · ${currentBillingInterval}` : ""}
                                    </p>
                                    {subscription.currentPeriodEnd && (
                                        <p className="mt-1 text-xs text-slate-400">
                                            Renews or ends on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                                        </p>
                                    )}
                                    {subscription.cancelAtPeriodEnd && (
                                        <p className="mt-1 text-xs text-amber-300">
                                            Cancel at period end is enabled. Use the billing portal to resume or change plans.
                                        </p>
                                    )}
                                </div>
                            )}

                            {portalIssue ? (
                                <div
                                    role="alert"
                                    className="rounded-lg border border-amber-300/20 bg-amber-400/10 p-3"
                                    data-testid="pricing-billing-portal-issue"
                                >
                                    <p className="text-sm font-semibold text-amber-100">Billing portal could not open</p>
                                    <p className="mt-1 break-words text-xs leading-5 text-amber-100/75 [overflow-wrap:anywhere]">
                                        {portalIssue}
                                    </p>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="h-11 rounded-lg"
                                            onClick={handleManageBillingClick}
                                            disabled={portalLoading}
                                            data-testid="pricing-billing-portal-retry-action"
                                        >
                                            Retry portal
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className={cn("h-11 rounded-lg", pricingOutlineButtonClass)}
                                            onClick={handleRefreshBillingStatus}
                                            disabled={loading}
                                            data-testid="pricing-billing-status-refresh-action"
                                        >
                                            Refresh billing status
                                        </Button>
                                    </div>
                                </div>
                            ) : null}

                            <div className="grid grid-cols-1 gap-2">
                                <Button
                                    onClick={handleUpgradeClick}
                                    disabled={upgradeDisabled}
                                    className="h-12 w-full justify-between rounded-lg border border-sky-300/20 bg-blue-600 font-semibold text-white shadow-[0_18px_32px_-24px_rgba(37,99,235,0.9)] hover:bg-blue-500"
                                >
                                    {upgradeCtaLabel}
                                    {!loading && !isSubscribed && <ArrowRight className="h-4 w-4" />}
                                </Button>
                                <Button
                                    asChild
                                    variant="outline"
                                    className={cn("h-12 w-full rounded-lg", pricingOutlineButtonClass)}
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
                                        className={cn("h-12 w-full rounded-lg", pricingOutlineButtonClass)}
                                        data-testid="pricing-manage-billing-action"
                                    >
                                        {portalLoading ? "Opening portal..." : "Manage billing in Stripe"}
                                    </Button>
                                )}
                            </div>
                        </div>

                        {usageSnapshot && (
                            <div className="field-card space-y-3 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-950/55 text-slate-300">
                                            <Gauge className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold">Live monthly usage</p>
                                            <p className="mt-1 text-xs text-slate-400">
                                                Measured from {usageSnapshot.periodStart} UTC month start.
                                            </p>
                                        </div>
                                    </div>
                                    <span className="text-xs font-medium uppercase text-slate-500">
                                        {usageSnapshot.planTier}
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    {usageRows.map((row) => {
                                        const width = Math.min(100, Math.max(0, row.percent))
                                        const color = row.percent >= 100
                                            ? "bg-red-500"
                                            : row.percent >= 80
                                                ? "bg-amber-500"
                                                : "bg-emerald-500"

                                        return (
                                            <div key={row.label} className="space-y-1">
                                                <div className="flex items-center justify-between text-xs text-slate-300">
                                                    <span>{row.label}</span>
                                                    <span>{row.used}/{row.limit}</span>
                                                </div>
                                                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950">
                                                    <div className={`h-full transition-all ${color}`} style={{ width: `${width}%` }} />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {usageSnapshot.planTier === "free" && (
                                    <p className="text-xs leading-5 text-slate-400">
                                        You have {usageSnapshot.remaining.generate} free quote drafts left this month out of {FREE_PLAN_MARKETING_QUOTE_LIMIT}. Live usage makes the upgrade point explicit before you hit the cap.
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                            <div className={pricingBoxSoftClass}>
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Best fit</p>
                                <p className="mt-2 text-xs leading-5 text-slate-400">
                                    Repair calls, installs, replacements, change orders, and small projects where the job is explained one way on site and sent another way to the customer.
                                </p>
                            </div>
                            <div className={pricingBoxSoftClass}>
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Product boundary</p>
                                <p className="mt-2 text-xs leading-5 text-slate-400">
                                    SnapQuote is not trying to replace dispatch, CRM, or accounting. It is a faster multilingual field-to-English quote workflow.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    )
}

function PricingPageFallback() {
    return (
        <div className="field-app flex min-h-screen items-center justify-center text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin" />
        </div>
    )
}

export default function PricingPage() {
    return (
        <Suspense fallback={<PricingPageFallback />}>
            <PricingPageContent />
        </Suspense>
    )
}

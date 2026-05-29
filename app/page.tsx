"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  Keyboard,
  Mail,
  Mic,
  Send,
} from "lucide-react"
import dynamic from "next/dynamic"
import type { Session } from "@supabase/supabase-js"

const QuickQuoteModal = dynamic(() => import("@/components/quick-quote-modal").then(mod => mod.QuickQuoteModal), { ssr: false })
const SetupWizard = dynamic(() => import("@/components/setup-wizard").then(mod => mod.SetupWizard), { ssr: false })
import { getPriceList } from "@/lib/db"
import type { PriceListItem } from "@/types"
import { getEstimatesNeedingFollowUp, type FollowUpItem, generateFollowUpMessage } from "@/lib/follow-up-service"
import { toast } from "@/components/toast"
const RevenueChart = dynamic(() => import("@/components/revenue-chart").then(mod => mod.RevenueChart), { ssr: false })
const FunnelMetricsCard = dynamic(() => import("@/components/funnel-metrics-card").then(mod => mod.FunnelMetricsCard), { ssr: false })
import { trackReferralEvent } from "@/lib/referrals"
const UsagePlanCard = dynamic(() => import("@/components/usage-plan-card").then(mod => mod.UsagePlanCard), { ssr: false })
import { supabase } from "@/lib/supabase"
import { FREE_PLAN_MARKETING_QUOTE_LIMIT } from "@/lib/free-tier"
import { getDraftEstimates, type LocalEstimate } from "@/lib/estimates-storage"
import { getAllItemsFromEstimate, lineTotal } from "@/lib/estimates/math"
import { subscribeOfflineQueueChanged } from "@/lib/offline-events"

const REFERRAL_TOKEN_PATTERN = /^[a-z0-9]{8,32}$/
const CONNECT_PROMPT_KEY_PREFIX = "snapquote_connect_prompt_seen"

function formatHomeCurrency(amount: number): string {
  return `$${amount.toLocaleString(undefined, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}`
}

function getDraftDisplayName(estimate: LocalEstimate): string {
  return estimate.clientName || estimate.estimateNumber || "Untitled draft"
}

function getDraftValue(estimate: LocalEstimate): number {
  if (Number.isFinite(estimate.totalAmount) && estimate.totalAmount > 0) return estimate.totalAmount
  return getAllItemsFromEstimate(estimate).reduce((sum, item) => sum + lineTotal(item), 0)
}

function getDraftPriceTBDCount(estimate: LocalEstimate): number {
  return getAllItemsFromEstimate(estimate).filter((item) => item.unit_price === 0).length
}

function getDraftAgeLabel(estimate: LocalEstimate): string {
  const updatedAt = new Date(estimate.updatedAt || estimate.createdAt)
  if (Number.isNaN(updatedAt.getTime())) return "Saved locally"

  const minutes = Math.max(0, Math.round((Date.now() - updatedAt.getTime()) / 60000))
  if (minutes < 1) return "Now"
  if (minutes < 60) return `${minutes}m`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`

  const days = Math.round(hours / 24)
  return `${days}d`
}

function formatOpenDraftCount(count: number): string {
  return count === 1 ? "1 open" : `${count} open`
}

function formatPriceTodoCount(count: number): string {
  if (count === 0) return "Ready"
  return count === 1 ? "1 price" : `${count} prices`
}

export default function Home() {
  const router = useRouter()
  const [priceListItems, setPriceListItems] = useState<PriceListItem[]>([])
  const [selectedQuickItem, setSelectedQuickItem] = useState<PriceListItem | null>(null)
  const [showQuickQuote, setShowQuickQuote] = useState(false)
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([])
  const [showConnectPrompt, setShowConnectPrompt] = useState(false)
  const [showSetupWizard, setShowSetupWizard] = useState(false)
  const [authResolved, setAuthResolved] = useState(false)
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [localDrafts, setLocalDrafts] = useState<LocalEstimate[]>([])

  useEffect(() => {
    let active = true

    const loadLocalDrafts = async () => {
      try {
        const drafts = await getDraftEstimates()
        if (!active) return
        setLocalDrafts(drafts)
      } catch (error) {
        console.error("Failed to load home draft queue:", error)
        if (!active) return
        setLocalDrafts([])
      }
    }

    void loadLocalDrafts()
    const unsubscribe = subscribeOfflineQueueChanged(() => {
      void loadLocalDrafts()
    })
    window.addEventListener("focus", loadLocalDrafts)

    return () => {
      active = false
      unsubscribe()
      window.removeEventListener("focus", loadLocalDrafts)
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const referralToken = params.get("ref")?.trim().toLowerCase() || ""
    const sourceParam = params.get("src")?.trim().toLowerCase() || ""
    if (!REFERRAL_TOKEN_PATTERN.test(referralToken)) return

    const visitKey = `snapquote_ref_visit:${referralToken}`
    if (sessionStorage.getItem(visitKey)) return

    sessionStorage.setItem(visitKey, "1")
    localStorage.setItem("snapquote_ref_token", referralToken)
    void trackReferralEvent({
      token: referralToken,
      event: sourceParam ? "quote_share_click" : "landing_visit",
      source: sourceParam || "home_landing",
      metadata: { path: window.location.pathname, sourceParam },
    })
  }, [])

  useEffect(() => {
    let active = true

    const clearSignedInState = () => {
      setPriceListItems([])
      setFollowUps([])
      setShowConnectPrompt(false)
      setShowSetupWizard(false)
    }

    const loadSignedInDashboardData = async () => {
      try {
        const [items, nextFollowUps] = await Promise.all([
          getPriceList(),
          getEstimatesNeedingFollowUp(),
        ])

        if (!active) return

        const sorted = items.sort((a, b) => b.usageCount - a.usageCount)
        setPriceListItems(sorted.slice(0, 6))
        setFollowUps(nextFollowUps)
      } catch (error) {
        console.error("Failed to load signed-in home data:", error)
        if (!active) return
        setPriceListItems([])
        setFollowUps([])
      }
    }

    const checkConnectPrompt = async (session: Session | null) => {
      if (!active || !session?.user) {
        clearSignedInState()
        return
      }

      const userId = session.user.id
      const { data: profile } = await supabase
        .from("profiles")
        .select("business_name")
        .eq("id", userId)
        .single()

      if (!active) return

      if (!profile?.business_name) {
        setShowSetupWizard(true)
        setShowConnectPrompt(false)
        return
      }

      setShowSetupWizard(false)

      const promptKey = `${CONNECT_PROMPT_KEY_PREFIX}:${userId}`
      if (localStorage.getItem(promptKey) === "1") {
        setShowConnectPrompt(false)
        return
      }

      try {
        const response = await fetch("/api/stripe/connect/status", {
          method: "GET",
          cache: "no-store",
          headers: {
            authorization: `Bearer ${session.access_token}`,
          },
        })

        if (!active || !response.ok) return

        const data = await response.json()
        const ready = Boolean(data?.connected && data?.detailsSubmitted && data?.chargesEnabled)
        setShowConnectPrompt(!ready)
        localStorage.setItem(promptKey, "1")
      } catch (error) {
        console.error("Failed to load Stripe Connect prompt status:", error)
      }
    }

    const syncSession = async (session: Session | null) => {
      if (!active) return

      const hasUser = Boolean(session?.user)
      setIsSignedIn(hasUser)
      setAuthResolved(true)

      if (!hasUser) {
        clearSignedInState()
        return
      }

      await loadSignedInDashboardData()
      if (!active) return
      await checkConnectPrompt(session)
    }

    void supabase.auth.getSession().then(({ data }) => {
      void syncSession(data.session)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncSession(session)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const handleQuickQuote = (item: PriceListItem) => {
    setSelectedQuickItem(item)
    setShowQuickQuote(true)
  }

  const handleCopyFollowUp = (item: FollowUpItem) => {
    const text = generateFollowUpMessage(item.estimate.clientName, item.estimate.estimateNumber)
    navigator.clipboard.writeText(text)
    toast("Message copied.", "success")
  }

  const handleOpenEmailFollowUp: (item: FollowUpItem) => void = (item) => {
    const message = generateFollowUpMessage(item.estimate.clientName, item.estimate.estimateNumber)
    const subject = item.estimate.clientName
      ? `Follow Up for ${item.estimate.clientName}`
      : "Estimate Follow Up"
    const recipient = item.estimate.clientEmail ?? ""
    const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject).replace(/%20/g, "+")}&body=${encodeURIComponent(message)}`
    window.open(mailtoUrl, "_blank")
  }

  const heroTitle = isSignedIn
    ? "Ready for the next field quote?"
    : "Quote the job before you drive off."
  const heroSubtitle = isSignedIn
    ? "Capture the scope, clean the draft, and send a professional quote before the next service call starts."
    : "Start with voice, photos, or quick notes. SnapQuote keeps the quote moving while the job is still fresh."
  const draftQueueSummary = useMemo(() => {
    return localDrafts.reduce((summary, draft) => {
      const missingPriceCount = getDraftPriceTBDCount(draft)
      return {
        value: summary.value + getDraftValue(draft),
        needsPricing: summary.needsPricing + missingPriceCount,
        nextDraft: summary.nextDraft || (missingPriceCount > 0 ? draft : null),
      }
    }, { value: 0, needsPricing: 0, nextDraft: null as LocalEstimate | null })
  }, [localDrafts])
  const nextHomeDraft = draftQueueSummary.nextDraft || localDrafts[0] || null
  const hasHomeSidePanel = Boolean(nextHomeDraft || (!isSignedIn && !nextHomeDraft) || (isSignedIn && followUps.length > 0))

  return (
    <>
      <QuickQuoteModal
        open={showQuickQuote}
        onClose={() => setShowQuickQuote(false)}
        item={selectedQuickItem}
      />

      <div className="field-app flex min-h-screen flex-col space-y-4 px-4 pb-32 pt-4">
        {showSetupWizard && (
          <SetupWizard onComplete={() => setShowSetupWizard(false)} />
        )}

        {!showSetupWizard && (
          <>
            <header className="mx-auto flex w-full max-w-sm items-center justify-between gap-3 lg:max-w-4xl">
              <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg pr-2" aria-label="SnapQuote home">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white text-sm font-black text-slate-950">
                  SQ
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-semibold text-white">SnapQuote</span>
                  <span className="hidden truncate text-[11px] text-slate-400 min-[430px]:block">Field estimate console</span>
                </span>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2 py-1.5 text-[11px] font-semibold text-emerald-200 min-[430px]:px-2.5"
                  data-testid="home-offline-status"
                  title="Offline ready"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only min-[430px]:not-sr-only">Offline ready</span>
                </span>
                {authResolved && (
                  isSignedIn ? (
                    <Link href="/profile" className="inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-white" data-testid="home-auth-link">
                      Account
                    </Link>
                  ) : (
                    <Link href="/login?next=%2F" className="inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-white" data-testid="home-auth-link">
                      Sign in
                    </Link>
                  )
                )}
              </div>
            </header>

            {showConnectPrompt && (
              <div className="field-card mx-auto w-full max-w-sm space-y-3 border-blue-400/25 bg-blue-500/10 p-4 lg:max-w-4xl">
                  <p className="text-sm font-semibold text-blue-300">One-time setup: Connect Stripe</p>
                  <p className="text-xs leading-5 text-slate-400">
                    First login is complete. Connect your company Stripe account once to generate card payment links.
                  </p>
                  <div className="flex gap-2">
                    <Button className="flex-1 bg-blue-600 text-white hover:bg-blue-500" onClick={() => router.push("/profile")}>
                      Connect Now
                    </Button>
                    <Button
                      variant="outline"
                      className="border-white/10 bg-slate-950/70 text-white hover:bg-slate-900"
                      onClick={() => setShowConnectPrompt(false)}
                    >
                      Later
                    </Button>
                  </div>
              </div>
            )}

            <div
              className={`mx-auto grid w-full max-w-sm gap-4 lg:max-w-4xl ${
                hasHomeSidePanel
                  ? "lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-start"
                  : "lg:max-w-xl"
              }`}
              data-testid="home-workspace"
            >
            <section className="field-panel w-full p-3 sm:p-4" data-testid="home-command-center">
              <div className="space-y-3">
                <h1 className="text-balance text-[2rem] font-semibold leading-[1.32] text-white" data-testid="home-hero-title">
                  {heroTitle}
                </h1>
                <p className="max-w-[28rem] text-sm leading-6 text-slate-300">
                  {heroSubtitle}
                </p>
              </div>

              <div className="mt-5 grid gap-2">
                <Link
                  href="/new-estimate?capture=voice"
                  className="group flex min-h-[88px] items-center gap-3 rounded-lg border border-blue-300/35 bg-blue-600 px-3 py-3 text-left text-white shadow-[0_20px_36px_-24px_rgba(37,99,235,0.95)] transition-colors hover:bg-blue-500"
                  data-testid="home-try-free-cta"
                  aria-label="Start a quote with voice capture"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700">
                    <Mic className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold leading-5">Start voice quote</span>
                    <span className="mt-1 block text-xs leading-5 text-blue-50">
                      Talk through scope while you walk the site.
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </Link>

                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/new-estimate?capture=photos"
                    className="field-action min-h-[74px]"
                    data-testid="home-photo-cta"
                    aria-label="Start a quote with photo capture"
                  >
                    <Camera className="h-5 w-5" />
                    <span>Photo scope</span>
                  </Link>
                  <Link
                    href="/new-estimate?capture=type"
                    className="field-action min-h-[74px]"
                    data-testid="home-type-cta"
                    aria-label="Start a quote with typed notes"
                  >
                    <Keyboard className="h-5 w-5" />
                    <span>Type notes</span>
                  </Link>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-left" aria-label="Quote workflow status">
                <div className="field-mini min-h-[60px]">
                  <p className="text-[11px] font-semibold text-white">Capture</p>
                  <p className="mt-1 text-[10px] leading-4 text-slate-400">Notes, photos</p>
                </div>
                <div className="field-mini min-h-[60px]">
                  <p className="text-[11px] font-semibold text-white">Review</p>
                  <p className="mt-1 text-[10px] leading-4 text-slate-400">Prices, terms</p>
                </div>
                <div className="field-mini min-h-[60px]">
                  <p className="text-[11px] font-semibold text-white">Send</p>
                  <p className="mt-1 text-[10px] leading-4 text-slate-400">PDF, deposit</p>
                </div>
              </div>

              {!isSignedIn && !nextHomeDraft && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/70 p-3">
                  <div>
                    <p className="text-xs font-semibold text-white">
                      {FREE_PLAN_MARKETING_QUOTE_LIMIT} free field quotes/month
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-slate-400">
                      Try a local draft first. Sign in when you need sync, sending, and payments.
                    </p>
                  </div>
                  <Link
                    href="/landing"
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
                    data-testid="home-primary-marketing-cta"
                  >
                    Tour
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </section>

            {nextHomeDraft ? (
              <section
                className="field-card w-full border-amber-300/20 bg-amber-500/10 p-4"
                data-testid="home-draft-queue"
              >
                <div className="flex gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-amber-300/25 bg-amber-300/10 text-amber-100">
                    {draftQueueSummary.needsPricing > 0 ? (
                      <AlertCircle className="h-5 w-5" />
                    ) : (
                      <ClipboardList className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-amber-50">
                          {draftQueueSummary.needsPricing > 0 ? "Next quote to finish" : "Resume latest draft"}
                        </p>
                        <p className="mt-1 truncate text-sm font-semibold text-white" data-testid="home-draft-next-title">
                          {getDraftDisplayName(nextHomeDraft)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[10px] font-semibold text-amber-100">
                        {formatOpenDraftCount(localDrafts.length)}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-md border border-white/10 bg-slate-950/35 px-2 py-2">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-amber-100/60">Value</p>
                        <p className="mt-1 text-sm font-semibold text-white" data-testid="home-draft-value">
                          {formatHomeCurrency(draftQueueSummary.value)}
                        </p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-slate-950/35 px-2 py-2">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-amber-100/60">Needs</p>
                        <p className="mt-1 text-sm font-semibold text-white" data-testid="home-draft-needs-pricing">
                          {formatPriceTodoCount(draftQueueSummary.needsPricing)}
                        </p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-slate-950/35 px-2 py-2">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-amber-100/60">Fresh</p>
                        <p className="mt-1 truncate text-sm font-semibold text-white">
                          {getDraftAgeLabel(nextHomeDraft)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button asChild className="h-10 rounded-lg" data-testid="home-draft-edit-action">
                        <Link href={`/new-estimate?draftId=${encodeURIComponent(nextHomeDraft.id)}`}>
                          {draftQueueSummary.needsPricing > 0 ? "Finish pricing" : "Resume draft"}
                        </Link>
                      </Button>
                      <Button
                        asChild
                        variant="outline"
                        className="h-10 rounded-lg border-white/10 bg-slate-950/60 text-slate-100 hover:bg-slate-900 hover:text-white"
                        data-testid="home-draft-workbench-action"
                      >
                        <Link href="/drafts">
                          All drafts
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {!isSignedIn && !nextHomeDraft && (
              <section className="grid w-full gap-3" data-testid="home-signed-out-workflow">
                <div className="field-section-title">
                  <span>Draft queue</span>
                  <Link href="/pricing" className="inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium text-blue-300 hover:bg-blue-500/10 hover:text-blue-200" data-testid="home-pricing-link">
                    Plans
                  </Link>
                </div>
                <div className="field-row" data-testid="home-empty-drafts">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-slate-950">
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">No local drafts yet</p>
                    <p className="mt-1 line-clamp-1 text-xs leading-5 text-slate-400">
                      Start with voice, photos, or typed notes. Saved drafts will appear here.
                    </p>
                  </div>
                  <Link
                    href="/new-estimate?capture=type"
                    className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
                    data-testid="home-empty-drafts-action"
                    aria-label="Start first quote"
                  >
                    Start
                  </Link>
                </div>
              </section>
            )}

            {isSignedIn && followUps.length > 0 && (
              <div className="field-panel w-full border-amber-500/25 bg-amber-500/10">
                <div className="flex gap-4 p-4">
                  <div className="h-fit rounded-lg bg-amber-500/10 p-2">
                    <Clock className="h-5 w-5 text-amber-200" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <h2 className="text-sm font-semibold text-amber-200">Follow Up Needed</h2>
                      <span className="rounded-lg bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                        {followUps[0].daysSinceSent} days ago
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-400">
                      Estimate <b>#{followUps[0].estimate.estimateNumber}</b> for {followUps[0].estimate.clientName}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyFollowUp(followUps[0])}
                      className="w-full border-amber-400/20 bg-transparent text-xs text-amber-200 hover:bg-amber-500/10 hover:text-amber-100"
                    >
                      <Send className="mr-2 h-3 w-3" />
                      Copy Message
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenEmailFollowUp(followUps[0])}
                      className="w-full h-9 text-xs border-blue-500/20 text-blue-400 hover:bg-blue-500/10 bg-transparent"
                    >
                      <Mail className="w-3 h-3 mr-2" />
                      Open Email App
                    </Button>
                  </div>
                </div>
              </div>
            )}
            </div>

            {isSignedIn && (
              <div
                className="mx-auto grid w-full max-w-sm gap-4 lg:max-w-4xl lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-start"
                data-testid="home-signed-in-dashboard"
              >
                <section className="grid gap-4" data-testid="home-overview-section">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Overview</h2>
                  {priceListItems.length > 0 && (
                    <div className="space-y-3" data-testid="home-quick-items-section">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Quick Items</h3>
                        <Link href="/profile" className="text-xs text-blue-400 hover:text-blue-300">Edit</Link>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {priceListItems.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => handleQuickQuote(item)}
                            className="field-card p-3 text-left transition-colors hover:border-blue-400/30 group"
                          >
                            <p className="text-sm font-medium text-gray-200 truncate group-hover:text-white">{item.name}</p>
                            <p className="text-lg font-bold text-blue-400 mt-1">${item.price}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <RevenueChart />
                </section>

                <section className="grid gap-4" data-testid="home-health-section">
                  <FunnelMetricsCard />
                  <UsagePlanCard />
                </section>
              </div>
            )}

          </>
        )}
      </div>
    </>
  )
}

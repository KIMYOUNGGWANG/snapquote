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
  Eye,
  Keyboard,
  Link2,
  Mail,
  MessageSquare,
  Mic,
  Send,
  Sparkles,
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
import { getEstimates, updateEstimate, type LocalEstimate } from "@/lib/estimates-storage"
import { hasScopeAssumptionsConfirmed, isCaptureOnlyDraft, isDraftEstimate, needsScopeAssumptionsReview } from "@/lib/estimates/draft-state"
import { getAllItemsFromEstimate, lineTotal } from "@/lib/estimates/math"
import { subscribeOfflineQueueChanged } from "@/lib/offline-events"
import {
  customerPortalEstimateUpdatesChanged,
  fetchCustomerPortalLinkForEstimate,
  getCustomerPortalEstimateUpdates,
} from "@/lib/customer-portal-client"
import { isOpenCustomerChangeRequest, isSupersededCustomerChangeRequest } from "@/lib/customer-revisions"
import { isEstimatePaidLike } from "@/lib/estimate-payment-state"

const REFERRAL_TOKEN_PATTERN = /^[a-z0-9]{8,32}$/
const CONNECT_PROMPT_KEY_PREFIX = "snapquote_connect_prompt_seen"

type HomeQuickQuoteBusinessProfile = {
  business_name?: string | null
  phone?: string | null
  tax_rate?: number | null
}

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

function formatCaptureDraftCount(count: number): string {
  return count === 1 ? "1 needs AI draft" : `${count} need AI drafts`
}

type HomeCustomerActionKind = "revise" | "review_scope" | "collect"

interface HomeCustomerAction {
  estimate: LocalEstimate
  kind: HomeCustomerActionKind
  title: string
  description: string
  badge: string
}

interface HomeFollowUpPortalState {
  label: string
  helper: string
  badge: string
  icon: "eye" | "link" | "clock"
  className: string
  iconClassName: string
}

function formatCustomerActionDate(value?: string): string {
  if (!value) return ""

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function getHomeCustomerAction(estimates: LocalEstimate[]): HomeCustomerAction | null {
  const sentEstimates = estimates.filter((estimate) => estimate.status === "sent" && !isEstimatePaidLike(estimate))
  const actionableSentEstimates = sentEstimates.filter((estimate) => !isSupersededCustomerChangeRequest(estimate))
  const changeRequest = actionableSentEstimates.find((estimate) => isOpenCustomerChangeRequest(estimate))

  if (changeRequest) {
    const dateLabel = formatCustomerActionDate(changeRequest.customerChangeRequestedAt)
    const customerName = getDraftDisplayName(changeRequest)
    const requestNote = changeRequest.customerPortalNote?.trim()

    return {
      estimate: changeRequest,
      kind: "revise",
      title: "Customer requested changes",
      description: requestNote
        ? `${customerName} asked for: ${requestNote}`
        : `${customerName} asked for changes. Start the revision while the job details are fresh.`,
      badge: dateLabel ? `Requested ${dateLabel}` : "Changes requested",
    }
  }

  const scopeReviewEstimate = actionableSentEstimates.find((estimate) => needsScopeAssumptionsReview(estimate))
  if (scopeReviewEstimate) {
    const customerName = getDraftDisplayName(scopeReviewEstimate)

    return {
      estimate: scopeReviewEstimate,
      kind: "review_scope",
      title: "Review scope before delivery",
      description: `${customerName} has field notes that need confirmation before customer follow-up, payment collection, or re-sharing.`,
      badge: "Scope review needed",
    }
  }

  const approvedQuote = actionableSentEstimates.find((estimate) => estimate.customerPortalStatus === "approved")
  if (!approvedQuote) return null

  const dateLabel = formatCustomerActionDate(approvedQuote.customerApprovedAt)
  const customerName = getDraftDisplayName(approvedQuote)

  return {
    estimate: approvedQuote,
    kind: "collect",
    title: "Quote approved",
    description: `${customerName} approved ${formatHomeCurrency(approvedQuote.totalAmount)}. Collect payment or mark the quote paid from history.`,
    badge: dateLabel ? `Approved ${dateLabel}` : "Approved",
  }
}

function getCustomerActionPanelClass(action: HomeCustomerAction): string {
  const tone = action.kind === "collect"
    ? "border-emerald-300/25 bg-emerald-500/10"
    : "border-amber-300/25 bg-amber-500/10"

  return `field-card w-full ${tone} p-4`
}

function getHomeFollowUpPortalState(estimate: LocalEstimate): HomeFollowUpPortalState {
  if (estimate.customerPortalStatus === "viewed") {
    const dateLabel = formatCustomerActionDate(estimate.customerViewedAt)
    return {
      label: "Quote viewed",
      helper: dateLabel
        ? `Customer opened the approval link ${dateLabel}. Follow up while the quote is fresh.`
        : "Customer opened the approval link. Follow up while the quote is fresh.",
      badge: "Warm lead",
      icon: "eye",
      className: "border-sky-300/25 bg-sky-500/10 text-sky-100",
      iconClassName: "border-sky-300/25 bg-sky-300/10 text-sky-100",
    }
  }

  if (estimate.customerPortalStatus === "shared" || estimate.customerPortalUrl) {
    return {
      label: "Link shared",
      helper: "Approval link is ready, but the customer has not opened it yet.",
      badge: "Waiting",
      icon: "link",
      className: "border-blue-300/20 bg-blue-500/10 text-blue-100",
      iconClassName: "border-blue-300/25 bg-blue-300/10 text-blue-100",
    }
  }

  return {
    label: "Follow-up due",
    helper: "No approval link is attached yet. Open History to send one with the reminder.",
    badge: "No link",
    icon: "clock",
    className: "border-amber-300/25 bg-amber-500/10 text-amber-100",
    iconClassName: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  }
}

function HomeFollowUpStatusIcon({ state }: { state: HomeFollowUpPortalState }) {
  if (state.icon === "eye") return <Eye className="h-4 w-4" aria-hidden="true" />
  if (state.icon === "link") return <Link2 className="h-4 w-4" aria-hidden="true" />

  return <Clock className="h-4 w-4" aria-hidden="true" />
}

type HistoryFocusAction = "follow-up" | "sms"

function getHistoryFocusHref(estimate: LocalEstimate, action?: HistoryFocusAction): string {
  const params = new URLSearchParams({ tab: isEstimatePaidLike(estimate) ? "paid" : "sent", estimateId: estimate.id })
  if (action) params.set("action", action)
  return `/history?${params.toString()}`
}

async function syncHomeCustomerPortalStatuses(estimates: LocalEstimate[]): Promise<LocalEstimate[]> {
  const portalEstimates = estimates.filter((estimate) => (
    estimate.status === "sent" && !isEstimatePaidLike(estimate) && Boolean(estimate.customerPortalUrl)
  ))
  if (portalEstimates.length === 0) return estimates

  let updatedCount = 0

  for (const estimate of portalEstimates) {
    let result: Awaited<ReturnType<typeof fetchCustomerPortalLinkForEstimate>>
    try {
      result = await fetchCustomerPortalLinkForEstimate(estimate.id)
    } catch (error) {
      console.debug("Home customer portal status sync skipped:", error)
      continue
    }

    if (!result) continue

    const updates = getCustomerPortalEstimateUpdates(result)
    if (!customerPortalEstimateUpdatesChanged(estimate, updates)) continue

    await updateEstimate(estimate.id, updates)
    updatedCount += 1
  }

  return updatedCount > 0 ? getEstimates() : estimates
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
  const [localEstimates, setLocalEstimates] = useState<LocalEstimate[]>([])
  const [quickQuoteBusinessProfile, setQuickQuoteBusinessProfile] = useState<HomeQuickQuoteBusinessProfile | null>(null)

  useEffect(() => {
    let active = true

    const loadLocalEstimates = async () => {
      try {
        const estimates = await getEstimates()
        let nextEstimates = estimates
        if (isSignedIn) {
          try {
            nextEstimates = await syncHomeCustomerPortalStatuses(estimates)
          } catch (syncError) {
            console.debug("Home customer quote portal sync skipped:", syncError)
          }
        }

        if (!active) return
        setLocalEstimates(nextEstimates)
      } catch (error) {
        console.error("Failed to load home quote queue:", error)
        if (!active) return
        setLocalEstimates([])
      }
    }

    void loadLocalEstimates()
    const unsubscribe = subscribeOfflineQueueChanged(() => {
      void loadLocalEstimates()
    })
    window.addEventListener("focus", loadLocalEstimates)

    return () => {
      active = false
      unsubscribe()
      window.removeEventListener("focus", loadLocalEstimates)
    }
  }, [isSignedIn])

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
      setQuickQuoteBusinessProfile(null)
      setShowConnectPrompt(false)
      setShowSetupWizard(false)
    }

    const loadSignedInDashboardData = async () => {
      try {
        const [items] = await Promise.all([
          getPriceList(),
          getEstimates()
            .then((estimates) => syncHomeCustomerPortalStatuses(estimates))
            .catch((error) => {
              console.debug("Signed-in home customer quote portal sync skipped:", error)
              return [] as LocalEstimate[]
            }),
        ])
        const nextFollowUps = await getEstimatesNeedingFollowUp()

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
        .select("business_name, phone, tax_rate")
        .eq("id", userId)
        .single()

      if (!active) return

      setQuickQuoteBusinessProfile({
        business_name: typeof profile?.business_name === "string" ? profile.business_name : "",
        phone: typeof profile?.phone === "string" ? profile.phone : "",
        tax_rate: typeof profile?.tax_rate === "number" ? profile.tax_rate : null,
      })

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
    const text = generateFollowUpMessage(
      item.estimate.clientName,
      item.estimate.estimateNumber,
      item.estimate.customerPortalUrl,
      item.estimate.customerPortalStatus,
    )
    navigator.clipboard.writeText(text)
    toast("Message copied.", "success")
  }

  const handleStartCustomerRevision = (estimate: LocalEstimate) => {
    const changeRequestedAt = formatCustomerActionDate(estimate.customerChangeRequestedAt)
    const customerRequestNote = estimate.customerPortalNote?.trim()
    const revisionNote = customerRequestNote
      ? `Customer requested changes${changeRequestedAt ? ` on ${changeRequestedAt}` : ""}: ${customerRequestNote}`
      : `Customer requested changes${changeRequestedAt ? ` on ${changeRequestedAt}` : ""}.`
    const clientNotes = [estimate.clientNotes, revisionNote]
      .filter((value) => typeof value === "string" && value.trim())
      .join("\n\n")

    localStorage.setItem("duplicate_estimate", JSON.stringify({
      items: estimate.items,
      sections: estimate.sections,
      summary_note: estimate.summary_note,
      payment_terms: estimate.payment_terms,
      closing_note: estimate.closing_note,
      clientName: estimate.clientName,
      clientAddress: estimate.clientAddress,
      clientEmail: estimate.clientEmail,
      clientPhone: estimate.clientPhone,
      clientNotes,
      taxRate: estimate.taxRate,
      revisionContext: {
        originalEstimateId: estimate.id,
        originalEstimateNumber: estimate.estimateNumber,
        requestedAt: estimate.customerChangeRequestedAt,
        customerName: estimate.customerPortalName || estimate.clientName,
        customerEmail: estimate.customerPortalEmail || estimate.clientEmail,
        note: customerRequestNote || undefined,
      },
    }))
    router.push("/new-estimate?mode=manual")
  }

  const heroTitle = isSignedIn
    ? "Ready for the next field quote?"
    : "Quote the job before you drive off."
  const heroSubtitle = isSignedIn
    ? "Capture the scope, clean the draft, and send a professional quote before the next service call starts."
    : "Start with voice, photos, or quick notes. SnapQuote keeps the quote moving while the job is still fresh."
  const localDrafts = useMemo(() => {
    return localEstimates.filter(isDraftEstimate)
  }, [localEstimates])
  const homeCustomerAction = useMemo(() => getHomeCustomerAction(localEstimates), [localEstimates])
  const draftQueueSummary = useMemo(() => {
    return localDrafts.reduce((summary, draft) => {
      const isCaptureDraft = isCaptureOnlyDraft(draft)
      const missingPriceCount = getDraftPriceTBDCount(draft)
      return {
        value: summary.value + getDraftValue(draft),
        needsPricing: summary.needsPricing + missingPriceCount,
        needsAiDraft: summary.needsAiDraft + (isCaptureDraft ? 1 : 0),
        nextCaptureDraft: summary.nextCaptureDraft || (isCaptureDraft ? draft : null),
        nextPricingDraft: summary.nextPricingDraft || (!isCaptureDraft && missingPriceCount > 0 ? draft : null),
      }
    }, {
      value: 0,
      needsPricing: 0,
      needsAiDraft: 0,
      nextCaptureDraft: null as LocalEstimate | null,
      nextPricingDraft: null as LocalEstimate | null,
    })
  }, [localDrafts])
  const nextHomeDraft = draftQueueSummary.nextCaptureDraft || draftQueueSummary.nextPricingDraft || localDrafts[0] || null
  const nextHomeDraftIsCapture = nextHomeDraft ? isCaptureOnlyDraft(nextHomeDraft) : false
  const nextHomeDraftScopeReviewed = nextHomeDraft ? hasScopeAssumptionsConfirmed(nextHomeDraft) : false
  const hasHomeSidePanel = Boolean(homeCustomerAction || nextHomeDraft || (!isSignedIn && !nextHomeDraft) || (isSignedIn && followUps.length > 0))
  const nextFollowUp = followUps[0]
  const nextFollowUpPortalState = nextFollowUp ? getHomeFollowUpPortalState(nextFollowUp.estimate) : null

  return (
    <>
      <QuickQuoteModal
        open={showQuickQuote}
        onClose={() => setShowQuickQuote(false)}
        item={selectedQuickItem}
        businessProfile={quickQuoteBusinessProfile}
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
                    <Button asChild className="flex-1 bg-blue-600 text-white hover:bg-blue-500" data-testid="home-connect-stripe-action">
                      <Link href="/profile#stripe-connect">
                        Connect Now
                      </Link>
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

            {homeCustomerAction ? (
              <section
                className={getCustomerActionPanelClass(homeCustomerAction)}
                data-testid="home-customer-action"
              >
                <div className="flex gap-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${
                    homeCustomerAction.kind === "collect"
                      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                      : "border-amber-300/25 bg-amber-300/10 text-amber-100"
                  }`}>
                    {homeCustomerAction.kind === "collect" ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <AlertCircle className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${
                          homeCustomerAction.kind === "collect" ? "text-emerald-100" : "text-amber-50"
                        }`}>
                          {homeCustomerAction.title}
                        </p>
                        <p className="mt-1 truncate text-sm font-semibold text-white" data-testid="home-customer-action-title">
                          {getDraftDisplayName(homeCustomerAction.estimate)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold ${
                          homeCustomerAction.kind === "collect"
                            ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                            : "border-amber-300/20 bg-amber-300/10 text-amber-100"
                        }`}
                        data-testid="home-customer-action-badge"
                      >
                        {homeCustomerAction.badge}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-300" data-testid="home-customer-action-description">
                      {homeCustomerAction.description}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {homeCustomerAction.kind === "revise" ? (
                        <Button
                          className="h-10 rounded-lg"
                          onClick={() => handleStartCustomerRevision(homeCustomerAction.estimate)}
                          data-testid="home-customer-action-primary"
                        >
                          <ClipboardList className="mr-2 h-4 w-4" />
                          Start revision
                        </Button>
                      ) : homeCustomerAction.kind === "review_scope" ? (
                        <Button asChild className="h-10 rounded-lg" data-testid="home-customer-action-primary">
                          <Link href={`/new-estimate?draftId=${encodeURIComponent(homeCustomerAction.estimate.id)}`}>
                            <AlertCircle className="mr-2 h-4 w-4" />
                            Review scope
                          </Link>
                        </Button>
                      ) : (
                        <Button asChild className="h-10 rounded-lg" data-testid="home-customer-action-primary">
                          <Link href={getHistoryFocusHref(homeCustomerAction.estimate)}>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Collect payment
                          </Link>
                        </Button>
                      )}
                      <Button
                        asChild
                        variant="outline"
                        className="h-10 rounded-lg border-white/10 bg-slate-950/60 text-slate-100 hover:bg-slate-900 hover:text-white"
                        data-testid="home-customer-action-history"
                      >
                        <Link href="/history">
                          History
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {nextHomeDraft ? (
              <section
                className="field-card w-full border-amber-300/20 bg-amber-500/10 p-4"
                data-testid="home-draft-queue"
              >
                <div className="flex gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-amber-300/25 bg-amber-300/10 text-amber-100">
                    {nextHomeDraftIsCapture ? (
                      <Sparkles className="h-5 w-5" />
                    ) : draftQueueSummary.needsPricing > 0 ? (
                      <AlertCircle className="h-5 w-5" />
                    ) : (
                      <ClipboardList className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-amber-50">
                          {nextHomeDraftIsCapture
                            ? "Turn saved capture into quote"
                            : draftQueueSummary.needsPricing > 0 ? "Next quote to finish" : "Resume latest draft"}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <p className="min-w-0 flex-[1_1_10rem] truncate text-sm font-semibold text-white" data-testid="home-draft-next-title">
                            {getDraftDisplayName(nextHomeDraft)}
                          </p>
                          {nextHomeDraftScopeReviewed ? (
                            <span
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-[10px] font-semibold text-emerald-100"
                              data-testid="home-draft-scope-reviewed"
                            >
                              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                              Scope reviewed
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-md border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[10px] font-semibold text-amber-100">
                        {nextHomeDraftIsCapture
                          ? formatCaptureDraftCount(draftQueueSummary.needsAiDraft)
                          : formatOpenDraftCount(localDrafts.length)}
                      </span>
                    </div>

                    {nextHomeDraftIsCapture ? (
                      <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-300" data-testid="home-draft-capture-note">
                        Field notes and photos are saved locally. Generate the AI draft before the scope gets stale.
                      </p>
                    ) : null}

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-md border border-white/10 bg-slate-950/35 px-2 py-2">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-amber-100/60">
                          {nextHomeDraftIsCapture ? "Quote" : "Value"}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-white" data-testid="home-draft-value">
                          {nextHomeDraftIsCapture ? "Not drafted" : formatHomeCurrency(draftQueueSummary.value)}
                        </p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-slate-950/35 px-2 py-2">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-amber-100/60">Needs</p>
                        <p className="mt-1 text-sm font-semibold text-white" data-testid="home-draft-needs-pricing">
                          {nextHomeDraftIsCapture ? "AI draft" : formatPriceTodoCount(draftQueueSummary.needsPricing)}
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
                          {nextHomeDraftIsCapture
                            ? "Resume capture"
                            : draftQueueSummary.needsPricing > 0 ? "Finish pricing" : "Resume draft"}
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

            {isSignedIn && nextFollowUp && nextFollowUpPortalState && (
              <div className="field-panel w-full border-amber-500/25 bg-amber-500/10" data-testid="home-follow-up-card">
                <div className="flex gap-4 p-4">
                  <div className="h-fit rounded-lg bg-amber-500/10 p-2">
                    <Clock className="h-5 w-5 text-amber-200" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <h2 className="text-sm font-semibold text-amber-200">Follow Up Needed</h2>
                      <span className="rounded-lg bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                        {nextFollowUp.daysSinceSent} days ago
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-400">
                      Estimate <b>#{nextFollowUp.estimate.estimateNumber}</b> for {nextFollowUp.estimate.clientName}
                    </p>
                    <div
                      className={`flex min-w-0 gap-2 rounded-lg border p-2 ${nextFollowUpPortalState.className}`}
                      data-testid="home-follow-up-portal-status"
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${nextFollowUpPortalState.iconClassName}`}>
                        <HomeFollowUpStatusIcon state={nextFollowUpPortalState} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold" data-testid="home-follow-up-portal-label">
                            {nextFollowUpPortalState.label}
                          </span>
                          <span className="shrink-0 rounded-md border border-white/10 bg-slate-950/35 px-1.5 py-0.5 text-[10px] font-semibold">
                            {nextFollowUpPortalState.badge}
                          </span>
                        </span>
                        <span className="mt-1 block text-[11px] leading-4 text-slate-300" data-testid="home-follow-up-portal-helper">
                          {nextFollowUpPortalState.helper}
                        </span>
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyFollowUp(nextFollowUp)}
                      className="w-full border-amber-400/20 bg-transparent text-xs text-amber-200 hover:bg-amber-500/10 hover:text-amber-100"
                    >
                      <Send className="mr-2 h-3 w-3" />
                      Copy Message
                    </Button>
                    {nextFollowUp.estimate.clientPhone ? (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-9 w-full border-emerald-500/20 bg-transparent text-xs text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-100"
                        data-testid="home-follow-up-sms-action"
                      >
                        <Link href={getHistoryFocusHref(nextFollowUp.estimate, "sms")}>
                          <MessageSquare className="mr-2 h-3 w-3" />
                          Text Customer
                        </Link>
                      </Button>
                    ) : null}
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-9 w-full border-blue-500/20 bg-transparent text-xs text-blue-400 hover:bg-blue-500/10"
                      data-testid="home-follow-up-open-action"
                    >
                      <Link href={getHistoryFocusHref(nextFollowUp.estimate, "follow-up")}>
                        <Mail className="mr-2 h-3 w-3" />
                        Send Follow-up
                      </Link>
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

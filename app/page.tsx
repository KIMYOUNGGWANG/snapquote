"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Mic, FileText, ArrowRight, Clock, Send, DollarSign, Sparkles, Languages, Signal, ShieldCheck } from "lucide-react"
import dynamic from "next/dynamic"

const OnboardingModal = dynamic(() => import("@/components/onboarding-modal").then(mod => mod.OnboardingModal), { ssr: false })
const QuickQuoteModal = dynamic(() => import("@/components/quick-quote-modal").then(mod => mod.QuickQuoteModal), { ssr: false })
const SetupWizard = dynamic(() => import("@/components/setup-wizard").then(mod => mod.SetupWizard), { ssr: false })
import { isFirstVisit, markOnboardingCompleted } from "@/lib/estimates-storage"
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

const REFERRAL_TOKEN_PATTERN = /^[a-z0-9]{8,32}$/
const CONNECT_PROMPT_KEY_PREFIX = "snapquote_connect_prompt_seen"

function TypewriterText({ text }: { text: string }) {
  const [displayText, setDisplayText] = useState("")

  useEffect(() => {
    let index = 0
    const timer = setInterval(() => {
      setDisplayText(text.slice(0, index))
      index++
      if (index > text.length) clearInterval(timer)
    }, 30) // Fast typing speed

    return () => clearInterval(timer)
  }, [text])

  return (
    <span className="font-mono text-blue-300">{displayText}<span className="animate-pulse">|</span></span>
  )
}

export default function Home() {
  const router = useRouter()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [priceListItems, setPriceListItems] = useState<PriceListItem[]>([])
  const [selectedQuickItem, setSelectedQuickItem] = useState<PriceListItem | null>(null)
  const [showQuickQuote, setShowQuickQuote] = useState(false)
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([])
  const [showConnectPrompt, setShowConnectPrompt] = useState(false)
  const [showSetupWizard, setShowSetupWizard] = useState(false)
  const [authResolved, setAuthResolved] = useState(false)
  const [isSignedIn, setIsSignedIn] = useState(false)

  useEffect(() => {
    if (isFirstVisit()) setShowOnboarding(true)
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

    const checkConnectPrompt = async (session: any) => {
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

    const syncSession = async (session: any) => {
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

  const handleOnboardingComplete = () => {
    markOnboardingCompleted()
    setShowOnboarding(false)
    router.push("/new-estimate")
  }

  const handleQuickQuote = (item: PriceListItem) => {
    setSelectedQuickItem(item)
    setShowQuickQuote(true)
  }

  const handleCopyFollowUp = (item: FollowUpItem) => {
    const text = generateFollowUpMessage(item.estimate.clientName, item.estimate.estimateNumber)
    navigator.clipboard.writeText(text)
    toast("📋 Message copied!", "success")
  }

  const heroTitle = isSignedIn
    ? "Ready for the next field quote?"
    : "Quote the job before you drive off."
  const heroSubtitle = isSignedIn
    ? "Capture the scope, clean the draft, and send a professional quote before the next service call starts."
    : "Built for owner-operators, small crews, and tradespeople who need to turn rough field notes or broken English into a customer-ready quote while the job is still fresh."

  return (
    <>
      <OnboardingModal
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onComplete={handleOnboardingComplete}
      />
      <QuickQuoteModal
        open={showQuickQuote}
        onClose={() => setShowQuickQuote(false)}
        item={selectedQuickItem}
      />

      {/* Main Container */}
      <div className="app-shell flex flex-col min-h-screen pb-32 px-4 pt-6 space-y-6">
        <div className="ambient-orb left-[-80px] top-10 h-44 w-44 bg-sky-500/20" />
        <div className="ambient-orb right-[-40px] top-28 h-36 w-36 bg-amber-500/[0.15]" />
        <div className="ambient-orb bottom-28 left-1/2 h-48 w-48 -translate-x-1/2 bg-cyan-400/10" />

        {/* If Setup Wizard is active, hide the rest of the dashboard */}
        {showSetupWizard && (
          <SetupWizard onComplete={() => setShowSetupWizard(false)} />
        )}

        {/* If not setting up, show the dashboard */}
        {!showSetupWizard && (
          <>
            {authResolved && (
              <div className="w-full max-w-sm mx-auto flex justify-end">
                {isSignedIn ? (
                  <Link href="/profile" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                    My Account
                  </Link>
                ) : (
                  <Link href="/login?next=%2F" className="text-xs text-gray-400 hover:text-white transition-colors">
                    Sign In / Sign Up
                  </Link>
                )}
              </div>
            )}

            {showConnectPrompt && (
              <Card className="border-blue-500/30 bg-blue-500/5 max-w-sm mx-auto w-full">
                <CardContent className="pt-5 space-y-3">
                  <p className="text-sm font-semibold text-blue-300">One-time setup: Connect Stripe</p>
                  <p className="text-xs text-muted-foreground">
                    First login is complete. Connect your company Stripe account once to generate card payment links.
                  </p>
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => router.push("/profile")}>
                      Connect Now
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowConnectPrompt(false)}
                    >
                      Later
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Hero Section */}
            <header className="premium-panel mesh-border mx-auto flex w-full max-w-sm flex-col items-center overflow-hidden px-5 pb-6 pt-5 text-center">
              <div className="mb-6 flex items-center justify-center p-1 rounded-full border border-white/10 bg-black/40 backdrop-blur-md shadow-inner text-[10px] font-semibold uppercase tracking-[0.15em] w-fit mx-auto cursor-default transition-all hover:bg-black/50">
                <span className="flex items-center gap-2 rounded-full bg-slate-800/80 px-4 py-1.5 text-slate-100 shadow-sm border border-white/5 pointer-events-none">
                  <Sparkles className="w-3 h-3 text-blue-400" />
                  Field Quote Workflow
                </span>
                <span className="px-5 py-1.5 text-slate-500 hover:text-slate-300 transition-colors pointer-events-auto">
                  AI Estimator
                </span>
              </div>

              <div className="space-y-4">
                <h1 className="text-balance text-[2rem] font-semibold leading-[1.05] tracking-[-0.04em] text-white sm:text-[2.4rem]">
                  {heroTitle}
                </h1>
                <p className="mx-auto max-w-[30rem] text-sm leading-6 text-slate-300">
                  {heroSubtitle}
                </p>
              </div>

              <div className="mt-5 grid w-full grid-cols-3 gap-2 text-left">
                <div className="premium-card px-3 py-3">
                  <Signal className="mb-2 h-4 w-4 text-sky-300" />
                  <p className="text-[11px] font-medium text-white">Weak signal</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">Draft from the truck, basement, or crawlspace.</p>
                </div>
                <div className="premium-card px-3 py-3">
                  <Languages className="mb-2 h-4 w-4 text-cyan-300" />
                  <p className="text-[11px] font-medium text-white">Clean English</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">Normalize rough field talk into a customer-ready draft.</p>
                </div>
                <div className="premium-card px-3 py-3">
                  <ShieldCheck className="mb-2 h-4 w-4 text-amber-300" />
                  <p className="text-[11px] font-medium text-white">Send on site</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">Review, send, and collect before heading out.</p>
                </div>
              </div>

              <div className="premium-card mt-5 w-full overflow-hidden p-4 text-left relative group">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-400/[0.15] text-sky-200">
                      <Mic className="w-4 h-4 animate-pulse" />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-200">Live field capture</p>
                      <p className="text-[11px] text-slate-400">Voice note to polished scope draft</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-medium text-emerald-200">
                    Listening
                  </span>
                </div>

                <p className="rounded-2xl border border-white/[0.08] bg-slate-950/60 px-3 py-3 text-sm leading-6 text-slate-200">
                  <TypewriterText text="Replace damaged trim, reset fixture, patch access, haul away debris..." />
                </p>
              </div>
            </header>

            {isSignedIn ? (
              <Link href="/new-estimate" className="w-full max-w-sm mx-auto block">
                <Button size="lg" className="w-full h-16 rounded-[24px] bg-blue-600/90 text-lg font-medium text-white shadow-[0_0_30px_rgba(59,130,246,0.3)] transition-all hover:bg-blue-500 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(59,130,246,0.5)] active:scale-[0.98] backdrop-blur-md border border-blue-500/30">
                  <Mic className="mr-2 h-6 w-6" />
                  Create Field Quote
                </Button>
                <p className="text-center text-xs text-muted-foreground mt-3">
                  Tap to speak • Built for weak-signal sites • Review before sending
                </p>
              </Link>
            ) : (
              <div className="w-full max-w-sm mx-auto space-y-3">
                <Link href="/landing" className="block" data-testid="home-primary-marketing-cta">
                  <Button size="lg" className="w-full h-16 rounded-[24px] bg-blue-600/90 text-lg font-medium text-white shadow-[0_0_30px_rgba(59,130,246,0.3)] transition-all hover:bg-blue-500 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(59,130,246,0.5)] active:scale-[0.98] backdrop-blur-md border border-blue-500/30">
                    See the Field Workflow
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/new-estimate" className="block" data-testid="home-try-free-cta">
                  <Button size="lg" variant="outline" className="w-full h-14 rounded-[22px] border-white/[0.15] bg-white/5 text-white hover:bg-white/10">
                    Try {FREE_PLAN_MARKETING_QUOTE_LIMIT} Free Field Quotes
                  </Button>
                </Link>
                <p className="text-center text-xs text-muted-foreground">
                  No login required to try a local draft. Sign in when you&apos;re ready to sync, send, and collect payment.
                </p>
              </div>
            )}

            {!isSignedIn && (
              <div className="w-full max-w-sm mx-auto text-center">
                <Link href="/pricing" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  See plans for one truck, higher volume, or a small crew
                </Link>
              </div>
            )}

            {!isSignedIn && (
              <div className="grid gap-3 max-w-sm mx-auto" data-testid="home-signed-out-workflow">
                <div className="premium-card premium-card-hover p-4 flex gap-3 items-start">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-300/20 bg-sky-400/[0.15]">
                    <Mic className="h-4 w-4 text-sky-200" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-white">Speak the scope once</p>
                    <p className="text-xs leading-5 text-slate-400">Capture rough field notes while the job is still fresh and before you lose the job details.</p>
                  </div>
                </div>
                <div className="premium-card premium-card-hover p-4 flex gap-3 items-start">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.15]">
                    <FileText className="h-4 w-4 text-cyan-200" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-white">Review a clean draft</p>
                    <p className="text-xs leading-5 text-slate-400">Turn rough or broken English into customer-ready wording with less cleanup after hours.</p>
                  </div>
                </div>
                <div className="premium-card premium-card-hover p-4 flex gap-3 items-start">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/[0.15]">
                    <DollarSign className="h-4 w-4 text-amber-200" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-white">Send before you leave</p>
                    <p className="text-xs leading-5 text-slate-400">Save, send, and collect payment without doing quote work after dinner.</p>
                  </div>
                </div>
              </div>
            )}

            {!isSignedIn && (
              <div className="premium-card max-w-sm mx-auto p-4 space-y-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-blue-300">
                  Best fit
                </p>
                <div className="space-y-2 text-sm text-slate-300">
                  <p>Owner-operators quoting from the truck</p>
                  <p>Weak-signal basements, crawlspaces, and remodel jobs</p>
                  <p>Teams that need cleaner customer-facing wording fast</p>
                </div>
                <Link href="/landing" className="inline-flex text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  See the full field workflow
                </Link>
              </div>
            )}

            {/* Action Required / Follow Ups */}
            {isSignedIn && followUps.length > 0 && (
              <div className="glass-card border-amber-500/20 bg-amber-500/5">
                <div className="p-4 flex gap-4">
                  <div className="p-2 bg-amber-500/10 rounded-full h-fit">
                    <Clock className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-amber-400 text-sm">Follow Up Needed</h3>
                      <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full">
                        {followUps[0].daysSinceSent} days ago
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Estimate <b>#{followUps[0].estimate.estimateNumber}</b> for {followUps[0].estimate.clientName}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyFollowUp(followUps[0])}
                      className="w-full h-9 text-xs border-amber-500/20 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 bg-transparent"
                    >
                      <Send className="w-3 h-3 mr-2" />
                      Copy Message
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Dashboard Grid */}
            {isSignedIn && (
              <div className="grid gap-4">
                <h2 className="text-sm font-medium text-gray-400 px-1 uppercase tracking-wider">Overview</h2>

                {/* Charts & Metrics inside Glass Cards */}
                <div className="glass-card p-2">
                  <RevenueChart />
                </div>

                <div className="flex flex-col gap-4">
                  <div className="glass-card p-1">
                    <FunnelMetricsCard />
                  </div>
                  <div className="glass-card p-1">
                    <UsagePlanCard />
                  </div>
                </div>
              </div>
            )}

            {/* Quick Quote Scroll */}
            {isSignedIn && priceListItems.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Quick Items</h2>
                  <Link href="/profile" className="text-xs text-blue-400 hover:text-blue-300">Edit</Link>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {priceListItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleQuickQuote(item)}
                      className="glass-card p-3 text-left hover:bg-white/10 transition-colors group"
                    >
                      <p className="text-sm font-medium text-gray-200 truncate group-hover:text-white">{item.name}</p>
                      <p className="text-lg font-bold text-blue-400 mt-1">${item.price}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

          </>
        )}
      </div>
    </>
  )
}

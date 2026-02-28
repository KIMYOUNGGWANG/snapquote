"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Mic, FileText, Zap, ArrowRight, Clock, Send, DollarSign, Sparkles } from "lucide-react"
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

    const loadPriceList = async () => {
      try {
        const items = await getPriceList()
        const sorted = items.sort((a, b) => b.usageCount - a.usageCount)
        setPriceListItems(sorted.slice(0, 6))
      } catch (err) {
        console.error("Failed to load price list:", err)
      }
    }
    loadPriceList()

    const checkFollowUps = async () => {
      const items = await getEstimatesNeedingFollowUp()
      setFollowUps(items)
    }
    checkFollowUps()
  }, [])

  useEffect(() => {
    let active = true

    const checkConnectPrompt = async (session: any) => {
      if (!active || !session?.user) {
        setShowConnectPrompt(false)
        setShowSetupWizard(false)
        return
      }

      const userId = session.user.id

      // 1. Check if core profile is set up (TB-17)
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
      } else {
        setShowSetupWizard(false)
      }

      // 2. Check Stripe Connect Prompt if profile is ready
      const promptKey = `${CONNECT_PROMPT_KEY_PREFIX}:${userId}`
      if (localStorage.getItem(promptKey) === "1") return

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
        if (!ready) {
          setShowConnectPrompt(true)
        }
        localStorage.setItem(promptKey, "1")
      } catch (error) {
        console.error("Failed to load Stripe Connect prompt status:", error)
      }
    }

    // Initial session check
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      const hasUser = Boolean(data.session?.user)
      setIsSignedIn(hasUser)
      setAuthResolved(true)
      if (hasUser) void checkConnectPrompt(data.session)
    })

    // Listen for changes
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      const hasUser = Boolean(session?.user)
      setIsSignedIn(hasUser)
      setAuthResolved(true)

      if (hasUser) {
        void checkConnectPrompt(session)
      } else {
        setShowConnectPrompt(false)
        setShowSetupWizard(false)
      }
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
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
      <div className="flex flex-col min-h-screen pb-32 px-4 pt-6 space-y-6">

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
            <header className="flex flex-col items-center text-center space-y-4 pt-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-medium tracking-wide uppercase">
                <Sparkles className="w-3 h-3" />
                <span>AI Estimator</span>
              </div>

              <h1 className="text-3xl font-bold tracking-tight text-white leading-tight">
                SnapQuote
              </h1>

              {/* Premium Voice Demo Card */}
              <div className="w-full max-w-sm glass-card p-4 text-left relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50" />
                <div className="flex gap-3">
                  <div className="p-2 h-fit bg-blue-500/20 rounded-full shrink-0">
                    <Mic className="w-4 h-4 text-blue-400 animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-blue-300 font-medium uppercase tracking-wider">Listening...</p>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      <TypewriterText text="Bathroom reno, 50 sqft tile, new vanity, 4 hours labor..." />
                    </p>
                  </div>
                </div>
              </div>
            </header>

            {/* Primary CTA */}
            <Link href="/new-estimate" className="w-full max-w-sm mx-auto block">
              <Button size="lg" className="w-full h-16 text-lg font-bold rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-[0_0_30px_-5px_rgba(37,99,235,0.4)] border border-blue-400/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                <Mic className="mr-2 h-6 w-6" />
                Create Estimate
              </Button>
              <p className="text-center text-xs text-muted-foreground mt-3">
                Tap to speak •Generates PDF in 30s
              </p>
            </Link>

            {/* Action Required / Follow Ups */}
            {followUps.length > 0 && (
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="glass-card p-1 overflow-hidden">
                    <FunnelMetricsCard />
                  </div>
                  <div className="glass-card p-1 overflow-hidden">
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

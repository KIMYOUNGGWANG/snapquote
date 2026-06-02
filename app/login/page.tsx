"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { trackReferralEvent } from "@/lib/referrals"
import { buildPostAuthRedirectPath, normalizeIntent, normalizeNextPath } from "@/lib/auth/oauth-callback"
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Mail, ShieldCheck, Sparkles } from "lucide-react"

const REFERRAL_TOKEN_PATTERN = /^[a-z0-9]{8,32}$/

type LoginNotice = {
    kind: "error" | "success"
    title: string
    message: string
} | null

const RETURN_TARGET_LABELS: Record<string, string> = {
    "/": "the app home",
    "/automation": "Automation",
    "/clients": "Clients",
    "/drafts": "Drafts",
    "/history": "History",
    "/new-estimate": "New Estimate",
    "/pricing": "Pricing",
    "/profile": "Profile",
    "/receipts": "Receipts",
    "/team": "Team Workspace",
    "/time-tracking": "Time Tracking",
}

const PRICING_PLAN_LABELS: Record<string, string> = {
    starter: "Starter plan",
    pro: "Pro plan",
    team: "Team plan",
}

function describeNormalizedPath(nextPath: string): string {
    const normalizedPath = normalizeNextPath(nextPath)
    const target = new URL(normalizedPath, "https://snapquote.local")

    if (target.pathname === "/pricing") {
        const planLabel = PRICING_PLAN_LABELS[target.searchParams.get("plan")?.toLowerCase() || ""]
        return planLabel ? `Pricing for the ${planLabel}` : "Pricing"
    }

    return RETURN_TARGET_LABELS[target.pathname] || target.pathname
}

function describeReturnTarget(nextPath: string, intent: string): string {
    if (normalizeIntent(intent) === "payment-link") {
        return "After sign-in, you'll return to payment link setup."
    }
    if (normalizeIntent(intent) === "referral-invite") {
        return "After sign-in, you'll return to New Estimate with referral invites unlocked."
    }
    if (normalizeIntent(intent) === "approval-link") {
        return "After sign-in, you'll return to New Estimate with customer approval links ready."
    }

    return `After sign-in, you'll return to ${describeNormalizedPath(nextPath)}.`
}

function LoginPageContent() {
    const searchParams = useSearchParams()
    const [email, setEmail] = useState("")
    const [loading, setLoading] = useState(false)
    const [oauthLoading, setOauthLoading] = useState(false)
    const [notice, setNotice] = useState<LoginNotice>(null)
    const nextPath = normalizeNextPath(searchParams.get("next"))
    const intent = normalizeIntent(searchParams.get("intent"))
    const returnTargetDescription = describeReturnTarget(nextPath, intent)
    const returnTargetLabel = describeNormalizedPath(nextPath)

    useEffect(() => {
        const referralToken = localStorage.getItem("snapquote_ref_token")?.trim().toLowerCase() || ""
        if (!REFERRAL_TOKEN_PATTERN.test(referralToken)) return

        const eventKey = `snapquote_ref_signup:${referralToken}`
        if (sessionStorage.getItem(eventKey)) return
        sessionStorage.setItem(eventKey, "1")

        void trackReferralEvent({
            token: referralToken,
            event: "signup_start",
            source: "login_page",
        })
    }, [])

    useEffect(() => {
        const oauthError = searchParams.get("oauth_error")?.trim()
        if (oauthError) {
            setNotice({
                kind: "error",
                title: "Sign-in paused",
                message: `${oauthError}. No setup changed. Try Google again or send a magic link.`,
            })
        }
    }, [searchParams])

    useEffect(() => {
        void supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                const target = buildPostAuthRedirectPath(nextPath, intent)
                window.location.href = target
            }
        })
    }, [intent, nextPath])

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setNotice(null)
        const redirectUrl = new URL(nextPath, window.location.origin)
        if (intent) {
            redirectUrl.searchParams.set("intent", intent)
        }

        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true,
                emailRedirectTo: redirectUrl.toString(),
            },
        })
        if (error) {
            setNotice({
                kind: "error",
                title: "Magic link was not sent",
                message: error.message,
            })
        } else {
            const successMessage = intent === "payment-link"
                ? "Check your email. After login, you'll return to payment link setup."
                : intent === "approval-link"
                    ? "Check your email. After login, customer approval links will be ready."
                    : "Check your email for the login link."
            setNotice({
                kind: "success",
                title: "Magic link sent",
                message: successMessage,
            })
        }
        setLoading(false)
    }

    const handleGoogleLogin = async () => {
        setNotice(null)
        setOauthLoading(true)

        const callbackPath = buildPostAuthRedirectPath("/auth/callback", intent)
        const callbackUrl = new URL(callbackPath, window.location.origin)
        callbackUrl.searchParams.set("next", nextPath)

        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: callbackUrl.toString(),
                queryParams: { prompt: "select_account" },
            },
        })

        if (error) {
            setNotice({
                kind: "error",
                title: "Google sign-in did not start",
                message: error.message,
            })
            setOauthLoading(false)
        }
    }

    const oauthBusy = oauthLoading

    return (
        <div className="field-app flex min-h-screen items-center justify-center px-4 py-8 text-white">
            <main className="grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.75fr)] lg:items-stretch" data-testid="login-workbench">
                <section className="field-panel overflow-hidden p-4 lg:p-6" data-testid="login-context-panel">
                    <div className="flex h-full flex-col justify-between gap-6">
                        <div className="space-y-5">
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-blue-600/15 text-blue-200">
                                    <Sparkles className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-blue-200">SnapQuote</p>
                                    <h1 className="mt-1 text-3xl font-semibold leading-[1.25] tracking-tight text-white" data-testid="login-page-title">
                                        Sign In
                                    </h1>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className="max-w-xl text-sm leading-6 text-slate-300">
                                    Keep your field quotes, payment links, and customer history tied to the right account before you continue.
                                </p>
                                <div className="hidden rounded-lg border border-blue-400/20 bg-blue-500/10 p-3 lg:block" data-testid="login-desktop-return-card">
                                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-100">
                                        <ArrowRight className="h-4 w-4" />
                                        Return path
                                    </div>
                                    <p className="text-xs leading-5 text-blue-100/85">
                                        {returnTargetDescription}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="hidden gap-2 text-xs leading-5 text-slate-400 lg:grid" data-testid="login-trust-strip">
                            <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3">
                                <ShieldCheck className="mb-2 h-4 w-4 text-emerald-300" />
                                <p className="font-semibold text-slate-100">Secure handoff</p>
                                <p className="mt-1">Magic links and Google sign-in return you to {returnTargetLabel}.</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3">
                                <Clock3 className="mb-2 h-4 w-4 text-blue-300" />
                                <p className="font-semibold text-slate-100">No password setup</p>
                                <p className="mt-1">First-time email login creates the account automatically.</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3">
                                <CheckCircle2 className="mb-2 h-4 w-4 text-emerald-300" />
                                <p className="font-semibold text-slate-100">Field work preserved</p>
                                <p className="mt-1">Drafts and payment setup continue after sign-in.</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="field-panel p-5" data-testid="login-form-panel">
                    {intent === "payment-link" && (
                        <p className="mb-3 rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-sm text-blue-100" data-testid="login-payment-link-copy">
                            Sign in to generate Stripe payment links for your estimate.
                        </p>
                    )}
                    {intent === "referral-invite" && (
                        <p className="mb-3 rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-sm text-blue-100" data-testid="login-referral-invite-copy">
                            Sign in to create and copy referral invites from your estimate workflow.
                        </p>
                    )}
                    {intent === "approval-link" && (
                        <p className="mb-3 rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-sm text-blue-100" data-testid="login-approval-link-copy">
                            Sign in to add customer approval links to email and SMS sends.
                        </p>
                    )}
                    <div className="mb-5 flex gap-3 rounded-lg border border-white/10 bg-slate-950/60 p-3">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                        <p className="text-xs leading-5 text-slate-400" data-testid="login-return-target">
                            {returnTargetDescription}
                        </p>
                    </div>

                    <div className="mb-6 space-y-3">
                        <Button
                            type="button"
                            variant="default"
                            className="h-12 w-full rounded-lg"
                            onClick={() => void handleGoogleLogin()}
                            disabled={loading || oauthBusy}
                        >
                            {oauthLoading ? "Redirecting..." : "Continue with Google"}
                        </Button>
                        <div className="relative py-2">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-white/10" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-[#111614] px-2 text-slate-300" data-testid="login-magic-link-divider">Or continue with magic link</span>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <label className="space-y-2">
                            <span className="text-sm font-medium text-slate-200">Email address</span>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                                <Input
                                    type="email"
                                    placeholder="you@company.com"
                                    className="h-12 rounded-lg border-white/10 bg-slate-950/70 pl-10 text-white placeholder:text-slate-500"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                        </label>
                        <Button type="submit" variant="outline" className="h-12 w-full rounded-lg border-white/10 bg-slate-900/70 text-white hover:bg-slate-800" disabled={loading || oauthBusy}>
                            {loading ? "Sending link..." : "Send Magic Link"}
                        </Button>
                        <p className="text-center text-xs leading-5 text-slate-500">
                            No password. First-time email login creates your account automatically.
                        </p>
                        {notice ? (
                            <div
                                className={
                                    notice.kind === "success"
                                        ? "rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-emerald-100"
                                        : "rounded-lg border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-amber-100"
                                }
                                data-testid="login-status-message"
                                role={notice.kind === "success" ? "status" : "alert"}
                            >
                                <div className="flex gap-2 text-left">
                                    {notice.kind === "success" ? (
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                                    ) : (
                                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                                    )}
                                    <div>
                                        <p className="text-sm font-semibold">{notice.title}</p>
                                        <p className="mt-1 text-xs leading-5 opacity-80">{notice.message}</p>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </form>
                </section>
            </main>
        </div>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="field-app min-h-screen" />}>
            <LoginPageContent />
        </Suspense>
    )
}

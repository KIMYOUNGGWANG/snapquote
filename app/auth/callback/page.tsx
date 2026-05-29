"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, ArrowRight, CheckCircle2, FileCheck2, Loader2, RefreshCw, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import {
    buildLoginErrorRedirectPath,
    normalizeOAuthError,
    resolveOAuthCallbackState,
} from "@/lib/auth/oauth-callback"

type AuthCallbackStatus = "loading" | "success" | "error"

type AuthCallbackView = {
    status: AuthCallbackStatus
    title: string
    message: string
    retryable?: boolean
}

type CallbackMethod = "code" | "implicit" | "provider-error" | "missing"

type AuthCallbackDetails = {
    intent: string
    returnPath: string
    method: CallbackMethod
}

type HandoffTone = "ready" | "pending" | "attention" | "muted"

type HandoffRow = {
    label: string
    value: string
    tone: HandoffTone
}

const verifyingView: AuthCallbackView = {
    status: "loading",
    title: "Verifying your account",
    message: "Keep this tab open while SnapQuote finishes the secure sign-in handshake.",
}

const initialCallbackDetails: AuthCallbackDetails = {
    intent: "",
    returnPath: "/",
    method: "missing",
}

function getProviderErrorMessage(params: URLSearchParams): string {
    return params.get("error_description") || params.get("error") || "OAuth sign-in failed"
}

function getCallbackMethod(params: URLSearchParams, hash: string): CallbackMethod {
    if (params.get("error_description") || params.get("error") || hash.includes("error_description")) {
        return "provider-error"
    }

    if (params.get("code")?.trim()) return "code"
    if (hash.includes("access_token")) return "implicit"
    return "missing"
}

function getMethodLabel(method: CallbackMethod): string {
    if (method === "code") return "Authorization code received"
    if (method === "implicit") return "Magic link token received"
    if (method === "provider-error") return "Provider stopped sign-in"
    return "No code or token"
}

function getIntentLabel(intent: string): string {
    if (!intent) return "Standard sign in"
    return intent
        .split(/[-_]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ")
}

function getHandoffToneClass(tone: HandoffTone) {
    if (tone === "ready") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
    if (tone === "pending") return "border-blue-300/25 bg-blue-400/10 text-blue-100"
    if (tone === "attention") return "border-amber-300/25 bg-amber-400/10 text-amber-100"
    return "border-white/10 bg-white/[0.03] text-slate-200"
}

function getHandoffRows(view: AuthCallbackView, details: AuthCallbackDetails): HandoffRow[] {
    const methodTone: HandoffTone = details.method === "code" || details.method === "implicit"
        ? "ready"
        : view.status === "loading"
            ? "pending"
            : "attention"

    const sessionValue = view.status === "success"
        ? "Session saved"
        : view.status === "loading"
            ? "Checking session"
            : view.retryable
                ? "Can retry final step"
                : "Needs fresh sign-in"

    const sessionTone: HandoffTone = view.status === "success"
        ? "ready"
        : view.status === "loading"
            ? "pending"
            : "attention"

    return [
        {
            label: "Callback method",
            value: getMethodLabel(details.method),
            tone: methodTone,
        },
        {
            label: "Requested work",
            value: getIntentLabel(details.intent),
            tone: "muted",
        },
        {
            label: "Return destination",
            value: details.returnPath,
            tone: "muted",
        },
        {
            label: "SnapQuote session",
            value: sessionValue,
            tone: sessionTone,
        },
    ]
}

function HandoffRowView({ label, value, tone }: HandoffRow) {
    return (
        <div className={`rounded-md border px-3 py-2.5 ${getHandoffToneClass(tone)}`}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <p className="text-xs font-medium text-slate-400">{label}</p>
                <p className="break-words text-sm font-semibold text-white sm:max-w-[14rem] sm:text-right">{value}</p>
            </div>
        </div>
    )
}

function SignInHandoffCard({ view, details }: { view: AuthCallbackView; details: AuthCallbackDetails }) {
    const rows = getHandoffRows(view, details)

    return (
        <div
            className="rounded-lg border border-white/10 bg-slate-950/45 p-4"
            data-testid="auth-callback-handoff-card"
        >
            <div className="mb-3 flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-200">
                    <FileCheck2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-white">Sign-in handoff</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                        Confirm the destination and recovery path before leaving this screen.
                    </p>
                </div>
            </div>
            <div className="space-y-2">
                {rows.map((row) => (
                    <HandoffRowView key={row.label} {...row} />
                ))}
            </div>
        </div>
    )
}

export default function AuthCallbackPage() {
    const [view, setView] = useState<AuthCallbackView>(verifyingView)
    const [callbackDetails, setCallbackDetails] = useState<AuthCallbackDetails>(initialCallbackDetails)
    const [showManualButton, setShowManualButton] = useState(false)
    const [redirectTarget, setRedirectTarget] = useState("/")
    const [loginErrorPath, setLoginErrorPath] = useState("/login")
    const mountedRef = useRef(false)
    const autoAttemptedRef = useRef(false)
    const redirectTimerRef = useRef<number | null>(null)
    const timeoutTimerRef = useRef<number | null>(null)

    const statusIcon = view.status === "success"
        ? <CheckCircle2 className="h-5 w-5 text-emerald-300" />
        : view.status === "loading"
            ? <Loader2 className="h-5 w-5 animate-spin text-blue-300" />
            : <AlertCircle className="h-5 w-5 text-amber-200" />

    const statusBoxClass = view.status === "success"
        ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
        : view.status === "loading"
            ? "border-blue-400/25 bg-blue-500/10 text-blue-100"
            : "border-amber-300/25 bg-amber-400/10 text-amber-100"

    const returnLabel = useMemo(() => {
        if (redirectTarget === "/") return "Open app home"
        return "Return to target"
    }, [redirectTarget])

    const showActionRow = view.status !== "loading" || showManualButton

    const updateView = useCallback((nextView: AuthCallbackView) => {
        if (mountedRef.current) setView(nextView)
    }, [])

    const failCallback = useCallback((input: {
        nextPath: string
        intent: string
        message: string
        retryable?: boolean
        title?: string
    }) => {
        const normalizedMessage = normalizeOAuthError(input.message)
        setLoginErrorPath(buildLoginErrorRedirectPath(input.nextPath, input.intent, normalizedMessage))
        updateView({
            status: "error",
            title: input.title || "Sign-in could not be completed",
            message: normalizedMessage,
            retryable: input.retryable,
        })
    }, [updateView])

    const finishSignIn = useCallback(async () => {
        if (timeoutTimerRef.current) {
            window.clearTimeout(timeoutTimerRef.current)
            timeoutTimerRef.current = null
        }

        const params = new URLSearchParams(window.location.search)
        const callbackState = resolveOAuthCallbackState(params)
        const { nextPath, intent, postAuthRedirectPath } = callbackState

        setRedirectTarget(postAuthRedirectPath)
        setCallbackDetails({
            intent,
            returnPath: postAuthRedirectPath,
            method: getCallbackMethod(params, window.location.hash),
        })
        setLoginErrorPath(buildLoginErrorRedirectPath(nextPath, intent, "Sign in failed. Please try again."))
        setShowManualButton(false)
        updateView(verifyingView)

        timeoutTimerRef.current = window.setTimeout(() => {
            failCallback({
                nextPath,
                intent,
                title: "Sign-in is taking longer than expected",
                message: "Sign in timed out. Please try again.",
                retryable: true,
            })
        }, 8000)

        const providerError = getProviderErrorMessage(params)
        if (params.get("error_description") || params.get("error")) {
            if (timeoutTimerRef.current) window.clearTimeout(timeoutTimerRef.current)
            failCallback({
                nextPath,
                intent,
                title: "Sign-in was not authorized",
                message: providerError,
            })
            return
        }

        try {
            const code = params.get("code")?.trim()

            if (code) {
                const { error } = await supabase.auth.exchangeCodeForSession(code)
                if (error) {
                    if (timeoutTimerRef.current) window.clearTimeout(timeoutTimerRef.current)
                    failCallback({
                        nextPath,
                        intent,
                        message: error.message,
                        retryable: true,
                    })
                    return
                }
            }
            else if (window.location.hash.includes("access_token") || window.location.hash.includes("error_description")) {
                const hashParams = new URLSearchParams(window.location.hash.replace("#", "?"))
                const hashError = hashParams.get("error_description") || hashParams.get("error")
                if (hashError) {
                    if (timeoutTimerRef.current) window.clearTimeout(timeoutTimerRef.current)
                    failCallback({
                        nextPath,
                        intent,
                        title: "Sign-in was not authorized",
                        message: hashError,
                    })
                    return
                }

                const { data, error } = await supabase.auth.getSession()
                if (error || !data.session) {
                    await new Promise(resolve => setTimeout(resolve, 500))
                    const retry = await supabase.auth.getSession()
                    if (retry.error || !retry.data.session) {
                        if (timeoutTimerRef.current) window.clearTimeout(timeoutTimerRef.current)
                        failCallback({
                            nextPath,
                            intent,
                            message: "Failed to establish session from implicit flow",
                            retryable: true,
                        })
                        return
                    }
                }
            } else {
                if (timeoutTimerRef.current) window.clearTimeout(timeoutTimerRef.current)
                failCallback({
                    nextPath,
                    intent,
                    title: "Sign-in callback was incomplete",
                    message: "Missing OAuth authorization code or token",
                })
                return
            }

            if (timeoutTimerRef.current) window.clearTimeout(timeoutTimerRef.current)
            updateView({
                status: "success",
                title: "Sign-in complete",
                message: "Your account is verified. Sending you back to SnapQuote now.",
            })
            redirectTimerRef.current = window.setTimeout(() => {
                window.location.href = postAuthRedirectPath
            }, 600)
        } catch (error) {
            if (timeoutTimerRef.current) window.clearTimeout(timeoutTimerRef.current)
            failCallback({
                nextPath,
                intent,
                message: error instanceof Error ? error.message : "Sign in failed. Please try again.",
                retryable: true,
            })
        }
    }, [failCallback, updateView])

    useEffect(() => {
        mountedRef.current = true

        if (!autoAttemptedRef.current) {
            autoAttemptedRef.current = true
            void finishSignIn()
        }

        return () => {
            mountedRef.current = false
            if (redirectTimerRef.current) window.clearTimeout(redirectTimerRef.current)
            if (timeoutTimerRef.current) window.clearTimeout(timeoutTimerRef.current)
        }
    }, [finishSignIn])

    useEffect(() => {
        if (view.status !== "loading") {
            setShowManualButton(false)
            return
        }

        const buttonTimer = window.setTimeout(() => {
            setShowManualButton(true)
        }, 3000)

        return () => window.clearTimeout(buttonTimer)
    }, [view.status])

    return (
        <div className="field-app flex min-h-[80vh] items-start justify-center px-4 pb-28 pt-5 text-white sm:items-center sm:py-8">
            <main className="grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.72fr)] lg:items-stretch" data-testid="auth-callback-workbench">
                <section className="field-panel order-2 p-4 lg:order-1 lg:p-6" data-testid="auth-callback-context-panel">
                    <div className="flex h-full flex-col justify-between gap-5">
                        <div className="space-y-5">
                            <div className="flex items-start gap-3">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-blue-400/25 bg-blue-500/10 text-blue-200">
                                    <ShieldCheck className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Secure sign in</p>
                                    <h1 className="mt-2 text-2xl font-semibold leading-[1.2] text-white sm:text-3xl">Account Handoff</h1>
                                </div>
                            </div>
                            <p className="max-w-xl text-sm leading-6 text-slate-300">
                                SnapQuote keeps the callback details visible so a contractor can recover cleanly if the provider stops, times out, or needs one more login.
                            </p>
                            <div className="hidden rounded-lg border border-blue-400/20 bg-blue-500/10 p-3 lg:block">
                                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-100">
                                    <ArrowRight className="h-4 w-4" />
                                    Return destination
                                </div>
                                <p className="break-words text-xs leading-5 text-blue-100/85">
                                    {redirectTarget}
                                </p>
                            </div>
                        </div>

                        <SignInHandoffCard view={view} details={callbackDetails} />
                    </div>
                </section>

                <section className="field-panel order-1 overflow-hidden lg:order-2" data-testid="auth-callback-panel">
                    <div className="border-b border-white/10 bg-slate-950/60 p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Callback status</p>
                        <h2 className="mt-2 text-2xl font-semibold text-white">Completing Sign In</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                            Finish the secure handoff, then return to the exact SnapQuote task that started sign-in.
                        </p>
                    </div>
                    <div className="space-y-4 p-5">
                        <div
                            className={`rounded-lg border p-4 ${statusBoxClass}`}
                            data-testid={`auth-callback-${view.status}`}
                            role={view.status === "loading" ? "status" : "alert"}
                        >
                            <div className="flex gap-3">
                                <div className="mt-0.5 shrink-0">{statusIcon}</div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold">{view.title}</p>
                                    <p className="mt-1 text-sm leading-6 opacity-80">{view.message}</p>
                                    {view.status === "success" ? (
                                        <p className="mt-2 text-xs uppercase tracking-[0.16em] opacity-70">
                                            Returning to {redirectTarget}
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        {showActionRow ? (
                            <div className="grid grid-cols-2 gap-2">
                                {view.status === "error" && view.retryable ? (
                                    <Button
                                        type="button"
                                        className="col-span-2 rounded-lg"
                                        onClick={() => void finishSignIn()}
                                        data-testid="auth-callback-retry-action"
                                    >
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Retry finish
                                    </Button>
                                ) : null}
                                {view.status === "error" ? (
                                    <Button
                                        asChild
                                        variant="outline"
                                        className="rounded-lg border-white/10 bg-slate-950/60 text-slate-100 hover:bg-slate-900 hover:text-white"
                                        data-testid="auth-callback-login-action"
                                    >
                                        <Link href={loginErrorPath}>
                                            <ShieldCheck className="mr-2 h-4 w-4" />
                                            Try sign in again
                                        </Link>
                                    </Button>
                                ) : null}
                                <Button
                                    asChild
                                    variant={view.status === "success" ? "default" : "outline"}
                                    className={`${view.status === "error" ? "" : "col-span-2"} rounded-lg border-white/10 bg-slate-950/60 text-slate-100 hover:bg-slate-900 hover:text-white`}
                                    data-testid="auth-callback-return-action"
                                >
                                    <Link href={redirectTarget}>
                                        <ArrowRight className="mr-2 h-4 w-4" />
                                        {view.status === "loading" ? "Continue manually" : returnLabel}
                                    </Link>
                                </Button>
                            </div>
                        ) : null}
                    </div>
                </section>
            </main>
        </div>
    )
}

"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle, ArrowLeft, CheckCircle2, FileCheck2, Loader2, LogIn, ReceiptText, RefreshCw } from "lucide-react"
import { withAuthHeaders } from "@/lib/auth-headers"

function decodeReturnPath(stateValue: string | null): string {
    if (!stateValue || typeof window === "undefined") return "/history"

    try {
        const padded = stateValue.replace(/-/g, "+").replace(/_/g, "/")
        const normalized = padded + "=".repeat((4 - (padded.length % 4 || 4)) % 4)
        const parsed = JSON.parse(window.atob(normalized))
        const returnPath = typeof parsed?.returnPath === "string" ? parsed.returnPath.trim() : ""
        if (returnPath.startsWith("/") && !returnPath.startsWith("//")) {
            return returnPath
        }
    } catch {
        return "/history"
    }

    return "/history"
}

type CallbackViewStatus = "loading" | "success" | "error" | "auth-required"

type CallbackView = {
    status: CallbackViewStatus
    title: string
    message: string
    retryable?: boolean
}

type CallbackDetails = {
    hasAuthorizationCode: boolean
    realmId: string | null
    returnPath: string
}

type HandoffTone = "ready" | "pending" | "attention" | "muted"

type HandoffRow = {
    label: string
    value: string
    tone: HandoffTone
}

const connectingView: CallbackView = {
    status: "loading",
    title: "Finishing QuickBooks connection",
    message: "Keep this tab open while SnapQuote verifies your QuickBooks company and saves the connection.",
}

const initialCallbackDetails: CallbackDetails = {
    hasAuthorizationCode: false,
    realmId: null,
    returnPath: "/history",
}

function getProviderErrorView(error: string, description: string | null): CallbackView {
    if (error === "access_denied") {
        return {
            status: "error",
            title: "QuickBooks authorization was canceled",
            message: "No accounting connection was changed. Return to History when you are ready to try the QuickBooks connection again.",
        }
    }

    return {
        status: "error",
        title: "QuickBooks did not authorize the connection",
        message: description || error || "Return to History and start the QuickBooks connection again.",
    }
}

function getApiErrorMessage(payload: unknown): string {
    if (payload && typeof payload === "object" && "error" in payload) {
        const error = (payload as { error?: unknown }).error

        if (error && typeof error === "object" && "message" in error) {
            const message = (error as { message?: unknown }).message
            if (typeof message === "string" && message.trim()) return message.trim()
        }

        if (typeof error === "string" && error.trim()) return error.trim()
    }

    return "Failed to finish QuickBooks connection."
}

function getHandoffRows(view: CallbackView, details: CallbackDetails): HandoffRow[] {
    const authorizationTone: HandoffTone = details.hasAuthorizationCode
        ? "ready"
        : view.status === "loading"
            ? "pending"
            : "attention"

    const companyTone: HandoffTone = details.realmId
        ? "ready"
        : view.status === "loading"
            ? "pending"
            : "attention"

    const sessionValue = view.status === "auth-required"
        ? "Login required"
        : view.status === "success"
            ? "Connection saved"
            : view.status === "loading"
                ? "Checking session"
                : view.retryable
                    ? "Final step can retry"
                    : "No account change"

    const sessionTone: HandoffTone = view.status === "auth-required" || view.status === "error"
        ? "attention"
        : view.status === "loading"
            ? "pending"
            : "ready"

    return [
        {
            label: "Authorization",
            value: details.hasAuthorizationCode ? "Code received" : "No code saved",
            tone: authorizationTone,
        },
        {
            label: "QuickBooks company",
            value: details.realmId || "Waiting for company ID",
            tone: companyTone,
        },
        {
            label: "SnapQuote session",
            value: sessionValue,
            tone: sessionTone,
        },
        {
            label: "Return destination",
            value: details.returnPath,
            tone: "muted",
        },
    ]
}

function getHandoffToneClass(tone: HandoffTone) {
    if (tone === "ready") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
    if (tone === "pending") return "border-blue-300/25 bg-blue-400/10 text-blue-100"
    if (tone === "attention") return "border-amber-300/25 bg-amber-400/10 text-amber-100"
    return "border-white/10 bg-white/[0.03] text-slate-200"
}

function ConnectionHandoffRow({ label, value, tone }: HandoffRow) {
    return (
        <div className={`rounded-md border px-2.5 py-2 sm:px-3 sm:py-2.5 ${getHandoffToneClass(tone)}`}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <p className="text-[11px] font-medium text-slate-400 sm:text-xs">{label}</p>
                <p className="break-words text-xs font-semibold leading-5 text-white sm:max-w-[14rem] sm:text-right sm:text-sm">{value}</p>
            </div>
        </div>
    )
}

function ConnectionHandoffCard({ view, details }: { view: CallbackView; details: CallbackDetails }) {
    const rows = getHandoffRows(view, details)

    return (
        <div
            className="rounded-lg border border-white/10 bg-slate-950/45 p-3 sm:p-4"
            data-testid="quickbooks-callback-handoff-card"
        >
            <div className="mb-3 flex items-start gap-3">
                <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-200 sm:flex">
                    <FileCheck2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-white">Connection handoff</h2>
                    <p className="mt-1 hidden text-sm leading-6 text-slate-400 sm:block">
                        Verify the authorization details before leaving this screen.
                    </p>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {rows.map((row) => (
                    <ConnectionHandoffRow key={row.label} {...row} />
                ))}
            </div>
        </div>
    )
}

export default function QuickBooksCallbackPage() {
    const [view, setView] = useState<CallbackView>(connectingView)
    const [callbackDetails, setCallbackDetails] = useState<CallbackDetails>(initialCallbackDetails)
    const [showManualButton, setShowManualButton] = useState(false)
    const [redirectTarget, setRedirectTarget] = useState("/history")
    const [currentCallbackPath, setCurrentCallbackPath] = useState("/quickbooks/callback")
    const mountedRef = useRef(false)
    const autoAttemptedRef = useRef(false)
    const redirectTimerRef = useRef<number | null>(null)

    const loginHref = useMemo(() => {
        return `/login?next=${encodeURIComponent(currentCallbackPath)}`
    }, [currentCallbackPath])

    const updateView = useCallback((nextView: CallbackView) => {
        if (mountedRef.current) setView(nextView)
    }, [])

    const finishConnection = useCallback(async () => {
        const callbackPath = `${window.location.pathname}${window.location.search}`
        setCurrentCallbackPath(callbackPath)
        setShowManualButton(false)
        updateView(connectingView)

        const params = new URLSearchParams(window.location.search)
        const returnPath = decodeReturnPath(params.get("state"))
        const code = params.get("code")?.trim()
        const realmId = params.get("realmId")?.trim()

        setRedirectTarget(returnPath)
        setCallbackDetails({
            hasAuthorizationCode: Boolean(code),
            realmId: realmId || null,
            returnPath,
        })

        const providerError = params.get("error")?.trim()
        const providerErrorDescription = params.get("error_description")?.trim() || null
        if (providerError || providerErrorDescription) {
            updateView(getProviderErrorView(providerError || "quickbooks_error", providerErrorDescription))
            return
        }

        if (!code || !realmId) {
            updateView({
                status: "error",
                title: "QuickBooks sent an incomplete callback",
                message: "The authorization code or company ID was missing. Return to History and start the QuickBooks connection again.",
            })
            return
        }

        try {
            const headers = await withAuthHeaders({ "content-type": "application/json" })
            if (!headers.authorization) {
                updateView({
                    status: "auth-required",
                    title: "Log in to finish QuickBooks",
                    message: "Your QuickBooks authorization is waiting, but SnapQuote needs an active session before it can save the connection.",
                    retryable: true,
                })
                return
            }

            const response = await fetch("/api/quickbooks/connect/token", {
                method: "POST",
                headers,
                body: JSON.stringify({ code, realmId }),
            })

            if (!response.ok) {
                const payload = await response.json().catch(() => null)
                updateView({
                    status: "error",
                    title: "QuickBooks connection could not be completed",
                    message: getApiErrorMessage(payload),
                    retryable: response.status >= 500 || response.status === 429,
                })
                return
            }

            updateView({
                status: "success",
                title: "QuickBooks is connected",
                message: "SnapQuote saved the accounting connection. Sending you back to your estimates now.",
            })
            if (redirectTimerRef.current) {
                window.clearTimeout(redirectTimerRef.current)
            }
            redirectTimerRef.current = window.setTimeout(() => {
                window.location.href = returnPath
            }, 900)
        } catch (error) {
            console.error("QuickBooks callback failed:", error)
            updateView({
                status: "error",
                title: "QuickBooks connection could not be completed",
                message: "Retry the final connection step or return to History and start the connection again.",
                retryable: true,
            })
        }
    }, [updateView])

    useEffect(() => {
        mountedRef.current = true

        if (!autoAttemptedRef.current) {
            autoAttemptedRef.current = true
            void finishConnection()
        }

        return () => {
            mountedRef.current = false
            if (redirectTimerRef.current) window.clearTimeout(redirectTimerRef.current)
        }
    }, [finishConnection])

    useEffect(() => {
        if (view.status !== "loading") {
            setShowManualButton(false)
            return
        }

        const timer = window.setTimeout(() => {
            setShowManualButton(true)
        }, 3000)

        return () => window.clearTimeout(timer)
    }, [view.status])

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

    return (
        <div className="field-app flex min-h-[80vh] items-start justify-center px-4 pb-28 pt-5 text-white sm:items-center sm:py-8">
            <main className="grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.72fr)] lg:items-stretch" data-testid="quickbooks-callback-workbench">
                <section className="field-panel order-2 p-4 lg:order-1 lg:p-6" data-testid="quickbooks-callback-context-panel">
                    <div className="flex h-full flex-col justify-between gap-5">
                        <div className="space-y-5">
                            <div className="flex items-start gap-3">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-blue-400/25 bg-blue-500/10 text-blue-200">
                                    <ReceiptText className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Accounting sync</p>
                                    <h1 className="mt-2 text-2xl font-semibold leading-[1.2] text-white sm:text-3xl">QuickBooks Handoff</h1>
                                </div>
                            </div>
                            <p className="max-w-xl text-sm leading-6 text-slate-300">
                                SnapQuote keeps the accounting callback visible until the authorization code, company ID, and return destination are accounted for.
                            </p>
                            <div className="hidden rounded-lg border border-blue-400/20 bg-blue-500/10 p-3 lg:block">
                                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-100">
                                    <ArrowLeft className="h-4 w-4" />
                                    Return destination
                                </div>
                                <p className="break-words text-xs leading-5 text-blue-100/85">
                                    {redirectTarget}
                                </p>
                            </div>
                        </div>

                        <ConnectionHandoffCard view={view} details={callbackDetails} />
                    </div>
                </section>

                <section className="field-panel order-1 overflow-hidden lg:order-2" data-testid="quickbooks-callback-panel">
                    <div className="border-b border-white/10 bg-slate-950/60 p-4 sm:p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Connection status</p>
                        <h2 className="mt-2 text-2xl font-semibold text-white">QuickBooks Connection</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                            Finish the accounting handoff, then return to the estimate history that started the sync.
                        </p>
                    </div>
                    <div className="space-y-3 p-4 sm:space-y-4 sm:p-5">
                        <div
                            className={`rounded-lg border p-3 sm:p-4 ${statusBoxClass}`}
                            data-testid={`quickbooks-callback-${view.status}`}
                            role={view.status === "loading" ? "status" : "alert"}
                        >
                            <div className="flex gap-3">
                                <div className="mt-0.5 shrink-0">{statusIcon}</div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold">{view.title}</p>
                                    <p className="mt-1 text-sm leading-5 opacity-80 sm:leading-6">{view.message}</p>
                                    {view.status === "success" ? (
                                        <p className="mt-2 text-xs uppercase tracking-[0.16em] opacity-70">
                                            Returning to {redirectTarget}
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                            {view.status === "auth-required" ? (
                                <Button asChild className="rounded-lg" data-testid="quickbooks-callback-login-action">
                                    <Link href={loginHref}>
                                        <LogIn className="mr-2 h-4 w-4" />
                                        Log in to finish
                                    </Link>
                                </Button>
                            ) : null}
                            {view.status === "error" && view.retryable ? (
                                <Button
                                    type="button"
                                    className="rounded-lg"
                                    onClick={() => void finishConnection()}
                                    data-testid="quickbooks-callback-retry-action"
                                >
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Retry finish
                                </Button>
                            ) : null}
                            {(view.status !== "loading" || showManualButton) ? (
                                <Button
                                    asChild
                                    variant={view.status === "success" ? "default" : "outline"}
                                    className="rounded-lg border-white/10 bg-slate-950/60 text-slate-100 hover:bg-slate-900 hover:text-white"
                                    data-testid="quickbooks-callback-return-action"
                                >
                                    <Link href={redirectTarget}>
                                        <ArrowLeft className="mr-2 h-4 w-4" />
                                        Return to estimates
                                    </Link>
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    )
}

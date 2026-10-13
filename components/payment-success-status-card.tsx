"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, Clock3, Loader2, SearchCheck } from "lucide-react"
import { withAuthHeaders } from "@/lib/auth-headers"
import { isEstimatePaidLike } from "@/lib/estimate-payment-state"
import { getEstimates, updateEstimate, type LocalEstimate } from "@/lib/estimates-storage"

type PaymentSuccessStatusCardProps = {
    estimateId: string
    estimateNumber: string
    sessionId: string
}

type LocalPaymentState =
    | { status: "checking" }
    | { status: "updated"; estimate: LocalEstimate; wasAlreadyPaid: boolean }
    | { status: "not-found" }
    | { status: "missing-details" }
    | { status: "error"; message: string }

type StripePaymentStatusResponse = {
    ok?: boolean
    paid?: boolean
    checkoutSessionId?: string
    paidAt?: string
    error?: string | { message?: string }
}

function matchesPaidEstimate(estimate: LocalEstimate, estimateId: string, estimateNumber: string) {
    const idMatches = Boolean(estimateId) && estimate.id === estimateId
    const numberMatches = Boolean(estimateNumber) && estimate.estimateNumber === estimateNumber
    return idMatches || numberMatches
}

function formatAmount(amount: number): string {
    return `$${amount.toFixed(2)}`
}

async function verifyStripePaymentForEstimate(
    estimate: LocalEstimate,
    sessionId: string
): Promise<{ ok: true; checkoutSessionId?: string; paidAt?: string } | { ok: false; message: string }> {
    const paymentLinkId = estimate.paymentLinkId?.trim()
    if (!paymentLinkId) {
        return {
            ok: false,
            message: "This local estimate does not have a Stripe payment link saved, so SnapQuote did not mark it paid from the return URL.",
        }
    }
    if (!sessionId.trim()) {
        return {
            ok: false,
            message: "Stripe checkout session id was not included, so SnapQuote did not mark local history paid from this return URL.",
        }
    }

    const params = new URLSearchParams({ paymentLinkId })
    if (estimate.id) params.set("estimateId", estimate.id)
    if (estimate.estimateNumber) params.set("estimateNumber", estimate.estimateNumber)
    if (sessionId) params.set("sessionId", sessionId)

    const headers = await withAuthHeaders()
    const response = await fetch(`/api/payments/stripe/status?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        headers,
    })

    const result = await response.json().catch(() => ({})) as StripePaymentStatusResponse
    if (!response.ok) {
        if (response.status === 401) {
            return {
                ok: false,
                message: "Sign in and open History to confirm this payment with Stripe before marking local history paid.",
            }
        }

        const errorMessage = typeof result.error === "string"
            ? result.error
            : result.error?.message

        return {
            ok: false,
            message: errorMessage || "Stripe could not confirm this checkout session yet. Open History to retry the payment check.",
        }
    }

    if (!result.ok || !result.paid) {
        return {
            ok: false,
            message: "Stripe did not confirm this checkout session as paid yet. Open History to retry the payment check.",
        }
    }

    if (sessionId && result.checkoutSessionId && result.checkoutSessionId !== sessionId) {
        return {
            ok: false,
            message: "Stripe confirmed a different checkout session for this estimate. Open History to retry the payment check.",
        }
    }

    return {
        ok: true,
        checkoutSessionId: result.checkoutSessionId,
        paidAt: result.paidAt,
    }
}

export function PaymentSuccessStatusCard({
    estimateId,
    estimateNumber,
    sessionId,
}: PaymentSuccessStatusCardProps) {
    const [localState, setLocalState] = useState<LocalPaymentState>({ status: "checking" })
    const paidAt = useMemo(() => new Date().toISOString(), [])

    useEffect(() => {
        let active = true

        const syncLocalEstimate = async () => {
            if (!estimateId && !estimateNumber) {
                if (active) setLocalState({ status: "missing-details" })
                return
            }

            try {
                const estimates = await getEstimates()
                const estimate = estimates.find((candidate) => matchesPaidEstimate(candidate, estimateId, estimateNumber))

                if (!estimate) {
                    if (active) setLocalState({ status: "not-found" })
                    return
                }

                const wasAlreadyPaid = isEstimatePaidLike(estimate)
                if (wasAlreadyPaid) {
                    if (estimate.status !== "paid") {
                        await updateEstimate(estimate.id, {
                            status: "paid",
                            paymentCompletedAt: estimate.paymentCompletedAt,
                            synced: false,
                        })

                        const refreshed = await getEstimates()
                        const updatedEstimate = refreshed.find((candidate) => candidate.id === estimate.id) || {
                            ...estimate,
                            status: "paid" as const,
                            synced: false,
                        }
                        if (active) setLocalState({ status: "updated", estimate: updatedEstimate, wasAlreadyPaid: true })
                        return
                    }

                    if (active) setLocalState({ status: "updated", estimate, wasAlreadyPaid: true })
                    return
                }

                const verifiedPayment = await verifyStripePaymentForEstimate(estimate, sessionId)
                if (!verifiedPayment.ok) {
                    if (active) setLocalState({ status: "error", message: verifiedPayment.message })
                    return
                }

                await updateEstimate(estimate.id, {
                    status: "paid",
                    paymentCompletedAt: verifiedPayment.paidAt || estimate.paymentCompletedAt || paidAt,
                    lastPaymentSessionId: verifiedPayment.checkoutSessionId || sessionId || estimate.lastPaymentSessionId,
                    synced: false,
                })

                const refreshed = await getEstimates()
                const updatedEstimate =
                    refreshed.find((candidate) => candidate.id === estimate.id) ||
                    { ...estimate, status: "paid" as const, paymentCompletedAt: estimate.paymentCompletedAt || paidAt }

                if (active) setLocalState({ status: "updated", estimate: updatedEstimate, wasAlreadyPaid })
            } catch (error) {
                console.error("Failed to reconcile local payment success:", error)
                if (active) {
                    setLocalState({
                        status: "error",
                        message: "Local history could not be updated. Open History to let SnapQuote check the payment again.",
                    })
                }
            }
        }

        void syncLocalEstimate()

        return () => {
            active = false
        }
    }, [estimateId, estimateNumber, paidAt, sessionId])

    if (localState.status === "checking") {
        return (
            <div className="rounded-lg border border-blue-400/25 bg-blue-500/10 p-4 text-blue-100" data-testid="payment-success-local-status">
                <div className="flex gap-3">
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-300" />
                    <div>
                        <p className="text-sm font-semibold">Checking local quote history</p>
                        <p className="mt-1 text-xs leading-5 text-blue-100/75">
                            Matching this payment to the estimate saved on this device.
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    if (localState.status === "updated") {
        return (
            <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-4 text-emerald-100" data-testid="payment-success-local-status">
                <div className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                            {localState.wasAlreadyPaid ? "Local history already showed paid" : "Local history updated to paid"}
                        </p>
                        <p className="mt-1 break-words text-xs leading-5 text-emerald-100/75 [overflow-wrap:anywhere]">
                            {localState.estimate.estimateNumber || estimateNumber || "This estimate"} is ready in the Paid lane.
                        </p>
                        <div className="mt-3 rounded-lg border border-emerald-300/15 bg-slate-950/45 px-3 py-2" data-testid="payment-success-paid-summary">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/55">Paid record</p>
                            <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                <p
                                    className="line-clamp-3 min-w-0 break-words text-sm font-semibold leading-5 text-white [overflow-wrap:anywhere]"
                                    data-testid="payment-success-paid-client"
                                >
                                    {localState.estimate.clientName || "Customer"}
                                </p>
                                <p className="shrink-0 text-sm font-semibold text-white">
                                    {formatAmount(localState.estimate.totalAmount)}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (localState.status === "not-found") {
        return (
            <div className="rounded-lg border border-amber-300/25 bg-amber-400/10 p-4 text-amber-100" data-testid="payment-success-local-status">
                <div className="flex gap-3">
                    <SearchCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                    <div>
                        <p className="text-sm font-semibold">Payment confirmed, local estimate not found</p>
                        <p className="mt-1 text-xs leading-5 text-amber-100/75">
                            Stripe confirmed checkout. If this was paid on a customer device, open History on the contractor device to sync the status.
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    if (localState.status === "missing-details") {
        return (
            <div className="rounded-lg border border-white/10 bg-slate-950/60 p-4 text-slate-300" data-testid="payment-success-local-status">
                <div className="flex gap-3">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div>
                        <p className="text-sm font-semibold text-slate-100">Payment confirmation received</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">
                            No estimate reference was included in the return URL, so History will rely on Stripe sync to update the record.
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="rounded-lg border border-amber-300/25 bg-amber-400/10 p-4 text-amber-100" data-testid="payment-success-local-status">
            <div className="flex gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                <div>
                    <p className="text-sm font-semibold">Payment status needs a History check</p>
                    <p className="mt-1 text-xs leading-5 text-amber-100/75">{localState.message}</p>
                </div>
            </div>
        </div>
    )
}

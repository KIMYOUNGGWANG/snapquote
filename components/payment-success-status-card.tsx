"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, Clock3, Loader2, SearchCheck } from "lucide-react"
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

function matchesPaidEstimate(estimate: LocalEstimate, estimateId: string, estimateNumber: string) {
    const idMatches = Boolean(estimateId) && estimate.id === estimateId
    const numberMatches = Boolean(estimateNumber) && estimate.estimateNumber === estimateNumber
    return idMatches || numberMatches
}

function formatAmount(amount: number): string {
    return `$${amount.toFixed(2)}`
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

                const wasAlreadyPaid = estimate.status === "paid"
                if (!wasAlreadyPaid || estimate.lastPaymentSessionId !== sessionId) {
                    await updateEstimate(estimate.id, {
                        status: "paid",
                        paymentCompletedAt: estimate.paymentCompletedAt || paidAt,
                        lastPaymentSessionId: sessionId || estimate.lastPaymentSessionId,
                        synced: false,
                    })
                }

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

"use client"

import { useState } from "react"
import { CheckCircle2, CreditCard, Loader2, MessageSquare, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { CustomerPortalStatus } from "@/lib/server/customer-portal"
import {
    getCustomerPortalPaymentActionState,
    type CustomerPortalPaymentLinkType,
} from "@/lib/customer-portal-payment"
import {
    getCustomerQuoteDecisionRetryLabel,
    type CustomerQuoteDecisionAction,
} from "@/lib/customer-portal-decision-recovery"
import { CUSTOMER_QUOTE_STATUS_CHANGED_EVENT } from "@/lib/customer-portal-status"

type CustomerQuoteActionsProps = {
    token: string
    initialStatus: CustomerPortalStatus
    paymentLink?: string
    paymentLinkType?: CustomerPortalPaymentLinkType
    paymentComplete?: boolean
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message
    return "Something went wrong. Please try again."
}

function getDecisionCopy(status: CustomerPortalStatus, paymentComplete: boolean): string {
    if (paymentComplete) return "Payment received. This quote is already paid."
    if (status === "approved") return "Approved. The contractor has your approval."
    if (status === "change_requested") return "Change request sent. The contractor can follow up with the next version."
    if (status === "viewed") return "Viewed. Approve this quote or request a change below."
    return "Review this quote and send your decision."
}

export function CustomerQuoteActions({
    token,
    initialStatus,
    paymentLink,
    paymentLinkType,
    paymentComplete = false,
}: CustomerQuoteActionsProps) {
    const [status, setStatus] = useState<CustomerPortalStatus>(initialStatus)
    const [customerName, setCustomerName] = useState("")
    const [customerEmail, setCustomerEmail] = useState("")
    const [message, setMessage] = useState("")
    const [submittingAction, setSubmittingAction] = useState<CustomerQuoteDecisionAction | null>(null)
    const [errorMessage, setErrorMessage] = useState("")
    const [failedAction, setFailedAction] = useState<CustomerQuoteDecisionAction | null>(null)

    const submitDecision = async (action: CustomerQuoteDecisionAction) => {
        const trimmedMessage = message.trim()
        if (action === "request_changes" && !trimmedMessage) {
            setErrorMessage("Please add a short note so the contractor knows what to revise.")
            setFailedAction(null)
            return
        }

        setSubmittingAction(action)
        setErrorMessage("")
        setFailedAction(null)

        try {
            const response = await fetch(`/api/public/quotes/${encodeURIComponent(token)}/decision`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    action,
                    customerName: customerName.trim() || undefined,
                    customerEmail: customerEmail.trim() || undefined,
                    message: trimmedMessage || undefined,
                }),
            })

            const data = await response.json().catch(() => ({}))
            if (!response.ok) {
                const messageFromResponse = typeof data?.error?.message === "string"
                    ? data.error.message
                    : "Could not send your response."
                throw new Error(messageFromResponse)
            }

            const nextStatus = data?.quote?.status
            const resolvedStatus = nextStatus === "change_requested" ? "change_requested" : "approved"
            setStatus(resolvedStatus)
            setFailedAction(null)
            window.dispatchEvent(new CustomEvent(CUSTOMER_QUOTE_STATUS_CHANGED_EVENT, {
                detail: { status: resolvedStatus },
            }))
        } catch (error) {
            setErrorMessage(getErrorMessage(error))
            setFailedAction(action)
        } finally {
            setSubmittingAction(null)
        }
    }

    const decisionIsComplete = paymentComplete || status === "approved" || status === "change_requested"
    const paymentAction = getCustomerPortalPaymentActionState(status, Boolean(paymentLink?.trim()), paymentLinkType, paymentComplete)
    const paymentGateClassName = paymentAction.tone === "success"
        ? "mt-3 rounded-lg border border-emerald-300/25 bg-emerald-500/10 px-3 py-2 text-sm leading-6 text-emerald-100"
        : "mt-3 rounded-lg border border-blue-300/20 bg-blue-500/10 px-3 py-2 text-sm leading-6 text-blue-100"

    return (
        <section className="rounded-lg border border-white/10 bg-slate-950/70 p-4 shadow-[0_22px_50px_-34px_rgba(15,23,42,0.9)]" data-testid="customer-quote-actions">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
                    <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-white">Quote decision</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-400" data-testid="customer-quote-decision-status">
                        {getDecisionCopy(status, paymentComplete)}
                    </p>
                </div>
            </div>

            {!decisionIsComplete ? (
                <div className="mt-4 space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                            value={customerName}
                            onChange={(event) => setCustomerName(event.target.value)}
                            placeholder="Your name"
                            className="rounded-lg border-white/10 bg-slate-950/80 text-white placeholder:text-slate-500"
                            data-testid="customer-quote-name-input"
                        />
                        <Input
                            value={customerEmail}
                            onChange={(event) => setCustomerEmail(event.target.value)}
                            placeholder="Email for confirmation"
                            className="rounded-lg border-white/10 bg-slate-950/80 text-white placeholder:text-slate-500"
                            data-testid="customer-quote-email-input"
                        />
                    </div>
                    <Textarea
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="Optional approval note, or describe requested changes"
                        className="min-h-[96px] resize-none rounded-lg border-white/10 bg-slate-950/80 text-white placeholder:text-slate-500"
                        data-testid="customer-quote-message-input"
                    />
                    {errorMessage ? (
                        <div
                            className="rounded-lg border border-red-400/25 bg-red-500/10 p-3"
                            role="alert"
                            data-testid="customer-quote-decision-error"
                        >
                            <p className="text-sm leading-6 text-red-100">{errorMessage}</p>
                            {failedAction ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    className="mt-3 h-10 rounded-lg bg-red-100 text-red-950 hover:bg-white"
                                    onClick={() => void submitDecision(failedAction)}
                                    disabled={Boolean(submittingAction)}
                                    data-testid="customer-quote-decision-retry-action"
                                >
                                    {submittingAction === failedAction ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                    )}
                                    {getCustomerQuoteDecisionRetryLabel(failedAction)}
                                </Button>
                            ) : null}
                        </div>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-2">
                        <Button
                            type="button"
                            className="h-11 rounded-lg"
                            onClick={() => void submitDecision("approve")}
                            disabled={Boolean(submittingAction)}
                            data-testid="customer-quote-approve-button"
                        >
                            {submittingAction === "approve" ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Approve quote
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="h-11 rounded-lg border-white/10 bg-slate-950/70 text-slate-200 hover:bg-slate-900 hover:text-white"
                            onClick={() => void submitDecision("request_changes")}
                            disabled={Boolean(submittingAction)}
                            data-testid="customer-quote-change-button"
                        >
                            {submittingAction === "request_changes" ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <MessageSquare className="mr-2 h-4 w-4" />
                            )}
                            Request changes
                        </Button>
                    </div>
                </div>
            ) : null}

            {paymentLink && paymentAction.showPayLink ? (
                <Button asChild className="mt-3 h-11 w-full rounded-lg bg-emerald-600 text-white hover:bg-emerald-500" data-testid="customer-quote-pay-link">
                    <a href={paymentLink} target="_blank" rel="noreferrer">
                        <CreditCard className="mr-2 h-4 w-4" />
                        {paymentAction.buttonLabel}
                    </a>
                </Button>
            ) : paymentAction.helperText ? (
                <p
                    className={paymentGateClassName}
                    data-testid="customer-quote-payment-gate"
                >
                    {paymentAction.helperText}
                </p>
            ) : null}
        </section>
    )
}

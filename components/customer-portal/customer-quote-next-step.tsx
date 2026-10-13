"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, CreditCard, MessageSquare } from "lucide-react"
import type { CustomerPortalStatus } from "@/lib/server/customer-portal"
import {
    CUSTOMER_QUOTE_STATUS_CHANGED_EVENT,
    getCustomerQuoteNextStepCopy,
} from "@/lib/customer-portal-status"

type CustomerQuoteNextStepProps = {
    initialStatus: CustomerPortalStatus
    paymentComplete?: boolean
    paymentTerms?: string
    closingNote?: string
}

function isCustomerPortalDecisionStatus(value: unknown): value is CustomerPortalStatus {
    return value === "shared" || value === "viewed" || value === "approved" || value === "change_requested"
}

function getNextStepIconState(status: CustomerPortalStatus, paymentComplete: boolean) {
    if (paymentComplete) {
        return {
            Icon: CheckCircle2,
            className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
        }
    }

    if (status === "change_requested") {
        return {
            Icon: MessageSquare,
            className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-300/20 bg-amber-400/10 text-amber-100",
        }
    }

    return {
        Icon: CreditCard,
        className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-300/20 bg-blue-400/10 text-blue-100",
    }
}

export function CustomerQuoteNextStep({
    initialStatus,
    paymentComplete = false,
    paymentTerms,
    closingNote,
}: CustomerQuoteNextStepProps) {
    const [status, setStatus] = useState<CustomerPortalStatus>(initialStatus)
    const nextStepCopy = useMemo(
        () => getCustomerQuoteNextStepCopy(status, paymentComplete),
        [paymentComplete, status],
    )
    const { Icon: NextStepIcon, className: nextStepIconClassName } = getNextStepIconState(status, paymentComplete)

    useEffect(() => {
        const handleStatusChanged = (event: Event) => {
            const nextStatus = (event as CustomEvent<{ status?: unknown }>).detail?.status
            if (isCustomerPortalDecisionStatus(nextStatus)) {
                setStatus(nextStatus)
            }
        }

        window.addEventListener(CUSTOMER_QUOTE_STATUS_CHANGED_EVENT, handleStatusChanged)
        return () => window.removeEventListener(CUSTOMER_QUOTE_STATUS_CHANGED_EVENT, handleStatusChanged)
    }, [])

    return (
        <section className="rounded-lg border border-white/10 bg-slate-950/65 p-4" data-testid="customer-quote-next-step">
            <div className="flex items-start gap-3">
                <div className={nextStepIconClassName}>
                    <NextStepIcon className="h-5 w-5" />
                </div>
                <div>
                    <p className="font-semibold text-white" data-testid="customer-quote-next-step-title">
                        {nextStepCopy.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-400" data-testid="customer-quote-next-step-description">
                        {nextStepCopy.description}
                    </p>
                </div>
            </div>
            {paymentTerms ? (
                <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Terms</p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">{paymentTerms}</p>
                </div>
            ) : null}
            {closingNote ? (
                <p className="mt-3 text-sm leading-6 text-slate-400">{closingNote}</p>
            ) : null}
        </section>
    )
}

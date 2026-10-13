"use client"

import { useEffect, useState } from "react"
import type { CustomerPortalStatus } from "@/lib/server/customer-portal"
import {
    CUSTOMER_QUOTE_STATUS_CHANGED_EVENT,
    getCustomerQuoteStatusClassName,
    getCustomerQuoteStatusLabel,
} from "@/lib/customer-portal-status"

type CustomerQuoteStatusBadgeProps = {
    initialStatus: CustomerPortalStatus
    paymentComplete?: boolean
}

function isCustomerPortalDecisionStatus(value: unknown): value is CustomerPortalStatus {
    return value === "shared" || value === "viewed" || value === "approved" || value === "change_requested"
}

export function CustomerQuoteStatusBadge({ initialStatus, paymentComplete = false }: CustomerQuoteStatusBadgeProps) {
    const [status, setStatus] = useState<CustomerPortalStatus>(initialStatus)
    const displayStatus = paymentComplete ? "paid" : status

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
        <span
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${getCustomerQuoteStatusClassName(displayStatus)}`}
            data-testid="customer-quote-status"
        >
            {getCustomerQuoteStatusLabel(displayStatus)}
        </span>
    )
}

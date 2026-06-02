export type CustomerPortalUiStatus = "shared" | "viewed" | "approved" | "change_requested" | "paid"

export const CUSTOMER_QUOTE_STATUS_CHANGED_EVENT = "snapquote:customer-quote-status-changed"

export type CustomerQuoteNextStepCopy = {
    title: string
    description: string
}

export function isCustomerPortalUiStatus(value: unknown): value is CustomerPortalUiStatus {
    return value === "shared"
        || value === "viewed"
        || value === "approved"
        || value === "change_requested"
        || value === "paid"
}

export function getCustomerQuoteStatusLabel(status: string): string {
    if (status === "paid") return "Paid"
    if (status === "approved") return "Approved"
    if (status === "change_requested") return "Changes requested"
    if (status === "viewed") return "Viewed"
    return "Ready for review"
}

export function getCustomerQuoteStatusClassName(status: string): string {
    if (status === "paid") return "border-emerald-300/25 bg-emerald-500/15 text-emerald-100"
    if (status === "approved") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
    if (status === "change_requested") return "border-amber-300/25 bg-amber-400/10 text-amber-100"
    return "border-blue-300/25 bg-blue-400/10 text-blue-100"
}

export function getCustomerQuoteNextStepCopy(status: string, paymentComplete = false): CustomerQuoteNextStepCopy {
    if (paymentComplete || status === "paid") {
        return {
            title: "Payment received",
            description: "You're all set. The contractor has this quote marked paid and can follow up with scheduling, receipts, or closeout details.",
        }
    }

    if (status === "change_requested") {
        return {
            title: "Waiting on revision",
            description: "Your change request has been sent. The contractor can update the scope before payment or scheduling moves forward.",
        }
    }

    if (status === "approved") {
        return {
            title: "Payment is next",
            description: "Your approval is recorded. Use the payment option when available, or coordinate payment and scheduling with the contractor.",
        }
    }

    return {
        title: "Review and respond",
        description: "Check the scope, totals, and terms, then approve or request changes so the contractor can keep the job moving.",
    }
}

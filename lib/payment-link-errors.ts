export type PaymentLinkIssue = {
    statusLabel: "Setup needed" | "Failed" | "Try later"
    title: string
    message: string
    actionHref?: string
    actionLabel?: string
}

export function readPaymentLinkErrorPayload(payload: unknown): { message: string; code?: string } {
    if (!payload || typeof payload !== "object") {
        return { message: "Failed to create payment link" }
    }

    const errorPayload = payload as { error?: unknown; code?: unknown }
    const code = typeof errorPayload.code === "string" ? errorPayload.code : undefined
    const error = errorPayload.error

    if (typeof error === "string" && error.trim()) {
        return { message: error, code }
    }

    if (error && typeof error === "object" && "message" in error) {
        const nestedMessage = (error as { message?: unknown }).message
        if (typeof nestedMessage === "string" && nestedMessage.trim()) {
            return { message: nestedMessage, code }
        }
    }

    return { message: "Failed to create payment link", code }
}

export function buildPaymentLinkIssue(input: { message: string; code?: string; status?: number }): PaymentLinkIssue {
    if (input.code === "STRIPE_CONNECT_REQUIRED") {
        return {
            statusLabel: "Setup needed",
            title: "Connect Stripe to get paid online",
            message: "Stripe is not connected yet. Open Profile, connect Stripe, then return here to add this payment link.",
            actionHref: "/profile#stripe-connect",
            actionLabel: "Open Profile",
        }
    }

    if (input.code === "STRIPE_CONNECT_INCOMPLETE") {
        return {
            statusLabel: "Setup needed",
            title: "Finish Stripe onboarding",
            message: "Stripe onboarding is incomplete. Finish it in Profile, then retry this payment link.",
            actionHref: "/profile#stripe-connect",
            actionLabel: "Open Profile",
        }
    }

    if (input.status === 429) {
        return {
            statusLabel: "Try later",
            title: "Too many payment link attempts",
            message: input.message,
        }
    }

    return {
        statusLabel: "Failed",
        title: "Payment link was not created",
        message: input.message,
    }
}

export class PaymentLinkCreationError extends Error {
    issue: PaymentLinkIssue

    constructor(message: string, issue: PaymentLinkIssue) {
        super(message)
        this.name = "PaymentLinkCreationError"
        this.issue = issue
    }
}

export type CustomerPortalPaymentStatus = "shared" | "viewed" | "approved" | "change_requested"
export type CustomerPortalPaymentLinkType = "full" | "deposit" | "custom"

export type CustomerPortalPaymentActionState = {
    showPayLink: boolean
    helperText: string
    buttonLabel: string
    tone: "info" | "success"
}

function getPaymentNoun(paymentLinkType?: CustomerPortalPaymentLinkType): string {
    if (paymentLinkType === "deposit") return "deposit payment"
    if (paymentLinkType === "full") return "full payment"
    return "online payment"
}

function getPayButtonLabel(paymentLinkType?: CustomerPortalPaymentLinkType): string {
    if (paymentLinkType === "deposit") return "Pay deposit"
    if (paymentLinkType === "full") return "Pay full amount"
    return "Pay online"
}

export function getCustomerPortalPaymentActionState(
    status: CustomerPortalPaymentStatus,
    hasPaymentLink: boolean,
    paymentLinkType?: CustomerPortalPaymentLinkType,
    paymentComplete = false,
): CustomerPortalPaymentActionState {
    const paymentNoun = getPaymentNoun(paymentLinkType)
    const buttonLabel = getPayButtonLabel(paymentLinkType)

    if (paymentComplete) {
        return {
            showPayLink: false,
            helperText: "Payment received. The contractor has this quote marked paid.",
            buttonLabel,
            tone: "success",
        }
    }

    if (!hasPaymentLink) {
        return { showPayLink: false, helperText: "", buttonLabel, tone: "info" }
    }

    if (status === "approved") {
        return {
            showPayLink: true,
            helperText: `${paymentNoun.charAt(0).toUpperCase()}${paymentNoun.slice(1)} is ready.`,
            buttonLabel,
            tone: "success",
        }
    }

    if (status === "change_requested") {
        return {
            showPayLink: false,
            helperText: "Payment is paused while the contractor prepares the next version.",
            buttonLabel,
            tone: "info",
        }
    }

    return {
        showPayLink: false,
        helperText: `Approve this quote to unlock ${paymentNoun}.`,
        buttonLabel,
        tone: "info",
    }
}

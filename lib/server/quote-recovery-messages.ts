import type {
    CandidateCustomerPortal,
    CustomerPortalFollowupStatus,
    RecoveryAction,
} from "@/lib/server/quote-recovery-types"

const MAX_PREVIEW_LENGTH = 320

export function getCustomerDecisionSkipAction(portal: CandidateCustomerPortal | undefined): RecoveryAction | null {
    if (portal?.status === "approved") return "skipped_customer_approved"
    if (portal?.status === "change_requested") return "skipped_customer_change_requested"
    return null
}

export function isActionableRecoveryAction(action: RecoveryAction): boolean {
    return action === "sent_sms" || action === "sent_email"
}

export function buildCustomerDecisionSkipPreview(portal: CandidateCustomerPortal, estimateNumber: string): string {
    if (portal.status === "approved") {
        return `Estimate ${estimateNumber} is already approved by the customer, so Quote Recovery will not send a reminder.`
    }

    const note = portal.customerNote
        ? ` Customer note: ${portal.customerNote}`
        : ""

    return `Estimate ${estimateNumber} has a customer change request, so start a revision instead of sending a reminder.${note}`
}

export function buildScopeReviewSkipPreview(estimateNumber: string): string {
    return `Estimate ${estimateNumber} has thin field scope notes that need review before Quote Recovery sends a reminder. Open the estimate and confirm the scope assumptions first.`
}

export function buildPaidSkipPreview(estimateNumber: string): string {
    return `Estimate ${estimateNumber} is already marked paid, so Quote Recovery will not send a reminder.`
}

export function appendCustomerPortalReviewLink(message: string, shareUrl: string): string {
    if (!shareUrl || message.includes(shareUrl)) return message
    return `${message.trim()} Review or approve here: ${shareUrl}`
}

export function defaultRecoveryMessage(input: {
    clientName: string
    estimateNumber: string
    totalAmount?: number | null
    businessName: string
    customerPortalStatus?: CustomerPortalFollowupStatus
    customerPortalUrl?: string
}): string {
    const totalText =
        typeof input.totalAmount === "number" && Number.isFinite(input.totalAmount)
            ? ` regarding your ${Math.max(0, input.totalAmount).toFixed(2)} quote`
            : ""

    if (input.customerPortalUrl) {
        if (input.customerPortalStatus === "viewed") {
            return `Hi ${input.clientName}, just checking in on estimate ${input.estimateNumber}${totalText} from ${input.businessName}. If the scope looks good, you can approve it or request changes here: ${input.customerPortalUrl}`
        }

        return `Hi ${input.clientName}, following up on estimate ${input.estimateNumber}${totalText} from ${input.businessName}. The review link is ready here: ${input.customerPortalUrl} Let me know if you want to adjust anything or lock in a schedule.`
    }

    return `Hi ${input.clientName}, just checking in on estimate ${input.estimateNumber}${totalText} from ${input.businessName}. Let me know if you have any questions or want to lock in a schedule.`
}

export function toMessagePreview(message: string): string {
    const singleLine = message.replace(/\s+/g, " ").trim()
    return singleLine.slice(0, MAX_PREVIEW_LENGTH)
}

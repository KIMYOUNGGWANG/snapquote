export type CustomerQuoteDecisionAction = "approve" | "request_changes"

export function getCustomerQuoteDecisionRetryLabel(action: CustomerQuoteDecisionAction): string {
    return action === "approve" ? "Retry approval" : "Retry change request"
}

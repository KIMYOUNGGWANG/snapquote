import { withAuthHeaders } from "@/lib/auth-headers"

export type QuoteRecoveryAction =
    | "sent_sms"
    | "sent_email"
    | "skipped_no_contact"
    | "skipped_scope_review_needed"
    | "skipped_customer_paid"
    | "skipped_customer_approved"
    | "skipped_customer_change_requested"

export type QuoteRecoveryCustomerPortalStatus = "shared" | "viewed" | "approved" | "change_requested"

export interface QuoteRecoveryResult {
    estimateId: string
    estimateNumber: string
    action: QuoteRecoveryAction
    messagePreview: string
    customerPortalStatus?: QuoteRecoveryCustomerPortalStatus
}

export interface QuoteRecoveryResponse {
    ok: true
    processedCount: number
    actionableCount?: number
    skippedCount?: number
    results: QuoteRecoveryResult[]
}

export async function triggerQuoteRecovery(input: {
    dryRun: boolean
    estimateId?: string
}): Promise<QuoteRecoveryResponse> {
    const headers = await withAuthHeaders({ "Content-Type": "application/json" })

    const response = await fetch("/api/quotes/recovery/trigger", {
        method: "POST",
        headers,
        body: JSON.stringify(input),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
        throw new Error(
            typeof data?.error === "string" && data.error.trim()
                ? data.error.trim()
                : "Failed to run quote recovery"
        )
    }

    return data as QuoteRecoveryResponse
}

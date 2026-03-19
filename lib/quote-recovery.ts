import { withAuthHeaders } from "@/lib/auth-headers"

export type QuoteRecoveryAction = "sent_sms" | "sent_email" | "skipped_no_contact"

export interface QuoteRecoveryResult {
    estimateId: string
    estimateNumber: string
    action: QuoteRecoveryAction
    messagePreview: string
}

export interface QuoteRecoveryResponse {
    ok: true
    processedCount: number
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

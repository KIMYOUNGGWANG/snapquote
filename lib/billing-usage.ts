import { withAuthHeaders } from "@/lib/auth-headers"

export type BillingUsagePlanTier = "free" | "starter" | "pro" | "team"

export interface BillingUsageSnapshot {
    planTier: BillingUsagePlanTier
    periodStart: string
    usage: {
        generate: number
        transcribe: number
        send_email: number
    }
    limits: {
        generate: number
        transcribe: number
        send_email: number
    }
    remaining: {
        generate: number
        transcribe: number
        send_email: number
    }
    usageRatePct: {
        generate: number
        transcribe: number
        send_email: number
    }
    openaiPromptTokens: number
    openaiCompletionTokens: number
    estimatedCosts: {
        openai: number
        resend: number
        total: number
    }
}

export async function getBillingUsageSnapshot(): Promise<{
    authorized: boolean
    snapshot: BillingUsageSnapshot | null
}> {
    const headers = await withAuthHeaders()
    if (!headers.authorization) {
        return { authorized: false, snapshot: null }
    }

    const response = await fetch("/api/billing/usage", {
        method: "GET",
        headers,
        cache: "no-store",
    })

    if (response.status === 401) {
        return { authorized: false, snapshot: null }
    }

    if (!response.ok) {
        return { authorized: true, snapshot: null }
    }

    const snapshot = await response.json() as BillingUsageSnapshot
    return { authorized: true, snapshot }
}

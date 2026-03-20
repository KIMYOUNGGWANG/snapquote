import { withAuthHeaders } from "@/lib/auth-headers"

export interface QuickBooksStatusResponse {
    ok: true
    planTier: "free" | "starter" | "pro" | "team"
    eligible: boolean
    connected: boolean
    realmId?: string
    reconnectRequired: boolean
    syncStats: {
        syncedInvoices: number
        latestSyncedAt?: string
    }
}

export interface QuickBooksInvoiceSyncResponse {
    ok: true
    deduped?: boolean
    invoiceId: string
    customerId?: string
    docNumber?: string
    status: "open" | "paid" | "unknown"
    syncedAt: string
}

export async function getQuickBooksStatus(): Promise<QuickBooksStatusResponse | null> {
    try {
        const headers = await withAuthHeaders()
        if (!headers.authorization) return null

        const response = await fetch("/api/quickbooks/status", {
            method: "GET",
            headers,
            cache: "no-store",
        })

        if (!response.ok) return null
        return (await response.json()) as QuickBooksStatusResponse
    } catch (error) {
        console.error("Failed to load QuickBooks status:", error)
        return null
    }
}

export async function startQuickBooksConnect(returnPath = "/history"): Promise<{ url: string } | null> {
    try {
        const headers = await withAuthHeaders({ "content-type": "application/json" })
        if (!headers.authorization) return null

        const response = await fetch("/api/quickbooks/connect/start", {
            method: "POST",
            headers,
            body: JSON.stringify({ returnPath }),
        })

        if (!response.ok) return null
        const data = (await response.json()) as { url?: string }
        return typeof data.url === "string" && data.url ? { url: data.url } : null
    } catch (error) {
        console.error("Failed to start QuickBooks connect:", error)
        return null
    }
}

export async function syncEstimateToQuickBooks(input: Record<string, unknown>): Promise<QuickBooksInvoiceSyncResponse | null> {
    try {
        const headers = await withAuthHeaders({ "content-type": "application/json" })
        if (!headers.authorization) return null

        const response = await fetch("/api/quickbooks/invoices/sync", {
            method: "POST",
            headers,
            body: JSON.stringify(input),
        })

        if (!response.ok) return null
        return (await response.json()) as QuickBooksInvoiceSyncResponse
    } catch (error) {
        console.error("Failed to sync estimate to QuickBooks:", error)
        return null
    }
}

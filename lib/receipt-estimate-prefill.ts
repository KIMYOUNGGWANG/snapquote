import type { Receipt } from "@/lib/db"

export const RECEIPT_ESTIMATE_PREFILL_KEY = "snapquote_receipt_estimate_prefill"

export type ReceiptEstimatePrefill = {
    amount?: number
    vendor?: string
    note?: string
    date?: string
}

function cleanString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined

    const trimmed = value.trim()
    return trimmed || undefined
}

function cleanAmount(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined
    return value
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function saveReceiptEstimatePrefill(receipt: Pick<Receipt, "amount" | "vendor" | "note" | "date">): boolean {
    if (typeof window === "undefined") return false

    const payload: ReceiptEstimatePrefill = {
        amount: cleanAmount(receipt.amount),
        vendor: cleanString(receipt.vendor),
        note: cleanString(receipt.note),
        date: cleanString(receipt.date),
    }

    if (typeof payload.amount !== "number" && !payload.vendor && !payload.note) return false

    try {
        window.sessionStorage.setItem(RECEIPT_ESTIMATE_PREFILL_KEY, JSON.stringify(payload))
        return true
    } catch {
        return false
    }
}

export function consumeReceiptEstimatePrefill(): ReceiptEstimatePrefill | null {
    if (typeof window === "undefined") return null

    try {
        const rawValue = window.sessionStorage.getItem(RECEIPT_ESTIMATE_PREFILL_KEY)
        window.sessionStorage.removeItem(RECEIPT_ESTIMATE_PREFILL_KEY)

        if (!rawValue) return null

        const parsed: unknown = JSON.parse(rawValue)
        if (!isObjectRecord(parsed)) return null

        const prefill: ReceiptEstimatePrefill = {
            amount: cleanAmount(parsed.amount),
            vendor: cleanString(parsed.vendor),
            note: cleanString(parsed.note),
            date: cleanString(parsed.date),
        }

        if (typeof prefill.amount !== "number" && !prefill.vendor && !prefill.note) return null

        return prefill
    } catch {
        return null
    }
}

export function formatReceiptEstimateNotes(prefill: ReceiptEstimatePrefill): string {
    const parts: string[] = []
    const vendor = prefill.vendor || "material receipt"

    if (typeof prefill.amount === "number") {
        parts.push(`Add ${vendor} receipt for $${prefill.amount.toFixed(2)} as a reimbursable material cost.`)
    } else {
        parts.push(`Add ${vendor} receipt as a reimbursable material cost.`)
    }

    if (prefill.note) {
        parts.push(`Receipt note: ${prefill.note}.`)
    }

    if (prefill.date) {
        parts.push(`Purchase date: ${prefill.date}.`)
    }

    return parts.join(" ")
}

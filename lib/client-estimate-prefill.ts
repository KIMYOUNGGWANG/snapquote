import type { Client } from "@/lib/db"

export const CLIENT_ESTIMATE_PREFILL_KEY = "snapquote_client_estimate_prefill"

export type ClientEstimatePrefill = {
    name: string
    address?: string
    phone?: string
    email?: string
    notes?: string
}

function cleanString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined

    const trimmed = value.trim()
    return trimmed || undefined
}

function normalizeEstimatePhone(value: unknown): string | undefined {
    const trimmed = cleanString(value)
    if (!trimmed) return undefined
    if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed

    const digits = trimmed.replace(/\D/g, "")
    if (digits.length === 10) return `+1${digits}`
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`

    return trimmed
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function saveClientEstimatePrefill(client: Pick<Client, "name" | "address" | "phone" | "email" | "notes">): boolean {
    if (typeof window === "undefined") return false

    const payload: ClientEstimatePrefill = {
        name: client.name.trim(),
        address: cleanString(client.address),
        phone: normalizeEstimatePhone(client.phone),
        email: cleanString(client.email),
        notes: cleanString(client.notes),
    }

    if (!payload.name) return false

    try {
        window.sessionStorage.setItem(CLIENT_ESTIMATE_PREFILL_KEY, JSON.stringify(payload))
        return true
    } catch {
        return false
    }
}

export function consumeClientEstimatePrefill(): ClientEstimatePrefill | null {
    if (typeof window === "undefined") return null

    try {
        const rawValue = window.sessionStorage.getItem(CLIENT_ESTIMATE_PREFILL_KEY)
        window.sessionStorage.removeItem(CLIENT_ESTIMATE_PREFILL_KEY)

        if (!rawValue) return null

        const parsed: unknown = JSON.parse(rawValue)
        if (!isObjectRecord(parsed)) return null

        const name = cleanString(parsed.name)
        if (!name) return null

        return {
            name,
            address: cleanString(parsed.address),
            phone: normalizeEstimatePhone(parsed.phone),
            email: cleanString(parsed.email),
            notes: cleanString(parsed.notes),
        }
    } catch {
        return null
    }
}

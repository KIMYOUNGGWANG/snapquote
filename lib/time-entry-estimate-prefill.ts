import type { TimeEntry } from "@/lib/db"

export const TIME_ENTRY_ESTIMATE_PREFILL_KEY = "snapquote_time_entry_estimate_prefill"

export type TimeEntryEstimatePrefill = {
    projectName?: string
    duration?: number
    date?: string
}

function cleanString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined

    const trimmed = value.trim()
    return trimmed || undefined
}

function cleanDuration(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined
    return Math.round(value)
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function formatMinutes(minutes: number): string {
    const safeMinutes = Math.max(0, Math.round(minutes))
    const hours = Math.floor(safeMinutes / 60)
    const remainingMinutes = safeMinutes % 60

    if (safeMinutes === 0) return "less than 1m"
    if (hours > 0 && remainingMinutes > 0) return `${hours}h ${remainingMinutes}m`
    if (hours > 0) return `${hours}h`
    return `${remainingMinutes}m`
}

export function saveTimeEntryEstimatePrefill(entry: Pick<TimeEntry, "projectName" | "duration" | "date">): boolean {
    if (typeof window === "undefined") return false

    const payload: TimeEntryEstimatePrefill = {
        projectName: cleanString(entry.projectName),
        duration: cleanDuration(entry.duration),
        date: cleanString(entry.date),
    }

    if (!payload.projectName && typeof payload.duration !== "number") return false

    try {
        window.sessionStorage.setItem(TIME_ENTRY_ESTIMATE_PREFILL_KEY, JSON.stringify(payload))
        return true
    } catch {
        return false
    }
}

export function consumeTimeEntryEstimatePrefill(): TimeEntryEstimatePrefill | null {
    if (typeof window === "undefined") return null

    try {
        const rawValue = window.sessionStorage.getItem(TIME_ENTRY_ESTIMATE_PREFILL_KEY)
        window.sessionStorage.removeItem(TIME_ENTRY_ESTIMATE_PREFILL_KEY)

        if (!rawValue) return null

        const parsed: unknown = JSON.parse(rawValue)
        if (!isObjectRecord(parsed)) return null

        const prefill: TimeEntryEstimatePrefill = {
            projectName: cleanString(parsed.projectName),
            duration: cleanDuration(parsed.duration),
            date: cleanString(parsed.date),
        }

        if (!prefill.projectName && typeof prefill.duration !== "number") return null

        return prefill
    } catch {
        return null
    }
}

export function formatTimeEntryEstimateNotes(prefill: TimeEntryEstimatePrefill): string {
    const projectName = prefill.projectName || "the job"
    const durationText = typeof prefill.duration === "number" ? formatMinutes(prefill.duration) : "the logged time"
    const parts = [
        `Add labor time for ${projectName}: ${durationText}. Use the contractor's standard labor rate unless a different rate is specified.`,
    ]

    if (prefill.date) {
        parts.push(`Work date: ${prefill.date}.`)
    }

    return parts.join(" ")
}

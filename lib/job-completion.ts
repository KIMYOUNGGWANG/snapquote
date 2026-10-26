// Pure helpers for the job completion report. Client code imports this file too, so no server-only imports.
import type { EstimateSection, JobCompletionItem, LocalEstimate } from "@/lib/estimates-storage"
import { getAllItemsFromEstimate, lineTotal } from "@/lib/estimates/math"

export type CompletionMatchConfidence = "high" | "low"

export type CompletionMatch = {
    itemId: string
    photoIndexes: number[]
    confidence: CompletionMatchConfidence
}

export type CompletionMatchResult = {
    summary: string
    items: CompletionMatch[]
}

const MAX_SUMMARY_LENGTH = 1000

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function sanitizeCompletionMatches(
    raw: unknown,
    itemIds: readonly string[],
    photoCount: number
): CompletionMatchResult {
    if (!isRecord(raw) || !Array.isArray(raw.items)) {
        return { summary: "", items: [] }
    }

    const knownIds = new Set(itemIds)
    const seen = new Set<string>()
    const items: CompletionMatch[] = []

    for (const entry of raw.items) {
        if (!isRecord(entry)) continue
        const { itemId, photoIndexes, confidence } = entry
        if (typeof itemId !== "string" || !knownIds.has(itemId) || seen.has(itemId)) continue
        seen.add(itemId)

        const indexes = Array.isArray(photoIndexes)
            ? [...new Set(photoIndexes.filter(
                (index): index is number => Number.isInteger(index) && index >= 0 && index < photoCount
            ))].sort((a, b) => a - b)
            : []

        items.push({ itemId, photoIndexes: indexes, confidence: confidence === "high" ? "high" : "low" })
    }

    const summary = typeof raw.summary === "string" ? raw.summary.trim().slice(0, MAX_SUMMARY_LENGTH) : ""
    return { summary, items }
}

export type ExtraWorkLine = { description: string; amount: number }

export const ADDED_ON_SITE_SECTION_NAME = "Added on site"

function roundToCents(value: number): number {
    return Math.round(value * 100) / 100
}

export function canCompleteJob(estimate: LocalEstimate): boolean {
    return (estimate.status === "sent" && estimate.customerPortalStatus === "approved")
        || (estimate.status === "paid" && estimate.paymentLinkType === "deposit")
}

export function buildExtraWorkSection(lines: ExtraWorkLine[]): EstimateSection {
    const items = lines
        .map((line) => ({ description: line.description.trim(), amount: roundToCents(line.amount) }))
        .filter((line) => line.description && Number.isFinite(line.amount) && line.amount > 0)
        .map((line, index) => ({
            id: crypto.randomUUID(),
            itemNumber: index + 1,
            category: "SERVICE" as const,
            description: line.description,
            quantity: 1,
            unit: "LS" as const,
            unit_price: line.amount,
            total: line.amount,
        }))

    return { id: crypto.randomUUID(), name: ADDED_ON_SITE_SECTION_NAME, addedOnSite: true, items }
}

/** Swaps in the extra-work section (replacing an earlier one) and recomputes tax and total at the estimate's rate. */
export function applyExtraWork(estimate: LocalEstimate, lines: ExtraWorkLine[]): LocalEstimate {
    const previous = (estimate.sections ?? []).filter((section) => section.addedOnSite)
    const section = buildExtraWorkSection(lines)
    if (previous.length === 0 && section.items.length === 0) return estimate

    const previousItemIds = new Set(previous.flatMap((entry) => entry.items.map((item) => item.id)))
    const sections = [
        ...(estimate.sections ?? []).filter((entry) => !entry.addedOnSite),
        ...(section.items.length > 0 ? [section] : []),
    ]
    const next: LocalEstimate = {
        ...estimate,
        // Composer convention: flat items mirror every line, section lines included.
        items: [...estimate.items.filter((item) => !previousItemIds.has(item.id)), ...section.items],
        sections: sections.length > 0 ? sections : undefined,
    }
    const subtotal = getAllItemsFromEstimate(next).reduce((sum, item) => sum + lineTotal(item), 0)
    const taxAmount = roundToCents(subtotal * ((estimate.taxRate || 0) / 100))

    return { ...next, taxAmount, totalAmount: roundToCents(subtotal + taxAmount) }
}

/** Review checklist from AI matches: only a confident match with a photo starts as done ("?" otherwise). */
export function buildReviewItems(itemIds: readonly string[], matches: readonly CompletionMatch[]): JobCompletionItem[] {
    const byId = new Map(matches.map((match) => [match.itemId, match]))
    return itemIds.map((itemId) => {
        const match = byId.get(itemId)
        const photoIndexes = match ? [...match.photoIndexes] : []
        return { itemId, done: match?.confidence === "high" && photoIndexes.length > 0, photoIndexes }
    })
}

export function buildCompletionMessage(portalUrl: string, balanceDue: number, options: { reminder?: boolean } = {}): string {
    const message = balanceDue > 0
        ? `Your job is done. See photos and pay the balance here: ${portalUrl}`
        : `Your job is done. See the photos here: ${portalUrl}`
    // A resend must differ from the first text, or the SMS idempotency key dedupes it.
    return options.reminder ? `Reminder: ${message}` : message
}

/** History card action: resend a stored report, resume a finalized-but-unsent one, or start a new one. */
export function getCompletionAction(estimate: LocalEstimate): "resend" | "resume" | "complete" | null {
    if (estimate.completion) return "resend"
    if (estimate.pendingCompletion) return "resume"
    return canCompleteJob(estimate) ? "complete" : null
}

/** Money typed by hand: blank is 0; anything but plain digits with up to 2 decimals is NaN. */
export function parseMoneyInput(value: string): number {
    const trimmed = value.trim()
    if (!trimmed) return 0
    return /^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(trimmed) ? Number(trimmed) : Number.NaN
}

export function buildCompletionEmailSubject(estimateNumber: string): string {
    return `Job complete – ${estimateNumber}`
}

/** Quote lines the report checks off: everything except work added on site. */
export function getQuoteItemsForCompletion(estimate: LocalEstimate) {
    const addedIds = new Set(
        (estimate.sections ?? []).filter((section) => section.addedOnSite).flatMap((section) => section.items.map((item) => item.id))
    )
    return getAllItemsFromEstimate(estimate).filter((item) => !addedIds.has(item.id))
}

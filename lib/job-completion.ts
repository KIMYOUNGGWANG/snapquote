// Pure helpers for the job completion report. Client code imports this file too, so no server-only imports.

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

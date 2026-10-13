import type { PriceCategory, PriceListItem } from "@/types"
import type { EstimateItem } from "@/lib/estimates-storage"

const PRICE_TBD_MARKER = "(price tbd)"
const LEARNABLE_CATEGORIES: ReadonlySet<string> = new Set<PriceCategory>(["PARTS", "LABOR", "SERVICE"])

export const PRICE_LIST_AI_LIMIT = 100

function lastActivity(item: PriceListItem): string {
    return item.lastUsedAt ?? item.updatedAt ?? ""
}

export function selectPriceListForAI(
    items: readonly PriceListItem[],
    limit = PRICE_LIST_AI_LIMIT,
): PriceListItem[] {
    return [...items]
        .sort((a, b) => b.usageCount - a.usageCount || lastActivity(b).localeCompare(lastActivity(a)))
        .slice(0, limit)
}

export function formatPriceListForAI(items: readonly PriceListItem[]): string {
    return selectPriceListForAI(items)
        .map((item) => `- "${item.name}": $${item.price}/${item.unit} [${item.category}] (keywords: ${item.keywords.join(', ')})`)
        .join('\n')
}

function isPriceCategory(category: string): category is PriceCategory {
    return LEARNABLE_CATEGORIES.has(category)
}

export function normalizePriceKey(description: string): string {
    return description.trim().replace(/\s+/g, " ").toLowerCase()
}

export function getLearnableItems(items: readonly EstimateItem[]): EstimateItem[] {
    return items.filter((item) => {
        const description = typeof item.description === "string" ? item.description.trim() : ""
        return (
            description.length > 0 &&
            typeof item.unit_price === "number" &&
            Number.isFinite(item.unit_price) &&
            item.unit_price > 0 &&
            !item.is_value_add &&
            isPriceCategory(item.category) &&
            !description.toLowerCase().includes(PRICE_TBD_MARKER)
        )
    })
}

export function learnPriceList(
    existing: readonly PriceListItem[],
    sentItems: readonly EstimateItem[],
    now: string,
): PriceListItem[] {
    const existingByKey = new Map<string, PriceListItem>()
    for (const priceItem of existing) {
        existingByKey.set(normalizePriceKey(priceItem.name), priceItem)
    }

    const latestByKey = new Map<string, EstimateItem>()
    for (const sentItem of getLearnableItems(sentItems)) {
        latestByKey.set(normalizePriceKey(sentItem.description), sentItem)
    }

    const changed: PriceListItem[] = []
    for (const [key, sentItem] of latestByKey) {
        if (!isPriceCategory(sentItem.category)) continue
        const match = existingByKey.get(key)

        if (match && match.source !== "learned") {
            changed.push({ ...match, usageCount: match.usageCount + 1, lastUsedAt: now, updatedAt: now })
            continue
        }

        if (match) {
            changed.push({
                ...match,
                price: sentItem.unit_price,
                unit: sentItem.unit,
                category: sentItem.category,
                usageCount: match.usageCount + 1,
                lastUsedAt: now,
                updatedAt: now,
            })
            continue
        }

        changed.push({
            id: crypto.randomUUID(),
            name: sentItem.description.trim(),
            price: sentItem.unit_price,
            unit: sentItem.unit,
            category: sentItem.category,
            keywords: [],
            source: "learned",
            usageCount: 1,
            createdAt: now,
            updatedAt: now,
            lastUsedAt: now,
        })
    }

    return changed
}

function toItemsByKey(items: readonly EstimateItem[]): Map<string, EstimateItem> {
    const itemsByKey = new Map<string, EstimateItem>()
    for (const item of items) {
        if (typeof item.description !== "string") continue
        const key = normalizePriceKey(item.description)
        if (key) itemsByKey.set(key, item)
    }
    return itemsByKey
}

export function countEditedLines(original: readonly EstimateItem[], sent: readonly EstimateItem[]): number {
    const originalByKey = toItemsByKey(original)
    const sentByKey = toItemsByKey(sent)
    let edited = 0

    for (const [key, sentItem] of sentByKey) {
        const before = originalByKey.get(key)
        if (!before || before.unit_price !== sentItem.unit_price || before.quantity !== sentItem.quantity) {
            edited += 1
        }
    }

    for (const key of originalByKey.keys()) {
        if (!sentByKey.has(key)) edited += 1
    }

    return edited
}

export function wasEstimateAlreadySent(estimate: { readonly sentAt?: string | null; readonly status?: string }): boolean {
    return Boolean(estimate.sentAt) || estimate.status === "sent" || estimate.status === "paid"
}

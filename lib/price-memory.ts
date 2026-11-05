import type { PriceCategory, PriceListItem } from "@/types"
import type { EstimateItem } from "@/lib/estimates-storage"
import type { EstimateDraft } from "@/lib/estimates/normalize"

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

const STATED_AMOUNT_TOLERANCE = 0.5

export function withoutPriceTbdMarker(description: string): string {
    return description.replace(/\s*\(price tbd\)/gi, "").trim()
}

// ponytail: reads digits only ("$1,200", "600불", "1.2k"); spelled-out amounts fall to Price TBD for the contractor to fill.
function amountsStatedInNotes(notes: string): number[] {
    const text = notes.replace(/(\d),(?=\d{3}\b)/g, "$1")
    return [...text.matchAll(/(\d+(?:\.\d+)?)\s*(k\b)?/gi)].map((match) => Number(match[1]) * (match[2] ? 1000 : 1))
}

function isAmongAmounts(value: number, amounts: readonly number[]): boolean {
    return amounts.some((amount) => Math.abs(amount - value) <= STATED_AMOUNT_TOLERANCE)
}

function sumTotals(items: readonly EstimateItem[]): number {
    return items.reduce((sum, item) => sum + item.total, 0)
}

/**
 * Keeps only prices that come from the contractor: their price list or a number they said in the notes.
 * Any other price the AI produced is replaced with 0 and "(Price TBD)".
 */
export function enforcePriceListPricing(
    draft: EstimateDraft,
    priceList: readonly PriceListItem[],
    notes: string,
): EstimateDraft {
    if (priceList.length === 0) return draft

    const listedByKey = new Map(priceList.map((priceItem) => [normalizePriceKey(priceItem.name), priceItem]))
    const listedPrices = priceList.map((priceItem) => priceItem.price)
    const statedAmounts = amountsStatedInNotes(notes)
    const findListed = (item: EstimateItem) => listedByKey.get(normalizePriceKey(withoutPriceTbdMarker(item.description)))

    const mainItems = [...draft.items, ...(draft.sections?.flatMap((section) => section.items) ?? [])]
    const unlistedItems = mainItems.filter((item) => !findListed(item))
    // A stated job price ("1200 minimum") may be split across several lines; keep that split.
    const keepsStatedSplit = isAmongAmounts(sumTotals(mainItems), statedAmounts)
        || isAmongAmounts(sumTotals(unlistedItems), statedAmounts)

    const enforce = (item: EstimateItem, allowStatedSplit: boolean): EstimateItem => {
        if (item.unit_price <= 0) return item
        if (isAmongAmounts(item.unit_price, statedAmounts) || isAmongAmounts(item.total, statedAmounts)) return item

        const listed = findListed(item)
        if (listed) {
            return item.unit_price === listed.price
                ? item
                : { ...item, unit_price: listed.price, total: listed.price * item.quantity }
        }
        if (allowStatedSplit || listedPrices.includes(item.unit_price)) return item

        const description = item.description.toLowerCase().includes(PRICE_TBD_MARKER)
            ? item.description
            : `${item.description} (Price TBD)`
        return { ...item, description, unit_price: 0, total: 0 }
    }

    return {
        ...draft,
        items: draft.items.map((item) => enforce(item, keepsStatedSplit)),
        ...(draft.sections
            ? { sections: draft.sections.map((section) => ({ ...section, items: section.items.map((item) => enforce(item, keepsStatedSplit)) })) }
            : {}),
        ...(draft.upsellOptions
            ? { upsellOptions: draft.upsellOptions.map((option) => ({ ...option, addedItems: option.addedItems.map((item) => enforce(item, false)) })) }
            : {}),
    }
}

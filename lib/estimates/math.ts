import type { EstimateItem } from "@/lib/estimates-storage"
import { normalizeEstimateItem, toSafeNumber, type EstimateDraft } from "@/lib/estimates/normalize"

export function lineTotal(item: EstimateItem | null | undefined): number {
    if (!item) return 0
    const quantity = toSafeNumber(item.quantity, 0)
    const unitPrice = toSafeNumber(item.unit_price, 0)
    return toSafeNumber(item.total, quantity * unitPrice)
}

export function getAllItemsFromEstimate(estimate: EstimateDraft): EstimateItem[] {
    const flatItems = Array.isArray(estimate.items) ? estimate.items : []
    const sectionItems = Array.isArray(estimate.sections)
        ? estimate.sections.flatMap((section) => (Array.isArray(section?.items) ? section.items : []))
        : []
    const sectionItemIds = new Set(
        sectionItems
            .map((item) => (typeof item?.id === "string" ? item.id.trim() : ""))
            .filter(Boolean)
    )
    const dedupedFlatItems = sectionItemIds.size > 0
        ? flatItems.filter((item) => {
            const itemId = typeof item?.id === "string" ? item.id.trim() : ""
            return !itemId || !sectionItemIds.has(itemId)
        })
        : flatItems

    return [...dedupedFlatItems, ...sectionItems].map((item, index) => normalizeEstimateItem(item, index))
}

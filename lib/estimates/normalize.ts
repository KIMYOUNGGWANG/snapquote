import type {
    EstimateCategory,
    EstimateItem,
    EstimateSection,
    EstimateUnit,
    PhotoEstimateAnalysis,
    PhotoEstimateMaterialSuggestion,
    PricingConfidence,
    UpsellOption,
} from "@/lib/estimates-storage"

export interface EstimateDraft {
    items: EstimateItem[]
    sections?: EstimateSection[]
    summary_note: string
    clientSignature?: string
    signedAt?: string
    status?: "draft" | "sent" | "paid"
    warnings?: string[]
    payment_terms?: string
    closing_note?: string
    upsellOptions?: UpsellOption[]
    photoAnalysis?: PhotoEstimateAnalysis
}

export const ESTIMATE_CATEGORIES: EstimateCategory[] = ["PARTS", "LABOR", "SERVICE", "OTHER"]
export const ESTIMATE_UNITS: EstimateUnit[] = ["ea", "LS", "hr", "day", "SF", "LF", "%", "other"]

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object"
}

export function toSafeNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return fallback
}

function toSafeString(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback
}

export function normalizeCategory(value: unknown): EstimateCategory {
    if (typeof value !== "string") return "PARTS"
    const normalized = value.trim().toUpperCase()
    return ESTIMATE_CATEGORIES.includes(normalized as EstimateCategory)
        ? (normalized as EstimateCategory)
        : "PARTS"
}

export function normalizeUnit(value: unknown): EstimateUnit {
    if (typeof value !== "string") return "ea"
    const normalized = value.trim()
    return ESTIMATE_UNITS.includes(normalized as EstimateUnit)
        ? (normalized as EstimateUnit)
        : "ea"
}

export function normalizeEstimateItem(input: unknown, index: number): EstimateItem {
    const item = isRecord(input) ? input : {}
    const quantity = Math.max(0, toSafeNumber(item.quantity, 1))
    const unitPrice = Math.max(0, toSafeNumber(item.unit_price, 0))
    const total = toSafeNumber(item.total, quantity * unitPrice)
    const id = toSafeString(item.id).trim()
    const description = toSafeString(item.description).trim()

    return {
        id: id || `item-${index + 1}`,
        itemNumber: Math.max(1, Math.floor(toSafeNumber(item.itemNumber, index + 1))),
        category: normalizeCategory(item.category),
        description,
        quantity,
        unit: normalizeUnit(item.unit),
        unit_price: unitPrice,
        total,
        is_value_add: typeof item.is_value_add === "boolean" ? item.is_value_add : undefined,
        notes: typeof item.notes === "string" ? item.notes : undefined,
    }
}

export function normalizeEstimateSection(input: unknown, sectionIndex: number): EstimateSection {
    const section = isRecord(input) ? input : {}
    const rawItems = Array.isArray(section.items) ? section.items : []
    const items = rawItems
        .map((item, itemIndex) => normalizeEstimateItem(item, itemIndex))
        .filter((item) => item.description !== "")
    const id = toSafeString(section.id).trim()
    const name = toSafeString(section.name).trim()
    const divisionCode = toSafeString(section.divisionCode).trim()

    return {
        id: id || `section-${sectionIndex + 1}`,
        name: name || `Section ${sectionIndex + 1}`,
        divisionCode: divisionCode || undefined,
        items,
    }
}

function normalizeUpsellTier(value: unknown, fallback: "better" | "best"): "better" | "best" {
    if (typeof value !== "string") return fallback
    const normalized = value.trim().toLowerCase()
    if (normalized === "better" || normalized === "best") return normalized
    return fallback
}

function normalizeUpsellOption(input: unknown, optionIndex: number): UpsellOption | null {
    const option = isRecord(input) ? input : {}
    const fallbackTier = optionIndex === 0 ? "better" : "best"
    const tier = normalizeUpsellTier(option.tier, fallbackTier)
    const addedItems = (Array.isArray(option.addedItems) ? option.addedItems : [])
        .map((item, itemIndex) => normalizeEstimateItem(item, itemIndex))
        .filter((item) => item.description !== "")

    if (addedItems.length === 0) return null

    return {
        tier,
        title: toSafeString(option.title).trim() || (tier === "better" ? "Better Option" : "Best Option"),
        description: toSafeString(option.description).trim(),
        addedItems,
    }
}

export function normalizeUpsellOptions(input: unknown): UpsellOption[] {
    if (!Array.isArray(input)) return []
    return input
        .map((option, optionIndex) => normalizeUpsellOption(option, optionIndex))
        .filter((option): option is UpsellOption => option !== null)
}

export function normalizePricingConfidence(value: unknown): PricingConfidence {
    if (typeof value !== "string") return "medium"
    const normalized = value.trim().toLowerCase()
    if (normalized === "low" || normalized === "medium" || normalized === "high") {
        return normalized
    }
    return "medium"
}

function normalizeStringList(input: unknown, maxItems: number, maxLength: number): string[] {
    if (!Array.isArray(input)) return []

    return input
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().slice(0, maxLength))
        .filter(Boolean)
        .slice(0, maxItems)
}

export function normalizePhotoEstimateAnalysis(input: unknown): PhotoEstimateAnalysis | undefined {
    const analysis = isRecord(input) ? input : null
    if (!analysis) return undefined

    const observations = normalizeStringList(analysis.observations, 6, 180)
    const suggestedScope = normalizeStringList(analysis.suggestedScope, 6, 180)
    const materialSuggestions = (Array.isArray(analysis.materialSuggestions) ? analysis.materialSuggestions : [])
        .map((suggestion) => {
            const suggestionRecord = isRecord(suggestion) ? suggestion : null
            const label = toSafeString(suggestionRecord?.label).trim()
            if (!label) return null

            return {
                label,
                quantity: Math.max(0, toSafeNumber(suggestionRecord?.quantity, 1)),
                unit: toSafeString(suggestionRecord?.unit, "ea").trim() || "ea",
                reason:
                    toSafeString(
                        suggestionRecord?.reason,
                        "Visible condition from the jobsite photo."
                    ).trim() || "Visible condition from the jobsite photo.",
            }
        })
        .filter((suggestion): suggestion is PhotoEstimateMaterialSuggestion => suggestion !== null)
        .slice(0, 8)

    if (observations.length === 0 && suggestedScope.length === 0 && materialSuggestions.length === 0) {
        return undefined
    }

    return {
        observations,
        suggestedScope,
        materialSuggestions,
        pricingConfidence: normalizePricingConfidence(analysis.pricingConfidence),
    }
}

export function normalizeEstimatePayload(input: unknown): EstimateDraft {
    const estimate = isRecord(input) ? input : {}
    const rawItems = Array.isArray(estimate.items) ? estimate.items : []
    const rawSections = Array.isArray(estimate.sections) ? estimate.sections : []
    const rawWarnings = Array.isArray(estimate.warnings) ? estimate.warnings : []
    const rawUpsellOptions = Array.isArray(estimate.upsellOptions) ? estimate.upsellOptions : []

    const items = rawItems
        .map((item, index) => normalizeEstimateItem(item, index))
        .filter((item) => item.description !== "")

    const sections = rawSections
        .map((section, sectionIndex) => normalizeEstimateSection(section, sectionIndex))
        .filter((section) => section.items.length > 0)

    const warnings = rawWarnings
        .filter((warning): warning is string => typeof warning === "string")
        .map((warning) => warning.trim())
        .filter(Boolean)
    const upsellOptions = normalizeUpsellOptions(rawUpsellOptions)
    const photoAnalysis = normalizePhotoEstimateAnalysis(estimate.photoAnalysis)

    return {
        items,
        ...(sections.length > 0 ? { sections } : {}),
        summary_note: toSafeString(estimate.summary_note),
        payment_terms: toSafeString(estimate.payment_terms),
        closing_note: toSafeString(estimate.closing_note),
        warnings,
        ...(upsellOptions.length > 0 ? { upsellOptions } : {}),
        ...(photoAnalysis ? { photoAnalysis } : {}),
    }
}

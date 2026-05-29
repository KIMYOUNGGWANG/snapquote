import type {
    EstimateAttachments,
    EstimateCategory,
    EstimateItem,
    EstimateSection,
    EstimateUnit,
    LocalEstimate,
} from "./estimates-storage"

type CloudEstimateItemRow = {
    id?: unknown
    local_id?: unknown
    item_number?: unknown
    category?: unknown
    unit?: unknown
    description?: unknown
    quantity?: unknown
    unit_price?: unknown
    total?: unknown
}

type CloudEstimateSectionRow = {
    id?: unknown
    local_id?: unknown
    division_code?: unknown
    name?: unknown
    sort_order?: unknown
    estimate_section_items?: unknown
}

type CloudEstimateAttachmentRow = {
    photos?: unknown
    audio_url?: unknown
    original_transcript?: unknown
}

export type CloudEstimateRow = {
    id?: unknown
    estimate_number?: unknown
    clients?: {
        name?: unknown
        address?: unknown
        email?: unknown
        phone?: unknown
        notes?: unknown
    } | null
    tax_rate?: unknown
    tax_amount?: unknown
    total_amount?: unknown
    ai_summary?: unknown
    created_at?: unknown
    updated_at?: unknown
    sent_at?: unknown
    status?: unknown
    estimate_items?: unknown
    estimate_sections?: unknown
    estimate_attachments?: unknown
}

export type SupabaseMutationResult = {
    error?: {
        message?: string
    } | null
}

export type CloudEstimateItemInsertRow = {
    estimate_id: string
    local_id: string
    item_number: number
    category: EstimateCategory
    unit: EstimateUnit
    description: string
    quantity: number
    unit_price: number
    total: number
    updated_at?: string
}

function toSafeString(value: unknown): string {
    return typeof value === "string" ? value : ""
}

function toSafeNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return 0
}

function toEstimateCategory(value: unknown): EstimateCategory {
    return value === "LABOR" || value === "SERVICE" || value === "OTHER" ? value : "PARTS"
}

function toEstimateUnit(value: unknown): EstimateUnit {
    if (
        value === "ea" ||
        value === "LS" ||
        value === "hr" ||
        value === "day" ||
        value === "SF" ||
        value === "LF" ||
        value === "%" ||
        value === "other"
    ) {
        return value
    }

    return "ea"
}

function normalizeCloudEstimateItem(input: CloudEstimateItemRow, index: number): EstimateItem {
    return {
        id: toSafeString(input.local_id).trim() || toSafeString(input.id).trim() || `item-${index + 1}`,
        itemNumber: Math.max(1, Math.floor(toSafeNumber(input.item_number) || index + 1)),
        category: toEstimateCategory(input.category),
        description: toSafeString(input.description).trim(),
        quantity: toSafeNumber(input.quantity),
        unit: toEstimateUnit(input.unit),
        unit_price: toSafeNumber(input.unit_price),
        total: toSafeNumber(input.total),
    }
}

export function mapLocalEstimateItemToCloudRow(
    estimateId: string,
    item: EstimateItem,
    options: { updatedAt?: string } = {}
): CloudEstimateItemInsertRow {
    return {
        estimate_id: estimateId,
        local_id: item.id,
        item_number: item.itemNumber ?? 0,
        category: item.category,
        unit: item.unit,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
        ...(options.updatedAt ? { updated_at: options.updatedAt } : {}),
    }
}

function extractAttachmentRow(value: unknown): CloudEstimateAttachmentRow | null {
    if (Array.isArray(value)) {
        const first = value.find((entry) => entry && typeof entry === "object")
        return first ? first as CloudEstimateAttachmentRow : null
    }

    return value && typeof value === "object" ? value as CloudEstimateAttachmentRow : null
}

function normalizeCloudAttachments(value: unknown): EstimateAttachments | undefined {
    const attachmentRow = extractAttachmentRow(value)
    if (!attachmentRow) return undefined

    const photos = Array.isArray(attachmentRow.photos)
        ? attachmentRow.photos.filter((photo): photo is string => typeof photo === "string" && photo.trim() !== "")
        : []
    const audioUrl = toSafeString(attachmentRow.audio_url).trim()
    const originalTranscript = toSafeString(attachmentRow.original_transcript).trim()

    if (photos.length === 0 && !audioUrl && !originalTranscript) return undefined

    return {
        photos,
        ...(audioUrl ? { audioUrl } : {}),
        ...(originalTranscript ? { originalTranscript } : {}),
    }
}

function normalizeCloudSections(value: unknown): EstimateSection[] | undefined {
    if (!Array.isArray(value)) return undefined

    const sections = value
        .filter((section): section is CloudEstimateSectionRow => section !== null && typeof section === "object")
        .sort((left, right) => toSafeNumber(left.sort_order) - toSafeNumber(right.sort_order))
        .map((section, sectionIndex) => {
            const rawItems = Array.isArray(section.estimate_section_items) ? section.estimate_section_items : []
            return {
                id: toSafeString(section.local_id).trim() || toSafeString(section.id).trim() || `section-${sectionIndex + 1}`,
                divisionCode: toSafeString(section.division_code).trim() || undefined,
                name: toSafeString(section.name).trim() || `Section ${sectionIndex + 1}`,
                items: rawItems
                    .filter((item): item is CloudEstimateItemRow => item !== null && typeof item === "object")
                    .map((item, itemIndex) => normalizeCloudEstimateItem(item, itemIndex))
                    .filter((item) => item.description !== ""),
            }
        })
        .filter((section) => section.items.length > 0)

    return sections.length > 0 ? sections : undefined
}

export function mapCloudEstimateToLocal(cloudEstimate: CloudEstimateRow): LocalEstimate {
    const items = Array.isArray(cloudEstimate.estimate_items)
        ? cloudEstimate.estimate_items
            .filter((item): item is CloudEstimateItemRow => item !== null && typeof item === "object")
            .map((item, index) => normalizeCloudEstimateItem(item, index))
            .filter((item) => item.description !== "")
        : []

    return {
        id: toSafeString(cloudEstimate.id).trim(),
        estimateNumber: toSafeString(cloudEstimate.estimate_number).trim() || "EST-000",
        clientName: toSafeString(cloudEstimate.clients?.name).trim() || "Walk-in Client",
        clientAddress: toSafeString(cloudEstimate.clients?.address).trim(),
        clientEmail: toSafeString(cloudEstimate.clients?.email).trim() || undefined,
        clientPhone: toSafeString(cloudEstimate.clients?.phone).trim() || undefined,
        clientNotes: toSafeString(cloudEstimate.clients?.notes).trim() || undefined,
        taxRate: toSafeNumber(cloudEstimate.tax_rate) || 13,
        taxAmount: toSafeNumber(cloudEstimate.tax_amount),
        totalAmount: toSafeNumber(cloudEstimate.total_amount),
        summary_note: toSafeString(cloudEstimate.ai_summary),
        createdAt: toSafeString(cloudEstimate.created_at),
        updatedAt: toSafeString(cloudEstimate.updated_at) || toSafeString(cloudEstimate.created_at),
        sentAt: toSafeString(cloudEstimate.sent_at) || undefined,
        synced: true,
        status: cloudEstimate.status === "sent" || cloudEstimate.status === "paid" ? cloudEstimate.status : "draft",
        items,
        sections: normalizeCloudSections(cloudEstimate.estimate_sections),
        attachments: normalizeCloudAttachments(cloudEstimate.estimate_attachments),
    }
}

export function assertSupabaseMutation(
    result: SupabaseMutationResult,
    fallbackMessage: string,
): void {
    if (result.error) {
        throw new Error(result.error.message || fallbackMessage)
    }
}

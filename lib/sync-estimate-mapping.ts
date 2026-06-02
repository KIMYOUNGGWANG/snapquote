import type {
    EstimateAttachments,
    EstimateCategory,
    EstimateItem,
    EstimateSection,
    EstimateUnit,
    LocalEstimate,
} from "./estimates-storage"
import { isEstimatePaidLike } from "@/lib/estimate-payment-state"

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
    scope_assumptions_confirmed_at?: unknown
}

export type CloudQuickBooksInvoiceLinkRow = {
    estimate_id?: unknown
    quickbooks_invoice_id?: unknown
    quickbooks_customer_id?: unknown
    quickbooks_invoice_doc_number?: unknown
    quickbooks_invoice_status?: unknown
    synced_at?: unknown
}

export type CloudCustomerPortalLinkRow = {
    estimate_id?: unknown
    share_url?: unknown
    status?: unknown
    viewed_at?: unknown
    approved_at?: unknown
    change_requested_at?: unknown
    customer_name?: unknown
    customer_email?: unknown
    customer_note?: unknown
    created_at?: unknown
    updated_at?: unknown
}

export type CloudEstimateRow = {
    id?: unknown
    estimate_number?: unknown
    payment_link?: unknown
    payment_link_id?: unknown
    payment_link_type?: unknown
    payment_completed_at?: unknown
    last_payment_session_id?: unknown
    revision_of_estimate_id?: unknown
    revision_of_estimate_number?: unknown
    revision_requested_at?: unknown
    superseded_by_estimate_id?: unknown
    superseded_at?: unknown
    first_followed_up_at?: unknown
    last_followed_up_at?: unknown
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

export type CloudEstimateSectionItemInsertRow = CloudEstimateItemInsertRow & {
    section_id: string
}

export type CloudEstimateAttachmentUpsertRow = {
    estimate_id: string
    photos: string[]
    audio_url: string | null
    original_transcript: string | null
    scope_assumptions_confirmed_at: string | null
    updated_at?: string
}

export type QuickBooksEstimatePatch = Pick<
    LocalEstimate,
    "quickbooksInvoiceId" | "quickbooksCustomerId" | "quickbooksDocNumber" | "quickbooksInvoiceStatus" | "quickbooksSyncedAt"
>

export type CustomerPortalEstimatePatch = Pick<
    LocalEstimate,
    | "customerPortalUrl"
    | "customerPortalStatus"
    | "customerViewedAt"
    | "customerApprovedAt"
    | "customerChangeRequestedAt"
    | "customerPortalName"
    | "customerPortalEmail"
    | "customerPortalNote"
>

export type CloudEstimateUpsertRow = {
    id: string
    user_id: string
    client_id: string | null
    estimate_number: string
    total_amount: number
    tax_rate: number
    tax_amount: number
    ai_summary: string
    created_at: string
    updated_at: string
    sent_at: string | null
    status: "draft" | "sent" | "paid"
    payment_link: string | null
    payment_link_id: string | null
    payment_link_type: "full" | "deposit" | "custom" | null
    payment_completed_at: string | null
    last_payment_session_id: string | null
    revision_of_estimate_id: string | null
    revision_of_estimate_number: string | null
    revision_requested_at: string | null
    superseded_by_estimate_id: string | null
    superseded_at: string | null
    first_followed_up_at: string | null
    last_followed_up_at: string | null
}

function toSafeString(value: unknown): string {
    return typeof value === "string" ? value : ""
}

function toTimestampMs(value: unknown): number {
    const date = new Date(toSafeString(value))

    return Number.isNaN(date.getTime()) ? Number.NEGATIVE_INFINITY : date.getTime()
}

function getCustomerPortalLinkActivityTime(link: CloudCustomerPortalLinkRow): number {
    return Math.max(
        toTimestampMs(link.updated_at),
        toTimestampMs(link.approved_at),
        toTimestampMs(link.change_requested_at),
        toTimestampMs(link.viewed_at),
        toTimestampMs(link.created_at),
    )
}

export function selectLatestCloudCustomerPortalLink(
    current: CloudCustomerPortalLinkRow | undefined,
    candidate: CloudCustomerPortalLinkRow
): CloudCustomerPortalLinkRow {
    if (!current) return candidate

    const currentTime = getCustomerPortalLinkActivityTime(current)
    const candidateTime = getCustomerPortalLinkActivityTime(candidate)

    if (candidateTime > currentTime) return candidate
    if (candidateTime < currentTime) return current

    const currentUrl = toSafeString(current.share_url).trim()
    const candidateUrl = toSafeString(candidate.share_url).trim()
    if (candidateUrl && !currentUrl) return candidate

    return current
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

function toPaymentLinkType(value: unknown): LocalEstimate["paymentLinkType"] | undefined {
    if (value === "full" || value === "deposit" || value === "custom") return value
    return undefined
}

function toQuickBooksInvoiceStatus(value: unknown): LocalEstimate["quickbooksInvoiceStatus"] {
    if (value === "open" || value === "paid" || value === "unknown") return value
    return "unknown"
}

function toCustomerPortalStatus(value: unknown): LocalEstimate["customerPortalStatus"] | undefined {
    if (value === "shared" || value === "viewed" || value === "approved" || value === "change_requested") {
        return value
    }

    return undefined
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

export function mapLocalEstimateSectionItemToCloudRow(
    estimateId: string,
    sectionId: string,
    item: EstimateItem,
    options: { updatedAt?: string } = {}
): CloudEstimateSectionItemInsertRow {
    return {
        ...mapLocalEstimateItemToCloudRow(estimateId, item, options),
        section_id: sectionId,
    }
}

export function mapLocalEstimateAttachmentsToCloudRow(
    estimateId: string,
    attachments: EstimateAttachments | undefined,
    options: { updatedAt?: string } = {}
): CloudEstimateAttachmentUpsertRow | null {
    const photos = attachments?.photos?.filter((photo) => typeof photo === "string" && photo.trim() !== "") || []
    const audioUrl = attachments?.audioUrl?.trim() || null
    const originalTranscript = attachments?.originalTranscript?.trim() || null
    const scopeAssumptionsConfirmedAt = attachments?.scopeAssumptionsConfirmedAt?.trim() || null
    const hasAttachmentState =
        photos.length > 0 ||
        Boolean(audioUrl) ||
        Boolean(originalTranscript) ||
        Boolean(scopeAssumptionsConfirmedAt)

    if (!hasAttachmentState) return null

    return {
        estimate_id: estimateId,
        photos,
        audio_url: audioUrl,
        original_transcript: originalTranscript,
        scope_assumptions_confirmed_at: scopeAssumptionsConfirmedAt,
        ...(options.updatedAt ? { updated_at: options.updatedAt } : {}),
    }
}

export function mapLocalEstimateToCloudRow(
    userId: string,
    clientId: string | null,
    estimate: LocalEstimate,
    options: { now?: string } = {}
): CloudEstimateUpsertRow {
    const now = options.now || new Date().toISOString()
    const status = isEstimatePaidLike(estimate)
        ? "paid"
        : estimate.status === "sent"
            ? "sent"
            : "draft"
    const revisionOfEstimateId = estimate.revisionOfEstimateId?.trim() || null
    const revisionOfEstimateNumber = estimate.revisionOfEstimateNumber?.trim() || null
    const revisionRequestedAt = estimate.revisionRequestedAt?.trim() || null
    const supersededByEstimateId = estimate.supersededByEstimateId?.trim() || null
    const supersededAt = estimate.supersededAt?.trim() || null
    const firstFollowedUpAt = estimate.firstFollowedUpAt?.trim() || null
    const lastFollowedUpAt = estimate.lastFollowedUpAt?.trim() || null
    const paymentLink = estimate.paymentLink?.trim() || null
    const paymentLinkId = estimate.paymentLinkId?.trim() || null
    const paymentLinkType = paymentLink ? estimate.paymentLinkType ?? null : null
    const paymentCompletedAt = estimate.paymentCompletedAt?.trim() || null
    const lastPaymentSessionId = estimate.lastPaymentSessionId?.trim() || null

    return {
        id: estimate.id,
        user_id: userId,
        client_id: clientId,
        estimate_number: estimate.estimateNumber,
        total_amount: estimate.totalAmount,
        tax_rate: estimate.taxRate,
        tax_amount: estimate.taxAmount,
        ai_summary: estimate.summary_note,
        created_at: estimate.createdAt,
        updated_at: estimate.updatedAt || estimate.createdAt || now,
        sent_at: (status === "sent" || status === "paid")
            ? (estimate.sentAt || estimate.createdAt)
            : null,
        status,
        payment_link: paymentLink,
        payment_link_id: paymentLinkId,
        payment_link_type: paymentLinkType,
        payment_completed_at: paymentCompletedAt,
        last_payment_session_id: lastPaymentSessionId,
        revision_of_estimate_id: revisionOfEstimateId,
        revision_of_estimate_number: revisionOfEstimateNumber,
        revision_requested_at: revisionRequestedAt,
        superseded_by_estimate_id: supersededByEstimateId,
        superseded_at: supersededAt,
        first_followed_up_at: firstFollowedUpAt,
        last_followed_up_at: lastFollowedUpAt,
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
    const scopeAssumptionsConfirmedAt = toSafeString(attachmentRow.scope_assumptions_confirmed_at).trim()

    if (photos.length === 0 && !audioUrl && !originalTranscript && !scopeAssumptionsConfirmedAt) return undefined

    return {
        photos,
        ...(audioUrl ? { audioUrl } : {}),
        ...(originalTranscript ? { originalTranscript } : {}),
        ...(scopeAssumptionsConfirmedAt ? { scopeAssumptionsConfirmedAt } : {}),
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
    const paymentCompletedAt = toSafeString(cloudEstimate.payment_completed_at).trim() || undefined
    const status = isEstimatePaidLike({ status: cloudEstimate.status, paymentCompletedAt })
        ? "paid"
        : cloudEstimate.status === "sent"
            ? "sent"
            : "draft"

    return {
        id: toSafeString(cloudEstimate.id).trim(),
        estimateNumber: toSafeString(cloudEstimate.estimate_number).trim() || "EST-000",
        paymentLink: toSafeString(cloudEstimate.payment_link).trim() || undefined,
        paymentLinkId: toSafeString(cloudEstimate.payment_link_id).trim() || undefined,
        paymentLinkType: toPaymentLinkType(cloudEstimate.payment_link_type),
        paymentCompletedAt,
        lastPaymentSessionId: toSafeString(cloudEstimate.last_payment_session_id).trim() || undefined,
        revisionOfEstimateId: toSafeString(cloudEstimate.revision_of_estimate_id).trim() || undefined,
        revisionOfEstimateNumber: toSafeString(cloudEstimate.revision_of_estimate_number).trim() || undefined,
        revisionRequestedAt: toSafeString(cloudEstimate.revision_requested_at).trim() || undefined,
        supersededByEstimateId: toSafeString(cloudEstimate.superseded_by_estimate_id).trim() || undefined,
        supersededAt: toSafeString(cloudEstimate.superseded_at).trim() || undefined,
        firstFollowedUpAt: toSafeString(cloudEstimate.first_followed_up_at).trim() || undefined,
        lastFollowedUpAt: toSafeString(cloudEstimate.last_followed_up_at).trim() || undefined,
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
        status,
        items,
        sections: normalizeCloudSections(cloudEstimate.estimate_sections),
        attachments: normalizeCloudAttachments(cloudEstimate.estimate_attachments),
    }
}

export function mapCloudQuickBooksLinkToLocalPatch(
    quickBooksLink: CloudQuickBooksInvoiceLinkRow | undefined
): QuickBooksEstimatePatch | null {
    if (!quickBooksLink) return null

    const quickbooksInvoiceId = toSafeString(quickBooksLink.quickbooks_invoice_id).trim()
    if (!quickbooksInvoiceId) return null

    const quickbooksCustomerId = toSafeString(quickBooksLink.quickbooks_customer_id).trim()
    const quickbooksDocNumber = toSafeString(quickBooksLink.quickbooks_invoice_doc_number).trim()
    const quickbooksSyncedAt = toSafeString(quickBooksLink.synced_at).trim()

    return {
        quickbooksInvoiceId,
        quickbooksInvoiceStatus: toQuickBooksInvoiceStatus(quickBooksLink.quickbooks_invoice_status),
        ...(quickbooksCustomerId ? { quickbooksCustomerId } : {}),
        ...(quickbooksDocNumber ? { quickbooksDocNumber } : {}),
        ...(quickbooksSyncedAt ? { quickbooksSyncedAt } : {}),
    }
}

export function hasQuickBooksEstimatePatchChanged(
    estimate: LocalEstimate,
    patch: QuickBooksEstimatePatch | null
): patch is QuickBooksEstimatePatch {
    if (!patch) return false

    return estimate.quickbooksInvoiceId !== patch.quickbooksInvoiceId ||
        ("quickbooksCustomerId" in patch && estimate.quickbooksCustomerId !== patch.quickbooksCustomerId) ||
        ("quickbooksDocNumber" in patch && estimate.quickbooksDocNumber !== patch.quickbooksDocNumber) ||
        estimate.quickbooksInvoiceStatus !== patch.quickbooksInvoiceStatus ||
        ("quickbooksSyncedAt" in patch && estimate.quickbooksSyncedAt !== patch.quickbooksSyncedAt)
}

export function applyCloudQuickBooksLinkToLocalEstimate(
    estimate: LocalEstimate,
    quickBooksLink: CloudQuickBooksInvoiceLinkRow | undefined
): LocalEstimate {
    const patch = mapCloudQuickBooksLinkToLocalPatch(quickBooksLink)
    if (!hasQuickBooksEstimatePatchChanged(estimate, patch)) return estimate

    return {
        ...estimate,
        ...patch,
    }
}

export function mapCloudCustomerPortalLinkToLocalPatch(
    customerPortalLink: CloudCustomerPortalLinkRow | undefined
): CustomerPortalEstimatePatch | null {
    if (!customerPortalLink) return null

    const customerPortalStatus = toCustomerPortalStatus(customerPortalLink.status)
    const customerPortalUrl = toSafeString(customerPortalLink.share_url).trim()
    if (!customerPortalStatus && !customerPortalUrl) return null

    const customerViewedAt = toSafeString(customerPortalLink.viewed_at).trim()
    const customerApprovedAt = toSafeString(customerPortalLink.approved_at).trim()
    const customerChangeRequestedAt = toSafeString(customerPortalLink.change_requested_at).trim()
    const customerPortalName = toSafeString(customerPortalLink.customer_name).trim()
    const customerPortalEmail = toSafeString(customerPortalLink.customer_email).trim()
    const customerPortalNote = toSafeString(customerPortalLink.customer_note).trim()

    return {
        ...(customerPortalUrl ? { customerPortalUrl } : {}),
        ...(customerPortalStatus ? { customerPortalStatus } : {}),
        customerViewedAt: customerViewedAt || undefined,
        customerApprovedAt: customerApprovedAt || undefined,
        customerChangeRequestedAt: customerChangeRequestedAt || undefined,
        customerPortalName: customerPortalName || undefined,
        customerPortalEmail: customerPortalEmail || undefined,
        customerPortalNote: customerPortalNote || undefined,
    }
}

export function hasCustomerPortalEstimatePatchChanged(
    estimate: LocalEstimate,
    patch: CustomerPortalEstimatePatch | null
): patch is CustomerPortalEstimatePatch {
    if (!patch) return false

    return (
        (typeof patch.customerPortalUrl === "string" && estimate.customerPortalUrl !== patch.customerPortalUrl) ||
        ("customerPortalStatus" in patch && estimate.customerPortalStatus !== patch.customerPortalStatus) ||
        ("customerViewedAt" in patch && estimate.customerViewedAt !== patch.customerViewedAt) ||
        ("customerApprovedAt" in patch && estimate.customerApprovedAt !== patch.customerApprovedAt) ||
        ("customerChangeRequestedAt" in patch && estimate.customerChangeRequestedAt !== patch.customerChangeRequestedAt) ||
        ("customerPortalName" in patch && estimate.customerPortalName !== patch.customerPortalName) ||
        ("customerPortalEmail" in patch && estimate.customerPortalEmail !== patch.customerPortalEmail) ||
        ("customerPortalNote" in patch && estimate.customerPortalNote !== patch.customerPortalNote)
    )
}

export function applyCloudCustomerPortalLinkToLocalEstimate(
    estimate: LocalEstimate,
    customerPortalLink: CloudCustomerPortalLinkRow | undefined
): LocalEstimate {
    const patch = mapCloudCustomerPortalLinkToLocalPatch(customerPortalLink)
    if (!hasCustomerPortalEstimatePatchChanged(estimate, patch)) return estimate

    return {
        ...estimate,
        ...patch,
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

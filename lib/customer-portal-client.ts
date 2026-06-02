import type { z } from "zod"
import { customerQuoteSnapshotSchema } from "@/lib/validation/api-schemas"
import { withAuthHeaders } from "@/lib/auth-headers"
import { isEstimatePaidLike } from "@/lib/estimate-payment-state"
import type { LocalEstimate } from "@/lib/estimates-storage"
import { getAllItemsFromEstimate, lineTotal } from "@/lib/estimates/math"

export type CustomerQuoteSnapshotInput = z.infer<typeof customerQuoteSnapshotSchema>

export type CustomerPortalLinkResponse = {
    ok: true
    shareUrl?: string
    portal: {
        status: "shared" | "viewed" | "approved" | "change_requested"
        viewedAt?: string
        approvedAt?: string
        changeRequestedAt?: string
        customerName?: string
        customerEmail?: string
        customerNote?: string
    }
    estimate?: {
        paymentStatus?: "paid"
        paymentCompletedAt?: string
    }
}

export type CustomerPortalLinkOptions = {
    resetCustomerDecision?: boolean
    paymentLinkOverride?: string
    paymentLinkTypeOverride?: "full" | "deposit" | "custom"
}

function asOptionalHttpUrl(value: string | undefined): string | undefined {
    if (!value) return undefined
    try {
        const parsed = new URL(value)
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined
        return parsed.toString()
    } catch {
        return undefined
    }
}

export function buildCustomerQuoteSnapshot(
    estimate: LocalEstimate,
    options: Pick<CustomerPortalLinkOptions, "paymentLinkOverride" | "paymentLinkTypeOverride"> = {}
): CustomerQuoteSnapshotInput {
    const items = getAllItemsFromEstimate(estimate).map((item, index) => ({
        id: item.id,
        itemNumber: item.itemNumber || index + 1,
        category: item.category,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total: lineTotal(item),
    }))
    const estimatePaymentLink = asOptionalHttpUrl(estimate.paymentLink)
    const fallbackPaymentLink = asOptionalHttpUrl(options.paymentLinkOverride)
    const resolvedPaymentLink = estimatePaymentLink || fallbackPaymentLink
    const resolvedPaymentLinkType = estimatePaymentLink
        ? estimate.paymentLinkType
        : options.paymentLinkTypeOverride

    return {
        estimateNumber: estimate.estimateNumber,
        clientName: estimate.clientName || undefined,
        clientEmail: estimate.clientEmail || undefined,
        clientPhone: estimate.clientPhone || undefined,
        clientAddress: estimate.clientAddress || undefined,
        summaryNote: estimate.summary_note || undefined,
        paymentTerms: estimate.payment_terms || undefined,
        closingNote: estimate.closing_note || undefined,
        taxRate: estimate.taxRate || 0,
        taxAmount: estimate.taxAmount || 0,
        totalAmount: estimate.totalAmount || 0,
        currency: "CAD",
        paymentLink: resolvedPaymentLink,
        paymentLinkType: resolvedPaymentLink ? (resolvedPaymentLinkType || "custom") : undefined,
        paymentStatus: isEstimatePaidLike(estimate) ? "paid" : undefined,
        paymentCompletedAt: estimate.paymentCompletedAt || undefined,
        items,
        sections: estimate.sections?.map((section) => ({
            id: section.id,
            name: section.name,
            divisionCode: section.divisionCode,
            items: section.items.map((item, index) => ({
                id: item.id,
                itemNumber: item.itemNumber || index + 1,
                category: item.category,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                unit_price: item.unit_price,
                total: lineTotal(item),
            })),
        })),
        createdAt: estimate.createdAt,
        sentAt: estimate.sentAt,
    }
}

export async function createCustomerPortalLinkForEstimate(
    estimate: LocalEstimate,
    options: CustomerPortalLinkOptions = {}
): Promise<CustomerPortalLinkResponse> {
    const headers = await withAuthHeaders({ "content-type": "application/json" })
    return postCustomerPortalLinkForEstimate(estimate, headers, options)
}

async function postCustomerPortalLinkForEstimate(
    estimate: LocalEstimate,
    headers: Record<string, string>,
    options: CustomerPortalLinkOptions
): Promise<CustomerPortalLinkResponse> {
    const response = await fetch(`/api/estimates/${encodeURIComponent(estimate.id)}/share-link`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            estimate: buildCustomerQuoteSnapshot(estimate, options),
            resetCustomerDecision: options.resetCustomerDecision || undefined,
        }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
        const message = typeof data?.error?.message === "string"
            ? data.error.message
            : "Failed to create customer quote link."
        throw new Error(message)
    }

    if (data?.ok !== true || typeof data.shareUrl !== "string") {
        throw new Error("Customer quote link response was incomplete.")
    }

    return data as CustomerPortalLinkResponse
}

export async function maybeCreateCustomerPortalLinkForEstimate(
    estimate: LocalEstimate,
    options: CustomerPortalLinkOptions = {}
): Promise<CustomerPortalLinkResponse | null> {
    const headers = await withAuthHeaders({ "content-type": "application/json" })
    if (!headers.authorization) return null

    try {
        return await postCustomerPortalLinkForEstimate(estimate, headers, options)
    } catch (error) {
        console.warn("Customer quote approval link could not be prepared:", error)
        return null
    }
}

export async function fetchCustomerPortalLinkForEstimate(
    estimateId: string
): Promise<CustomerPortalLinkResponse | null> {
    const headers = await withAuthHeaders()
    const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/share-link`, {
        method: "GET",
        cache: "no-store",
        headers,
    })

    if (response.status === 404) return null

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
        const message = typeof data?.error?.message === "string"
            ? data.error.message
            : "Failed to load customer quote link."
        throw new Error(message)
    }

    if (data?.ok !== true) {
        throw new Error("Customer quote link response was incomplete.")
    }

    return data as CustomerPortalLinkResponse
}

export function appendCustomerPortalLink(
    message: string,
    shareUrl: string | undefined,
    channel: "email" | "sms"
): string {
    if (!shareUrl || message.includes(shareUrl)) return message

    if (channel === "sms") {
        return `${message.trim()} Review/approve: ${shareUrl}`
    }

    return `${message.trim()}\n\nReview, approve, or request changes here: ${shareUrl}`
}

export function getCustomerPortalEstimateUpdates(
    result: CustomerPortalLinkResponse
): Partial<LocalEstimate> {
    const updates: Partial<LocalEstimate> = {
        customerPortalStatus: result.portal.status,
        customerViewedAt: result.portal.viewedAt,
        customerApprovedAt: result.portal.approvedAt,
        customerChangeRequestedAt: result.portal.changeRequestedAt,
        customerPortalName: result.portal.customerName,
        customerPortalEmail: result.portal.customerEmail,
        customerPortalNote: result.portal.customerNote,
        synced: false,
    }

    if (result.shareUrl) {
        updates.customerPortalUrl = result.shareUrl
    }

    if (result.estimate?.paymentStatus === "paid" || result.estimate?.paymentCompletedAt) {
        updates.status = "paid"
        updates.paymentCompletedAt = result.estimate.paymentCompletedAt
    }

    return updates
}

export function customerPortalEstimateUpdatesChanged(
    estimate: LocalEstimate,
    updates: Partial<LocalEstimate>
): boolean {
    return (
        estimate.customerPortalStatus !== updates.customerPortalStatus ||
        estimate.customerViewedAt !== updates.customerViewedAt ||
        estimate.customerApprovedAt !== updates.customerApprovedAt ||
        estimate.customerChangeRequestedAt !== updates.customerChangeRequestedAt ||
        estimate.customerPortalName !== updates.customerPortalName ||
        estimate.customerPortalEmail !== updates.customerPortalEmail ||
        estimate.customerPortalNote !== updates.customerPortalNote ||
        ("status" in updates && estimate.status !== updates.status) ||
        ("paymentCompletedAt" in updates && estimate.paymentCompletedAt !== updates.paymentCompletedAt) ||
        (typeof updates.customerPortalUrl === "string" && estimate.customerPortalUrl !== updates.customerPortalUrl)
    )
}

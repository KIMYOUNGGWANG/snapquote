import { createHash, randomBytes } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { z } from "zod"
import {
    customerPortalDecisionSchema,
    customerQuoteShareLinkSchema,
    customerQuoteSnapshotSchema,
} from "@/lib/validation/api-schemas"

export type CustomerPortalStatus = "shared" | "viewed" | "approved" | "change_requested"
export type CustomerQuoteSnapshot = z.infer<typeof customerQuoteSnapshotSchema>
export type CustomerQuoteShareLinkInput = z.infer<typeof customerQuoteShareLinkSchema>
export type CustomerPortalDecisionInput = z.infer<typeof customerPortalDecisionSchema>

export type CustomerPortalBusiness = {
    businessName: string
    phone?: string
    email?: string
    address?: string
    logoUrl?: string
}

export type CustomerPortalQuote = {
    id: string
    userId: string
    estimateId: string
    status: CustomerPortalStatus
    shareUrl?: string
    viewedAt?: string
    approvedAt?: string
    changeRequestedAt?: string
    customerName?: string
    customerEmail?: string
    customerNote?: string
    estimate: CustomerQuoteSnapshot
    business: CustomerPortalBusiness
}

type CustomerPortalResult<T> =
    | { ok: true; data: T }
    | { ok: false; status: number; error: string }

type EstimateShareLinkRow = {
    id?: unknown
    user_id?: unknown
    estimate_id?: unknown
    share_url?: unknown
    token_hash?: unknown
    estimate_snapshot?: unknown
    status?: unknown
    viewed_at?: unknown
    approved_at?: unknown
    change_requested_at?: unknown
    customer_name?: unknown
    customer_email?: unknown
    customer_note?: unknown
    profiles?: unknown
}

type EstimatePaymentStateRow = {
    status?: unknown
    payment_completed_at?: unknown
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEFAULT_BUSINESS_NAME = "SnapQuote contractor"

function toSafeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : ""
}

function getStorageErrorMessage(error: { message?: string } | null | undefined, fallback: string): string {
    const message = error?.message?.trim()
    if (!message || message.toLowerCase().includes("fetch failed")) return fallback
    return message
}

function normalizeStatus(value: unknown): CustomerPortalStatus {
    if (
        value === "viewed" ||
        value === "approved" ||
        value === "change_requested"
    ) {
        return value
    }

    return "shared"
}

function firstProfile(value: unknown): Record<string, unknown> | null {
    if (Array.isArray(value)) {
        const first = value.find((entry) => entry && typeof entry === "object")
        return first ? first as Record<string, unknown> : null
    }

    return value && typeof value === "object" ? value as Record<string, unknown> : null
}

function buildBusiness(row: EstimateShareLinkRow): CustomerPortalBusiness {
    const profile = firstProfile(row.profiles)
    const businessName = toSafeString(profile?.business_name) || DEFAULT_BUSINESS_NAME
    const phone = toSafeString(profile?.phone)
    const email = toSafeString(profile?.email)
    const address = toSafeString(profile?.address)
    const logoUrl = toSafeString(profile?.logo_url)

    return {
        businessName,
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
        ...(address ? { address } : {}),
        ...(logoUrl ? { logoUrl } : {}),
    }
}

function toAnalyticsEstimateId(value: unknown): string | null {
    const estimateId = toSafeString(value)
    return UUID_PATTERN.test(estimateId) ? estimateId : null
}

function isUuidLike(value: unknown): value is string {
    return UUID_PATTERN.test(toSafeString(value))
}

function isEstimatePaidState(value: unknown): boolean {
    return value === "paid"
}

function hasValidPaymentTimestamp(value: unknown): boolean {
    const timestamp = toSafeString(value)
    if (!timestamp) return false

    return !Number.isNaN(new Date(timestamp).getTime())
}

function isCustomerQuoteSnapshotPaid(snapshot: CustomerQuoteSnapshot): boolean {
    return snapshot.paymentStatus === "paid" || hasValidPaymentTimestamp(snapshot.paymentCompletedAt)
}

function getEstimateNumberFromSnapshot(value: unknown): string {
    if (!value || typeof value !== "object" || Array.isArray(value)) return ""

    return toSafeString((value as Record<string, unknown>).estimateNumber).slice(0, 80)
}

function hasPaymentLinkInSnapshot(value: unknown): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false

    return Boolean(toSafeString((value as Record<string, unknown>).paymentLink))
}

function isDuplicateAnalyticsEventError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false

    const code = (error as Record<string, unknown>).code
    return code === "23505"
}

function getCustomerPortalDecisionStatus(action: CustomerPortalDecisionInput["action"]): CustomerPortalStatus {
    return action === "approve" ? "approved" : "change_requested"
}

async function recordCustomerDecisionAnalytics(
    supabase: SupabaseClient,
    row: EstimateShareLinkRow,
    action: CustomerPortalDecisionInput["action"]
): Promise<void> {
    const userId = toSafeString(row.user_id)
    const shareLinkId = toSafeString(row.id)
    if (!userId) return

    const eventName = action === "approve" ? "quote_approved" : "quote_change_requested"
    const status = action === "approve" ? "approved" : "change_requested"
    const externalId = shareLinkId ? `customer-portal-decision:${shareLinkId}:${eventName}` : null

    const { error } = await supabase
        .from("analytics_events")
        .insert({
            user_id: userId,
            event_name: eventName,
            estimate_id: toAnalyticsEstimateId(row.estimate_id),
            estimate_number: getEstimateNumberFromSnapshot(row.estimate_snapshot) || null,
            channel: "customer_portal",
            external_id: externalId,
            metadata: {
                source: "customer_portal",
                status,
                hasCustomerEmail: Boolean(toSafeString(row.customer_email)),
                hasCustomerNote: Boolean(toSafeString(row.customer_note)),
                paymentLinkIncluded: hasPaymentLinkInSnapshot(row.estimate_snapshot),
            },
        })

    if (error && !isDuplicateAnalyticsEventError(error)) {
        console.error("Failed to insert customer decision analytics event:", error)
    }
}

async function recordCustomerViewAnalytics(
    supabase: SupabaseClient,
    row: EstimateShareLinkRow
): Promise<void> {
    const userId = toSafeString(row.user_id)
    const shareLinkId = toSafeString(row.id)
    if (!userId) return

    const { error } = await supabase
        .from("analytics_events")
        .insert({
            user_id: userId,
            event_name: "quote_viewed",
            estimate_id: toAnalyticsEstimateId(row.estimate_id),
            estimate_number: getEstimateNumberFromSnapshot(row.estimate_snapshot) || null,
            channel: "customer_portal",
            external_id: shareLinkId ? `customer-portal-view:${shareLinkId}` : null,
            metadata: {
                source: "customer_portal",
                status: normalizeStatus(row.status),
                paymentLinkIncluded: hasPaymentLinkInSnapshot(row.estimate_snapshot),
            },
        })

    if (error && !isDuplicateAnalyticsEventError(error)) {
        console.error("Failed to insert customer view analytics event:", error)
    }
}

const CUSTOMER_PORTAL_SELECT = `
    id,
    user_id,
    estimate_id,
    token_hash,
    share_url,
    estimate_snapshot,
    status,
    viewed_at,
    approved_at,
    change_requested_at,
    customer_name,
    customer_email,
    customer_note,
    profiles (
        business_name,
        phone,
        email,
        address,
        logo_url
    )
`

function normalizeQuoteRow(
    row: EstimateShareLinkRow,
    paymentState: EstimatePaymentStateRow | null = null
): CustomerPortalResult<CustomerPortalQuote> {
    const parsedSnapshot = customerQuoteSnapshotSchema.safeParse(row.estimate_snapshot)
    if (!parsedSnapshot.success) {
        return {
            ok: false,
            status: 500,
            error: "Customer quote snapshot is invalid.",
        }
    }

    const id = toSafeString(row.id)
    const estimateId = toSafeString(row.estimate_id)
    if (!id || !estimateId) {
        return {
            ok: false,
            status: 500,
            error: "Customer quote link is incomplete.",
        }
    }

    const customerName = toSafeString(row.customer_name)
    const customerEmail = toSafeString(row.customer_email)
    const customerNote = toSafeString(row.customer_note)
    const viewedAt = toSafeString(row.viewed_at)
    const approvedAt = toSafeString(row.approved_at)
    const changeRequestedAt = toSafeString(row.change_requested_at)
    const shareUrl = toSafeString(row.share_url)
    const currentPaymentCompletedAt = toSafeString(paymentState?.payment_completed_at)
    const snapshotPaymentCompletedAt = toSafeString(parsedSnapshot.data.paymentCompletedAt)
    const paymentCompletedAt = currentPaymentCompletedAt || snapshotPaymentCompletedAt
    const isPaid = isEstimatePaidState(paymentState?.status) || Boolean(paymentCompletedAt) || parsedSnapshot.data.paymentStatus === "paid"
    const estimate = {
        ...parsedSnapshot.data,
        ...(isPaid ? { paymentStatus: "paid" as const } : {}),
        ...(paymentCompletedAt ? { paymentCompletedAt } : {}),
    }

    return {
        ok: true,
        data: {
            id,
            userId: toSafeString(row.user_id),
            estimateId,
            status: normalizeStatus(row.status),
            ...(shareUrl ? { shareUrl } : {}),
            ...(viewedAt ? { viewedAt } : {}),
            ...(approvedAt ? { approvedAt } : {}),
            ...(changeRequestedAt ? { changeRequestedAt } : {}),
            ...(customerName ? { customerName } : {}),
            ...(customerEmail ? { customerEmail } : {}),
            ...(customerNote ? { customerNote } : {}),
            estimate,
            business: buildBusiness(row),
        },
    }
}

async function loadEstimatePaymentState(
    supabase: SupabaseClient,
    row: EstimateShareLinkRow
): Promise<EstimatePaymentStateRow | null> {
    const userId = toSafeString(row.user_id)
    const estimateId = toSafeString(row.estimate_id)
    if (!userId || !isUuidLike(estimateId)) return null

    const { data, error } = await supabase
        .from("estimates")
        .select("status, payment_completed_at")
        .eq("user_id", userId)
        .eq("id", estimateId)
        .maybeSingle()

    if (error) {
        console.warn("Failed to load current estimate payment state for customer quote:", error)
        return null
    }

    return data as EstimatePaymentStateRow | null
}

export function createCustomerPortalToken(): string {
    return randomBytes(32).toString("base64url")
}

export function hashCustomerPortalToken(token: string): string | null {
    const normalized = token.trim()
    if (!TOKEN_PATTERN.test(normalized)) return null

    return createHash("sha256").update(normalized).digest("hex")
}

export function buildCustomerPortalUrl(req: Request, token: string): string {
    const requestUrl = new URL(req.url)
    const forwardedHost = req.headers.get("x-forwarded-host")?.trim()
    const forwardedProto = req.headers.get("x-forwarded-proto")?.trim()
    const origin = forwardedHost
        ? `${forwardedProto || requestUrl.protocol.replace(":", "")}://${forwardedHost}`
        : requestUrl.origin

    return `${origin}/q/${encodeURIComponent(token)}`
}

export async function createCustomerPortalLink(
    supabase: SupabaseClient,
    input: {
        userId: string
        estimateId: string
        estimate: CustomerQuoteSnapshot
        shareUrl: string
        tokenHash: string
        resetCustomerDecision?: boolean
    }
): Promise<CustomerPortalResult<CustomerPortalQuote>> {
    const now = new Date().toISOString()
    const inputEstimateIsPaid = isCustomerQuoteSnapshotPaid(input.estimate)

    const existing = await getCustomerPortalQuoteForEstimate(supabase, input.userId, input.estimateId)
    if (existing.ok && existing.data.shareUrl) {
        const existingEstimateIsPaid = isCustomerQuoteSnapshotPaid(existing.data.estimate)
        if (input.resetCustomerDecision && (inputEstimateIsPaid || existingEstimateIsPaid)) {
            return {
                ok: false,
                status: 409,
                error: "Paid quotes cannot be reset for customer review.",
            }
        }

        const updatePayload: Record<string, unknown> = {
            estimate_snapshot: input.estimate,
            share_url: existing.data.shareUrl,
            updated_at: now,
        }

        if (input.resetCustomerDecision) {
            Object.assign(updatePayload, {
                status: "shared",
                viewed_at: null,
                approved_at: null,
                change_requested_at: null,
                customer_name: null,
                customer_email: null,
                customer_note: null,
            })
        }

        const { data, error } = await supabase
            .from("estimate_share_links")
            .update(updatePayload)
            .eq("user_id", input.userId)
            .eq("estimate_id", input.estimateId)
            .eq("id", existing.data.id)
            .select(CUSTOMER_PORTAL_SELECT)
            .single()

        if (error) {
            return {
                ok: false,
                status: 500,
                error: getStorageErrorMessage(error, "Failed to update customer quote link."),
            }
        }

        const row = (data || {}) as EstimateShareLinkRow
        return normalizeQuoteRow(row, await loadEstimatePaymentState(supabase, row))
    }
    if (!existing.ok && existing.status !== 404) {
        return existing
    }

    const { data, error } = await supabase
        .from("estimate_share_links")
        .insert({
            user_id: input.userId,
            estimate_id: input.estimateId,
            token_hash: input.tokenHash,
            estimate_snapshot: input.estimate,
            share_url: input.shareUrl,
            status: "shared",
            updated_at: now,
        })
        .select(CUSTOMER_PORTAL_SELECT)
        .single()

    if (error) {
        return {
            ok: false,
            status: 500,
            error: getStorageErrorMessage(error, "Failed to create customer quote link."),
        }
    }

    const row = (data || {}) as EstimateShareLinkRow
    const normalized = normalizeQuoteRow(row, await loadEstimatePaymentState(supabase, row))
    if (!normalized.ok) return normalized

    return {
        ok: true,
        data: {
            ...normalized.data,
            shareUrl: normalized.data.shareUrl || input.shareUrl,
        },
    }
}

export async function getCustomerPortalQuoteForEstimate(
    supabase: SupabaseClient,
    userId: string,
    estimateId: string
): Promise<CustomerPortalResult<CustomerPortalQuote>> {
    const { data, error } = await supabase
        .from("estimate_share_links")
        .select(CUSTOMER_PORTAL_SELECT)
        .eq("user_id", userId)
        .eq("estimate_id", estimateId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) {
        return {
            ok: false,
            status: 500,
            error: getStorageErrorMessage(error, "Failed to load customer quote link."),
        }
    }

    if (!data) {
        return {
            ok: false,
            status: 404,
            error: "Customer quote link was not found.",
        }
    }

    const row = data as EstimateShareLinkRow
    return normalizeQuoteRow(row, await loadEstimatePaymentState(supabase, row))
}

export async function getCustomerPortalQuote(
    supabase: SupabaseClient,
    token: string,
    options: { markViewed?: boolean } = {}
): Promise<CustomerPortalResult<CustomerPortalQuote>> {
    const tokenHash = hashCustomerPortalToken(token)
    if (!tokenHash) {
        return {
            ok: false,
            status: 404,
            error: "Customer quote link was not found.",
        }
    }

    const { data, error } = await supabase
        .from("estimate_share_links")
        .select(CUSTOMER_PORTAL_SELECT)
        .eq("token_hash", tokenHash)
        .maybeSingle()

    if (error) {
        return {
            ok: false,
            status: 500,
            error: getStorageErrorMessage(error, "Failed to load customer quote."),
        }
    }

    if (!data) {
        return {
            ok: false,
            status: 404,
            error: "Customer quote link was not found.",
        }
    }

    let row = data as EstimateShareLinkRow
    const currentStatus = normalizeStatus(row.status)
    const canRecordView = currentStatus === "shared" || currentStatus === "viewed"
    if (options.markViewed && canRecordView && !toSafeString(row.viewed_at)) {
        const nextStatus = currentStatus === "shared" ? "viewed" : currentStatus
        const viewedAt = new Date().toISOString()
        const updateResult = await supabase
            .from("estimate_share_links")
            .update({
                viewed_at: viewedAt,
                status: nextStatus,
                updated_at: viewedAt,
            })
            .eq("id", toSafeString(row.id))
            .select(CUSTOMER_PORTAL_SELECT)
            .single()

        if (!updateResult.error && updateResult.data) {
            row = updateResult.data as EstimateShareLinkRow
            await recordCustomerViewAnalytics(supabase, row)
        }
    }

    return normalizeQuoteRow(row, await loadEstimatePaymentState(supabase, row))
}

export async function recordCustomerPortalDecision(
    supabase: SupabaseClient,
    token: string,
    input: CustomerPortalDecisionInput
): Promise<CustomerPortalResult<CustomerPortalQuote>> {
    const parsed = customerPortalDecisionSchema.safeParse(input)
    if (!parsed.success) {
        return {
            ok: false,
            status: 400,
            error: "Invalid customer quote decision.",
        }
    }

    const tokenHash = hashCustomerPortalToken(token)
    if (!tokenHash) {
        return {
            ok: false,
            status: 404,
            error: "Customer quote link was not found.",
        }
    }

    const now = new Date().toISOString()
    const action = parsed.data.action

    const existingResult = await supabase
        .from("estimate_share_links")
        .select(CUSTOMER_PORTAL_SELECT)
        .eq("token_hash", tokenHash)
        .maybeSingle()

    if (existingResult.error) {
        return {
            ok: false,
            status: 500,
            error: getStorageErrorMessage(existingResult.error, "Failed to load customer quote."),
        }
    }

    if (!existingResult.data) {
        return {
            ok: false,
            status: 404,
            error: "Customer quote link was not found.",
        }
    }

    const existingRow = existingResult.data as EstimateShareLinkRow
    const existingPaymentState = await loadEstimatePaymentState(supabase, existingRow)
    const existingQuote = normalizeQuoteRow(existingRow, existingPaymentState)
    if (!existingQuote.ok) return existingQuote

    if (existingQuote.data.estimate.paymentStatus === "paid") {
        return {
            ok: false,
            status: 409,
            error: "This quote is already paid.",
        }
    }

    const targetStatus = getCustomerPortalDecisionStatus(action)
    if (existingQuote.data.status === "approved" || existingQuote.data.status === "change_requested") {
        if (existingQuote.data.status === targetStatus) {
            return existingQuote
        }

        return {
            ok: false,
            status: 409,
            error: existingQuote.data.status === "approved"
                ? "This quote is already approved."
                : "A change request has already been sent.",
        }
    }

    const updatePayload = action === "approve"
        ? {
            status: "approved",
            approved_at: now,
            change_requested_at: null,
            customer_name: parsed.data.customerName || null,
            customer_email: parsed.data.customerEmail || null,
            customer_note: parsed.data.message || null,
            updated_at: now,
        }
        : {
            status: "change_requested",
            approved_at: null,
            change_requested_at: now,
            customer_name: parsed.data.customerName || null,
            customer_email: parsed.data.customerEmail || null,
            customer_note: parsed.data.message || null,
            updated_at: now,
        }

    const { data, error } = await supabase
        .from("estimate_share_links")
        .update(updatePayload)
        .eq("token_hash", tokenHash)
        .select(CUSTOMER_PORTAL_SELECT)
        .maybeSingle()

    if (error) {
        return {
            ok: false,
            status: 500,
            error: getStorageErrorMessage(error, "Failed to update customer quote."),
        }
    }

    if (!data) {
        return {
            ok: false,
            status: 404,
            error: "Customer quote link was not found.",
        }
    }

    const row = data as EstimateShareLinkRow
    await recordCustomerDecisionAnalytics(supabase, row, action)

    return normalizeQuoteRow(row, existingPaymentState)
}

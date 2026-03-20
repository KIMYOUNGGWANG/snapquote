import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import { resolveEffectivePlanTier } from "@/lib/server/effective-plan"

type ServiceSupabaseClient = NonNullable<ReturnType<typeof createServiceSupabaseClient>>

export type QuickBooksConnectionRow = {
    user_id: string
    realm_id: string
    access_token: string
    refresh_token: string
    token_expires_at: string
    refresh_token_expires_at: string | null
    connected_at: string
    updated_at: string
}

export type QuickBooksInvoiceLinkRow = {
    user_id: string
    estimate_id: string
    estimate_number: string
    quickbooks_invoice_id: string
    quickbooks_customer_id: string | null
    quickbooks_invoice_doc_number: string | null
    quickbooks_invoice_status: "open" | "paid" | "unknown"
    synced_at: string
}

const QUICKBOOKS_PRO_TIERS = new Set(["pro", "team"])
const QUICKBOOKS_OAUTH_BASE = "https://appcenter.intuit.com/connect/oauth2"
const QUICKBOOKS_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
const QUICKBOOKS_API_BASE = "https://quickbooks.api.intuit.com/v3/company"

function toTrimmedString(value: unknown, maxLength: number): string {
    if (typeof value !== "string") return ""
    return value.trim().slice(0, maxLength)
}

function toIsoString(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    if (!trimmed) return null
    const timestamp = Date.parse(trimmed)
    if (Number.isNaN(timestamp)) return null
    return new Date(timestamp).toISOString()
}

function toPositiveNumber(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value
    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed) && parsed >= 0) return parsed
    }
    return fallback
}

function parseQuickBooksStatus(invoice: Record<string, any> | null | undefined): "open" | "paid" | "unknown" {
    if (!invoice) return "unknown"
    const balance = toPositiveNumber(invoice.Balance, NaN)
    if (Number.isFinite(balance)) {
        return balance <= 0 ? "paid" : "open"
    }

    return "unknown"
}

function getQuickBooksConfig() {
    const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim()
    const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET?.trim()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
    const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI?.trim() || (appUrl ? `${appUrl.replace(/\/$/, "")}/quickbooks/callback` : "")

    if (!clientId || !clientSecret || !redirectUri) {
        return null
    }

    return {
        clientId,
        clientSecret,
        redirectUri,
    }
}

function buildBasicAuthHeader(clientId: string, clientSecret: string): string {
    return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
}

function buildQuickBooksState(input: { userId: string; returnPath: string }): string {
    return Buffer.from(JSON.stringify(input)).toString("base64url")
}

export function decodeQuickBooksState(state: string | null | undefined): { userId?: string; returnPath?: string } | null {
    if (!state || typeof state !== "string") return null

    try {
        const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"))
        return typeof parsed === "object" && parsed !== null ? parsed : null
    } catch {
        return null
    }
}

export function createQuickBooksAuthUrl(input: { userId: string; returnPath?: string }): { url: string } | { error: string } {
    const config = getQuickBooksConfig()
    if (!config) {
        return { error: "QuickBooks is not configured." }
    }

    const url = new URL(QUICKBOOKS_OAUTH_BASE)
    url.searchParams.set("client_id", config.clientId)
    url.searchParams.set("redirect_uri", config.redirectUri)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("scope", "com.intuit.quickbooks.accounting")
    url.searchParams.set(
        "state",
        buildQuickBooksState({
            userId: input.userId,
            returnPath: input.returnPath || "/history",
        })
    )

    return { url: url.toString() }
}

export async function resolveQuickBooksPlanTier(
    supabase: ServiceSupabaseClient,
    userId: string
): Promise<{ planTier: string | null; error: string | null }> {
    const { data, error } = await supabase
        .from("profiles")
        .select("plan_tier, stripe_subscription_status, referral_trial_ends_at, referral_bonus_ends_at")
        .eq("id", userId)
        .maybeSingle()

    if (error) {
        return { planTier: null, error: error.message || "Failed to resolve plan tier" }
    }

    return { planTier: resolveEffectivePlanTier(data || {}), error: null }
}

export function hasQuickBooksAccess(planTier: string | null | undefined): boolean {
    return typeof planTier === "string" && QUICKBOOKS_PRO_TIERS.has(planTier)
}

export async function getQuickBooksConnection(
    supabase: ServiceSupabaseClient,
    userId: string
): Promise<{ data: QuickBooksConnectionRow | null; error: string | null }> {
    const { data, error } = await supabase
        .from("quickbooks_connections")
        .select("user_id, realm_id, access_token, refresh_token, token_expires_at, refresh_token_expires_at, connected_at, updated_at")
        .eq("user_id", userId)
        .maybeSingle()

    return {
        data: (data as QuickBooksConnectionRow | null) ?? null,
        error: error ? error.message || "Failed to load QuickBooks connection" : null,
    }
}

export async function upsertQuickBooksConnection(
    supabase: ServiceSupabaseClient,
    connection: QuickBooksConnectionRow
) {
    return supabase
        .from("quickbooks_connections")
        .upsert(connection, { onConflict: "user_id" })
}

export async function exchangeQuickBooksCode(input: {
    code: string
    realmId: string
    userId: string
}): Promise<
    | { ok: true; connection: QuickBooksConnectionRow }
    | { ok: false; status: number; error: string }
> {
    const config = getQuickBooksConfig()
    if (!config) {
        return { ok: false, status: 500, error: "QuickBooks is not configured." }
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return { ok: false, status: 500, error: "Supabase service configuration is missing." }
    }

    const response = await fetch(QUICKBOOKS_TOKEN_URL, {
        method: "POST",
        headers: {
            authorization: buildBasicAuthHeader(config.clientId, config.clientSecret),
            "content-type": "application/x-www-form-urlencoded",
            accept: "application/json",
        },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code: input.code,
            redirect_uri: config.redirectUri,
        }).toString(),
        cache: "no-store",
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
        const message =
            typeof payload?.error_description === "string"
                ? payload.error_description
                : typeof payload?.error === "string"
                    ? payload.error
                    : "QuickBooks token exchange failed."
        return { ok: false, status: 500, error: message }
    }

    const now = Date.now()
    const expiresInMs = toPositiveNumber(payload?.expires_in, 3600) * 1000
    const refreshExpiresInMs = toPositiveNumber(payload?.x_refresh_token_expires_in, 86400 * 100) * 1000

    const connection: QuickBooksConnectionRow = {
        user_id: input.userId,
        realm_id: input.realmId,
        access_token: toTrimmedString(payload?.access_token, 4096),
        refresh_token: toTrimmedString(payload?.refresh_token, 4096),
        token_expires_at: new Date(now + expiresInMs).toISOString(),
        refresh_token_expires_at: new Date(now + refreshExpiresInMs).toISOString(),
        connected_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
    }

    if (!connection.access_token || !connection.refresh_token) {
        return { ok: false, status: 500, error: "QuickBooks returned an incomplete token payload." }
    }

    const { error } = await upsertQuickBooksConnection(supabase, connection)
    if (error) {
        return { ok: false, status: 500, error: error.message || "Failed to save QuickBooks connection." }
    }

    return { ok: true, connection }
}

export async function ensureQuickBooksAccessToken(
    supabase: ServiceSupabaseClient,
    userId: string,
    connection: QuickBooksConnectionRow
): Promise<
    | { ok: true; connection: QuickBooksConnectionRow }
    | { ok: false; status: number; error: string }
> {
    const expiresAt = Date.parse(connection.token_expires_at)
    if (Number.isFinite(expiresAt) && expiresAt - Date.now() > 60_000) {
        return { ok: true, connection }
    }

    const config = getQuickBooksConfig()
    if (!config) {
        return { ok: false, status: 500, error: "QuickBooks is not configured." }
    }

    const response = await fetch(QUICKBOOKS_TOKEN_URL, {
        method: "POST",
        headers: {
            authorization: buildBasicAuthHeader(config.clientId, config.clientSecret),
            "content-type": "application/x-www-form-urlencoded",
            accept: "application/json",
        },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: connection.refresh_token,
        }).toString(),
        cache: "no-store",
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
        const message =
            typeof payload?.error_description === "string"
                ? payload.error_description
                : typeof payload?.error === "string"
                    ? payload.error
                    : "QuickBooks token refresh failed."
        return { ok: false, status: 401, error: message }
    }

    const now = Date.now()
    const nextConnection: QuickBooksConnectionRow = {
        ...connection,
        user_id: userId,
        access_token: toTrimmedString(payload?.access_token, 4096) || connection.access_token,
        refresh_token: toTrimmedString(payload?.refresh_token, 4096) || connection.refresh_token,
        token_expires_at: new Date(now + toPositiveNumber(payload?.expires_in, 3600) * 1000).toISOString(),
        refresh_token_expires_at: new Date(now + toPositiveNumber(payload?.x_refresh_token_expires_in, 86400 * 100) * 1000).toISOString(),
        updated_at: new Date(now).toISOString(),
    }

    const { error } = await upsertQuickBooksConnection(supabase, nextConnection)
    if (error) {
        return { ok: false, status: 500, error: error.message || "Failed to refresh QuickBooks connection." }
    }

    return { ok: true, connection: nextConnection }
}

async function quickBooksFetch<T>(input: {
    realmId: string
    accessToken: string
    path: string
    method?: "GET" | "POST"
    body?: unknown
    headers?: HeadersInit
}): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
    const response = await fetch(`${QUICKBOOKS_API_BASE}/${encodeURIComponent(input.realmId)}${input.path}`, {
        method: input.method || "GET",
        headers: {
            authorization: `Bearer ${input.accessToken}`,
            accept: "application/json",
            ...(input.body ? { "content-type": "application/json" } : {}),
            ...input.headers,
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
        cache: "no-store",
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
        const faultMessage = payload?.Fault?.Error?.[0]?.Message || payload?.Fault?.Error?.[0]?.Detail
        return {
            ok: false,
            status: response.status,
            error: typeof faultMessage === "string" && faultMessage.trim()
                ? faultMessage.trim()
                : "QuickBooks request failed.",
        }
    }

    return { ok: true, data: payload as T }
}

function escapeQuickBooksQueryValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

export async function findQuickBooksCustomerByDisplayName(input: {
    realmId: string
    accessToken: string
    displayName: string
}) {
    const query = `select * from Customer where DisplayName = '${escapeQuickBooksQueryValue(input.displayName)}' maxresults 1`
    return quickBooksFetch<{ QueryResponse?: { Customer?: Array<Record<string, any>> } }>({
        realmId: input.realmId,
        accessToken: input.accessToken,
        path: `/query?query=${encodeURIComponent(query)}`,
    })
}

export async function createQuickBooksCustomer(input: {
    realmId: string
    accessToken: string
    displayName: string
    address?: string
}) {
    return quickBooksFetch<{ Customer?: Record<string, any> }>({
        realmId: input.realmId,
        accessToken: input.accessToken,
        path: "/customer",
        method: "POST",
        body: {
            DisplayName: input.displayName,
            ...(input.address
                ? {
                    Notes: input.address,
                }
                : {}),
        },
    })
}

export async function resolveQuickBooksServiceItemRef(input: {
    realmId: string
    accessToken: string
}): Promise<{ value: string; name?: string }> {
    const query = "select * from Item where Type = 'Service' maxresults 1"
    const result = await quickBooksFetch<{ QueryResponse?: { Item?: Array<Record<string, any>> } }>({
        realmId: input.realmId,
        accessToken: input.accessToken,
        path: `/query?query=${encodeURIComponent(query)}`,
    })

    if (result.ok) {
        const item = result.data.QueryResponse?.Item?.[0]
        const value = toTrimmedString(item?.Id, 64)
        if (value) {
            return {
                value,
                ...(toTrimmedString(item?.Name, 120) ? { name: toTrimmedString(item?.Name, 120) } : {}),
            }
        }
    }

    // Inference from official sample payloads: many QuickBooks companies expose a default Services item.
    return { value: "1", name: "Services" }
}

export async function getQuickBooksInvoice(input: {
    realmId: string
    accessToken: string
    invoiceId: string
}) {
    return quickBooksFetch<{ Invoice?: Record<string, any> }>({
        realmId: input.realmId,
        accessToken: input.accessToken,
        path: `/invoice/${encodeURIComponent(input.invoiceId)}`,
    })
}

export async function createQuickBooksInvoice(input: {
    realmId: string
    accessToken: string
    customerId: string
    serviceItemRef: { value: string; name?: string }
    estimateNumber: string
    summaryNote?: string
    items: Array<{
        description: string
        quantity: number
        unit_price: number
        total: number
    }>
    taxAmount?: number
}): Promise<{ ok: true; invoice: Record<string, any> } | { ok: false; status: number; error: string }> {
    const lines = input.items.map((item) => ({
        DetailType: "SalesItemLineDetail",
        Amount: Number(item.total.toFixed(2)),
        Description: item.description,
        SalesItemLineDetail: {
            Qty: item.quantity,
            UnitPrice: Number(item.unit_price.toFixed(2)),
            ItemRef: input.serviceItemRef,
        },
    }))

    const taxAmount = toPositiveNumber(input.taxAmount, 0)
    if (taxAmount > 0) {
        lines.push({
            DetailType: "SalesItemLineDetail",
            Amount: Number(taxAmount.toFixed(2)),
            Description: "Sales tax / HST",
            SalesItemLineDetail: {
                Qty: 1,
                UnitPrice: Number(taxAmount.toFixed(2)),
                ItemRef: input.serviceItemRef,
            },
        })
    }

    const result = await quickBooksFetch<{ Invoice?: Record<string, any> }>({
        realmId: input.realmId,
        accessToken: input.accessToken,
        path: "/invoice",
        method: "POST",
        body: {
            CustomerRef: { value: input.customerId },
            Line: lines,
            DocNumber: input.estimateNumber,
            ...(input.summaryNote ? { CustomerMemo: { value: input.summaryNote } } : {}),
        },
    })

    if (!result.ok) return result

    return {
        ok: true,
        invoice: result.data.Invoice || {},
    }
}

export async function getQuickBooksInvoiceLink(
    supabase: ServiceSupabaseClient,
    userId: string,
    estimateId: string
): Promise<{ data: QuickBooksInvoiceLinkRow | null; error: string | null }> {
    const { data, error } = await supabase
        .from("quickbooks_invoice_links")
        .select("user_id, estimate_id, estimate_number, quickbooks_invoice_id, quickbooks_customer_id, quickbooks_invoice_doc_number, quickbooks_invoice_status, synced_at")
        .eq("user_id", userId)
        .eq("estimate_id", estimateId)
        .maybeSingle()

    return {
        data: (data as QuickBooksInvoiceLinkRow | null) ?? null,
        error: error ? error.message || "Failed to load QuickBooks invoice link" : null,
    }
}

export async function upsertQuickBooksInvoiceLink(
    supabase: ServiceSupabaseClient,
    input: QuickBooksInvoiceLinkRow & {
        payload_snapshot?: Record<string, unknown>
    }
) {
    return supabase
        .from("quickbooks_invoice_links")
        .upsert(
            {
                ...input,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,estimate_id" }
        )
}

export async function countQuickBooksSyncedInvoices(
    supabase: ServiceSupabaseClient,
    userId: string
): Promise<{ count: number; latestSyncedAt: string | null; error: string | null }> {
    const { data, error } = await supabase
        .from("quickbooks_invoice_links")
        .select("synced_at")
        .eq("user_id", userId)
        .order("synced_at", { ascending: false })

    if (error) {
        return { count: 0, latestSyncedAt: null, error: error.message || "Failed to load QuickBooks sync stats" }
    }

    const rows = Array.isArray(data) ? data : []
    return {
        count: rows.length,
        latestSyncedAt: toIsoString(rows[0]?.synced_at),
        error: null,
    }
}

export function summarizeQuickBooksInvoice(invoice: Record<string, any> | null | undefined) {
    return {
        invoiceId: toTrimmedString(invoice?.Id, 64),
        customerId: toTrimmedString(invoice?.CustomerRef?.value, 64) || null,
        docNumber: toTrimmedString(invoice?.DocNumber, 64) || null,
        status: parseQuickBooksStatus(invoice),
    }
}

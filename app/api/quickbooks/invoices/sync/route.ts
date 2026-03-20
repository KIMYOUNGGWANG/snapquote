import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient, ensureProfileExists } from "@/lib/server/stripe-connect"
import {
    createQuickBooksCustomer,
    createQuickBooksInvoice,
    ensureQuickBooksAccessToken,
    findQuickBooksCustomerByDisplayName,
    getQuickBooksConnection,
    getQuickBooksInvoice,
    getQuickBooksInvoiceLink,
    hasQuickBooksAccess,
    resolveQuickBooksPlanTier,
    resolveQuickBooksServiceItemRef,
    summarizeQuickBooksInvoice,
    upsertQuickBooksInvoiceLink,
} from "@/lib/server/quickbooks"
import { quickBooksInvoiceSyncSchema } from "@/lib/validation/api-schemas"

function toRoundedMoney(value: number | undefined, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return fallback
    return Number(value.toFixed(2))
}

export async function POST(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `quickbooks-invoice-sync:${auth.userId}:${ip}`,
        limit: 20,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: { message: "Invalid request payload", code: 400 } },
            { status: 400 }
        )
    }

    const parsed = quickBooksInvoiceSyncSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: { message: "Invalid request payload", code: 400 } },
            { status: 400 }
        )
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json(
            { error: { message: "Supabase service configuration is missing", code: 500 } },
            { status: 500 }
        )
    }

    await ensureProfileExists(supabase, auth.userId)

    try {
        const { planTier, error: planError } = await resolveQuickBooksPlanTier(supabase, auth.userId)
        if (planError) {
            return NextResponse.json(
                { error: { message: planError, code: 500 } },
                { status: 500 }
            )
        }

        if (!hasQuickBooksAccess(planTier)) {
            return NextResponse.json(
                { error: "QuickBooks sync requires a Pro or Team plan." },
                { status: 402 }
            )
        }

        const { data: connection, error: connectionError } = await getQuickBooksConnection(supabase, auth.userId)
        if (connectionError) {
            return NextResponse.json(
                { error: { message: connectionError, code: 500 } },
                { status: 500 }
            )
        }

        if (!connection) {
            return NextResponse.json(
                { error: { message: "QuickBooks is not connected", code: 403 } },
                { status: 403 }
            )
        }

        const ensured = await ensureQuickBooksAccessToken(supabase, auth.userId, connection)
        if (!ensured.ok) {
            return NextResponse.json(
                { error: { message: ensured.error, code: ensured.status } },
                { status: ensured.status }
            )
        }

        const accessToken = ensured.connection.access_token
        const realmId = ensured.connection.realm_id
        const estimate = parsed.data

        const existing = await getQuickBooksInvoiceLink(supabase, auth.userId, estimate.estimateId)
        if (existing.error) {
            return NextResponse.json(
                { error: { message: existing.error, code: 500 } },
                { status: 500 }
            )
        }

        if (existing.data?.quickbooks_invoice_id) {
            const existingInvoice = await getQuickBooksInvoice({
                realmId,
                accessToken,
                invoiceId: existing.data.quickbooks_invoice_id,
            })

            if (existingInvoice.ok) {
                const summary = summarizeQuickBooksInvoice(existingInvoice.data.Invoice)
                const syncedAt = existing.data.synced_at

                return NextResponse.json({
                    ok: true,
                    deduped: true,
                    invoiceId: summary.invoiceId || existing.data.quickbooks_invoice_id,
                    ...(summary.customerId ? { customerId: summary.customerId } : {}),
                    ...(summary.docNumber ? { docNumber: summary.docNumber } : {}),
                    status: summary.status,
                    syncedAt,
                })
            }
        }

        let customerId = ""
        const existingCustomer = await findQuickBooksCustomerByDisplayName({
            realmId,
            accessToken,
            displayName: estimate.clientName,
        })

        if (existingCustomer.ok) {
            customerId = String(existingCustomer.data.QueryResponse?.Customer?.[0]?.Id || "").trim()
        }

        if (!customerId) {
            const createdCustomer = await createQuickBooksCustomer({
                realmId,
                accessToken,
                displayName: estimate.clientName,
                address: estimate.clientAddress,
            })

            if (!createdCustomer.ok) {
                return NextResponse.json(
                    { error: { message: createdCustomer.error, code: createdCustomer.status } },
                    { status: createdCustomer.status }
                )
            }

            customerId = String(createdCustomer.data.Customer?.Id || "").trim()
        }

        if (!customerId) {
            return NextResponse.json(
                { error: { message: "QuickBooks customer resolution failed", code: 500 } },
                { status: 500 }
            )
        }

        const serviceItemRef = await resolveQuickBooksServiceItemRef({
            realmId,
            accessToken,
        })

        const invoiceResult = await createQuickBooksInvoice({
            realmId,
            accessToken,
            customerId,
            serviceItemRef,
            estimateNumber: estimate.estimateNumber,
            summaryNote: estimate.summaryNote,
            items: estimate.items.map((item) => ({
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total: toRoundedMoney(item.total, item.quantity * item.unit_price),
            })),
            taxAmount: estimate.taxAmount,
        })

        if (!invoiceResult.ok) {
            return NextResponse.json(
                { error: { message: invoiceResult.error, code: invoiceResult.status } },
                { status: invoiceResult.status }
            )
        }

        const summary = summarizeQuickBooksInvoice(invoiceResult.invoice)
        const syncedAt = new Date().toISOString()

        const { error: upsertError } = await upsertQuickBooksInvoiceLink(supabase, {
            user_id: auth.userId,
            estimate_id: estimate.estimateId,
            estimate_number: estimate.estimateNumber,
            quickbooks_invoice_id: summary.invoiceId || String(invoiceResult.invoice.Id || "").trim(),
            quickbooks_customer_id: summary.customerId,
            quickbooks_invoice_doc_number: summary.docNumber,
            quickbooks_invoice_status: summary.status,
            synced_at: syncedAt,
            payload_snapshot: {
                estimateId: estimate.estimateId,
                estimateNumber: estimate.estimateNumber,
                totalAmount: estimate.totalAmount,
                taxAmount: estimate.taxAmount || 0,
                itemCount: estimate.items.length,
                type: estimate.type || "estimate",
            },
        })

        if (upsertError) {
            return NextResponse.json(
                { error: { message: upsertError.message || "Failed to save QuickBooks sync state", code: 500 } },
                { status: 500 }
            )
        }

        return NextResponse.json({
            ok: true,
            invoiceId: summary.invoiceId,
            ...(summary.customerId ? { customerId: summary.customerId } : {}),
            ...(summary.docNumber ? { docNumber: summary.docNumber } : {}),
            status: summary.status,
            syncedAt,
        })
    } catch (error) {
        console.error("QuickBooks invoice sync route error:", error)
        return NextResponse.json(
            { error: { message: "Failed to sync invoice to QuickBooks", code: 500 } },
            { status: 500 }
        )
    }
}

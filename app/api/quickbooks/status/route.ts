import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient, ensureProfileExists } from "@/lib/server/stripe-connect"
import {
    countQuickBooksSyncedInvoices,
    ensureQuickBooksAccessToken,
    getQuickBooksConnection,
    hasQuickBooksAccess,
    resolveQuickBooksPlanTier,
} from "@/lib/server/quickbooks"

export async function GET(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `quickbooks-status:${auth.userId}:${ip}`,
        limit: 60,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
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
        const [{ planTier, error: planError }, { data: connection, error: connectionError }, syncStats] =
            await Promise.all([
                resolveQuickBooksPlanTier(supabase, auth.userId),
                getQuickBooksConnection(supabase, auth.userId),
                countQuickBooksSyncedInvoices(supabase, auth.userId),
            ])

        if (planError || connectionError || syncStats.error) {
            return NextResponse.json(
                {
                    error: {
                        message: planError || connectionError || syncStats.error || "Failed to load QuickBooks status",
                        code: 500,
                    },
                },
                { status: 500 }
            )
        }

        let connected = Boolean(connection)
        let reconnectRequired = false
        let realmId = connection?.realm_id?.trim() || ""

        if (connection) {
            const ensured = await ensureQuickBooksAccessToken(supabase, auth.userId, connection)
            if (!ensured.ok) {
                connected = false
                reconnectRequired = true
                realmId = ""
            } else {
                realmId = ensured.connection.realm_id
            }
        }

        return NextResponse.json({
            ok: true,
            planTier,
            eligible: hasQuickBooksAccess(planTier),
            connected,
            ...(realmId ? { realmId } : {}),
            reconnectRequired,
            syncStats: {
                syncedInvoices: syncStats.count,
                ...(syncStats.latestSyncedAt ? { latestSyncedAt: syncStats.latestSyncedAt } : {}),
            },
        })
    } catch (error) {
        console.error("QuickBooks status route error:", error)
        return NextResponse.json(
            { error: { message: "Failed to load QuickBooks status", code: 500 } },
            { status: 500 }
        )
    }
}

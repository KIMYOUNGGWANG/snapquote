import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient, ensureProfileExists } from "@/lib/server/stripe-connect"
import {
    exchangeQuickBooksCode,
    hasQuickBooksAccess,
    resolveQuickBooksPlanTier,
} from "@/lib/server/quickbooks"
import { quickBooksConnectTokenSchema } from "@/lib/validation/api-schemas"

export async function POST(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `quickbooks-connect-token:${auth.userId}:${ip}`,
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

    const parsed = quickBooksConnectTokenSchema.safeParse(body)
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

    const { planTier, error } = await resolveQuickBooksPlanTier(supabase, auth.userId)
    if (error) {
        return NextResponse.json(
            { error: { message: error, code: 500 } },
            { status: 500 }
        )
    }

    if (!hasQuickBooksAccess(planTier)) {
        return NextResponse.json(
            { error: "QuickBooks sync requires a Pro or Team plan." },
            { status: 402 }
        )
    }

    try {
        const result = await exchangeQuickBooksCode({
            code: parsed.data.code,
            realmId: parsed.data.realmId,
            userId: auth.userId,
        })

        if (!result.ok) {
            return NextResponse.json(
                { error: { message: result.error, code: result.status } },
                { status: result.status }
            )
        }

        return NextResponse.json({
            ok: true,
            realmId: result.connection.realm_id,
            connectedAt: result.connection.connected_at,
        })
    } catch (error) {
        console.error("QuickBooks token route error:", error)
        return NextResponse.json(
            { error: { message: "Failed to connect QuickBooks", code: 500 } },
            { status: 500 }
        )
    }
}

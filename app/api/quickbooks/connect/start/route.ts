import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient, ensureProfileExists } from "@/lib/server/stripe-connect"
import {
    createQuickBooksAuthUrl,
    hasQuickBooksAccess,
    resolveQuickBooksPlanTier,
} from "@/lib/server/quickbooks"
import { quickBooksConnectStartSchema } from "@/lib/validation/api-schemas"

function normalizeReturnPath(value: string | undefined): string {
    if (typeof value !== "string") return "/history"
    const trimmed = value.trim()
    if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
        return "/history"
    }
    return trimmed.slice(0, 200)
}

export async function POST(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `quickbooks-connect-start:${auth.userId}:${ip}`,
        limit: 20,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    let body: unknown = {}
    try {
        body = await req.json().catch(() => ({}))
    } catch {
        return NextResponse.json(
            { error: { message: "Invalid request payload", code: 400 } },
            { status: 400 }
        )
    }

    const parsed = quickBooksConnectStartSchema.safeParse(body)
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

    const authUrl = createQuickBooksAuthUrl({
        userId: auth.userId,
        returnPath: normalizeReturnPath(parsed.data.returnPath),
    })

    if ("error" in authUrl) {
        return NextResponse.json(
            { error: { message: authUrl.error, code: 500 } },
            { status: 500 }
        )
    }

    return NextResponse.json({
        ok: true,
        url: authUrl.url,
        planTier,
    })
}

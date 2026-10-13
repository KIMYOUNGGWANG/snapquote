import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import { getCustomerPortalQuote } from "@/lib/server/customer-portal"

export async function GET(req: Request, context: { params: Promise<{ token: string }> }) {
    const { token } = await context.params
    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `customer-quote-view:${token}:${ip}`,
        limit: 80,
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

    const result = await getCustomerPortalQuote(supabase, token, { markViewed: true })
    if (!result.ok) {
        return NextResponse.json(
            { error: { message: result.error, code: result.status } },
            { status: result.status }
        )
    }

    return NextResponse.json({
        ok: true,
        quote: result.data,
    })
}

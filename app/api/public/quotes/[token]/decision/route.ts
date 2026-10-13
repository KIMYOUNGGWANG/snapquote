import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import { recordCustomerPortalDecision } from "@/lib/server/customer-portal"
import { customerPortalDecisionSchema } from "@/lib/validation/api-schemas"

export async function POST(req: Request, context: { params: Promise<{ token: string }> }) {
    const { token } = await context.params
    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `customer-quote-decision:${token}:${ip}`,
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

    const parsed = customerPortalDecisionSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: { message: "Invalid customer quote decision", code: 400 } },
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

    const result = await recordCustomerPortalDecision(supabase, token, parsed.data)
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

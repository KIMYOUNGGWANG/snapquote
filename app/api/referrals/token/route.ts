import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { createAuthedSupabaseClient, parseBearerToken } from "@/lib/server/supabase-auth"
import { getOrCreateReferralToken } from "@/lib/server/referrals"

export async function POST(req: Request) {
    const ip = getClientIp(req)
    const ipRateLimit = await checkRateLimit({
        key: `referral-token:${ip}`,
        limit: 60,
        windowMs: 10 * 60 * 1000,
    })

    if (!ipRateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    const token = parseBearerToken(req)
    if (!token) {
        return NextResponse.json(
            { error: { message: "Unauthorized", code: 401 } },
            { status: 401 }
        )
    }

    const supabase = createAuthedSupabaseClient(token)
    if (!supabase) {
        return NextResponse.json(
            { error: { message: "Supabase is not configured", code: 500 } },
            { status: 500 }
        )
    }

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
        return NextResponse.json(
            { error: { message: "Unauthorized", code: 401 } },
            { status: 401 }
        )
    }

    const userRateLimit = await checkRateLimit({
        key: `referral-token:${user.id}:${ip}`,
        limit: 20,
        windowMs: 10 * 60 * 1000,
    })

    if (!userRateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    try {
        await supabase
            .from("profiles")
            .upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true })

        const result = await getOrCreateReferralToken(supabase, user.id)
        if (result.error || !result.token) {
            console.error("Failed to create referral token:", result.error)
            return NextResponse.json(
                { error: { message: result.error || "Failed to create referral token", code: 500 } },
                { status: 500 }
            )
        }

        return NextResponse.json({ ok: true, token: result.token })
    } catch (error) {
        console.error("Referral token route error:", error)
        return NextResponse.json(
            { error: { message: "Failed to create referral token", code: 500 } },
            { status: 500 }
        )
    }
}

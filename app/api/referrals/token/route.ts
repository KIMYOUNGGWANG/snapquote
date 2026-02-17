import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { createAuthedSupabaseClient, parseBearerToken } from "@/lib/server/supabase-auth"

const TOKEN_LENGTH = 12

function generateReferralToken(): string {
    return crypto.randomUUID().replace(/-/g, "").slice(0, TOKEN_LENGTH)
}

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

        const { data: existing } = await supabase
            .from("referral_tokens")
            .select("token")
            .eq("user_id", user.id)
            .maybeSingle()

        if (existing?.token) {
            return NextResponse.json({ ok: true, token: existing.token })
        }

        for (let attempt = 0; attempt < 5; attempt += 1) {
            const nextToken = generateReferralToken()
            const { data: inserted, error: insertError } = await supabase
                .from("referral_tokens")
                .insert({
                    user_id: user.id,
                    token: nextToken,
                })
                .select("token")
                .single()

            if (!insertError && inserted?.token) {
                return NextResponse.json({ ok: true, token: inserted.token })
            }

            // Unique race on user_id or token. Retry by re-reading first.
            if (insertError?.code === "23505") {
                const { data: retriedExisting } = await supabase
                    .from("referral_tokens")
                    .select("token")
                    .eq("user_id", user.id)
                    .maybeSingle()

                if (retriedExisting?.token) {
                    return NextResponse.json({ ok: true, token: retriedExisting.token })
                }

                continue
            }

            console.error("Failed to insert referral token:", insertError)
            return NextResponse.json(
                { error: { message: "Failed to create referral token", code: 500 } },
                { status: 500 }
            )
        }

        return NextResponse.json(
            { error: { message: "Failed to create referral token", code: 500 } },
            { status: 500 }
        )
    } catch (error) {
        console.error("Referral token route error:", error)
        return NextResponse.json(
            { error: { message: "Failed to create referral token", code: 500 } },
            { status: 500 }
        )
    }
}

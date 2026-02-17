import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"

type ReferralEventName = "landing_visit" | "quote_share_click" | "signup_start"

const TOKEN_PATTERN = /^[a-z0-9]{8,32}$/
const ALLOWED_EVENTS: Set<ReferralEventName> = new Set([
    "landing_visit",
    "quote_share_click",
    "signup_start",
])

function asTrimmedString(value: unknown, maxLength: number): string {
    if (typeof value !== "string") return ""
    return value.trim().slice(0, maxLength)
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {}

    const metadata = value as Record<string, unknown>
    const serialized = JSON.stringify(metadata)
    if (serialized.length > 4000) {
        return {
            truncated: true,
            size: serialized.length,
        }
    }

    return metadata
}

export async function POST(req: Request) {
    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `referral-track:${ip}`,
        limit: 120,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        return NextResponse.json(
            { error: { message: "Supabase is not configured", code: 500 } },
            { status: 500 }
        )
    }

    try {
        const body = await req.json()
        const token = asTrimmedString(body?.token, 32).toLowerCase()
        const eventName = asTrimmedString(body?.event, 40) as ReferralEventName
        const source = asTrimmedString(body?.source, 40)
        const metadata = normalizeMetadata(body?.metadata)

        if (!TOKEN_PATTERN.test(token)) {
            return NextResponse.json(
                { error: { message: "Invalid token", code: 400 } },
                { status: 400 }
            )
        }

        if (!ALLOWED_EVENTS.has(eventName)) {
            return NextResponse.json(
                { error: { message: "Invalid event", code: 400 } },
                { status: 400 }
            )
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        )

        const { error } = await supabase.from("referral_events").insert({
            token,
            event_name: eventName,
            source: source || null,
            metadata,
        })

        // Do not leak token existence details.
        if (error && error.code !== "23503") {
            console.error("Failed to insert referral event:", error)
            return NextResponse.json(
                { error: { message: "Failed to track referral event", code: 500 } },
                { status: 500 }
            )
        }

        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error("Referral track route error:", error)
        return NextResponse.json(
            { error: { message: "Invalid request payload", code: 400 } },
            { status: 400 }
        )
    }
}

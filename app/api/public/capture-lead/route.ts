import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { createClient } from "@supabase/supabase-js"

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const RATE_LIMIT_MAX = 5 // 5 submissions per hour per IP
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getServiceClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("Supabase configuration missing")
    }

    return createClient(supabaseUrl, serviceRoleKey)
}

export async function POST(request: Request) {
    try {
        const clientIp = getClientIp(request)

        const rateLimitResult = await checkRateLimit({
            key: `capture-lead:${clientIp}`,
            limit: RATE_LIMIT_MAX,
            windowMs: RATE_LIMIT_WINDOW_MS,
        })

        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                { error: "Too many submissions. Please try again later." },
                { status: 429 }
            )
        }

        const body = await request.json().catch(() => null)
        if (!body || typeof body !== "object") {
            return NextResponse.json(
                { error: "Invalid request body" },
                { status: 400 }
            )
        }

        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
        if (!email || !EMAIL_REGEX.test(email)) {
            return NextResponse.json(
                { error: "Please enter a valid email address" },
                { status: 400 }
            )
        }

        const source = typeof body.source === "string"
            ? body.source.trim().slice(0, 64)
            : "free_estimator_v1"

        const supabase = getServiceClient()

        const { error: insertError } = await supabase
            .from("leads")
            .upsert(
                { email, source },
                { onConflict: "email" }
            )

        if (insertError) {
            console.error("[capture-lead] Supabase insert error:", insertError.message)
            return NextResponse.json(
                { error: "Failed to save. Please try again." },
                { status: 500 }
            )
        }

        return NextResponse.json({
            ok: true,
            message: "Thank you! Check your inbox for the full breakdown.",
        })
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Internal server error"
        console.error("[capture-lead] Error:", errorMessage)
        return NextResponse.json(
            { error: "Something went wrong. Please try again." },
            { status: 500 }
        )
    }
}

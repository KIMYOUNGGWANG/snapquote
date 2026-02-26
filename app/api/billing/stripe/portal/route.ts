import { NextResponse } from "next/server"
import Stripe from "stripe"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"

export async function POST(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `billing-portal:${auth.userId}:${ip}`,
        limit: 20,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()

    if (!stripeSecretKey || !appUrl) {
        return NextResponse.json(
            { error: { message: "Billing is not configured", code: 500 } },
            { status: 500 }
        )
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json(
            { error: { message: "Supabase service configuration is missing", code: 500 } },
            { status: 500 }
        )
    }

    try {
        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("stripe_customer_id")
            .eq("id", auth.userId)
            .maybeSingle()

        if (profileError) {
            return NextResponse.json(
                { error: { message: "Failed to load billing profile", code: 500 } },
                { status: 500 }
            )
        }

        const customerId =
            typeof profile?.stripe_customer_id === "string" ? profile.stripe_customer_id.trim() : ""

        if (!customerId) {
            return NextResponse.json(
                { error: { message: "Billing customer is not linked", code: 403 } },
                { status: 403 }
            )
        }

        const stripe = new Stripe(stripeSecretKey, {
            apiVersion: "2025-12-15.clover",
        })

        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: new URL("/pricing", appUrl).toString(),
        })

        return NextResponse.json({ url: session.url })
    } catch (error: any) {
        console.error("Stripe Billing portal error:", error)

        const stripeType = typeof error?.type === "string" ? error.type : ""
        const status = stripeType === "StripeAuthenticationError" ? 401 : 500
        const message = status === 401
            ? "Stripe authentication failed"
            : "Failed to create billing portal session"

        return NextResponse.json(
            { error: { message, code: status } },
            { status }
        )
    }
}

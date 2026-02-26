import { NextResponse } from "next/server"
import Stripe from "stripe"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import {
    createServiceSupabaseClient,
    getStripeConnectProfile,
} from "@/lib/server/stripe-connect"

export async function POST(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `stripe-connect-dashboard-link:${ip}`,
        limit: 20,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: "Too many requests. Please try again later." },
            { status: 429 }
        )
    }

    if (!process.env.STRIPE_SECRET_KEY) {
        return NextResponse.json(
            { error: "Stripe is not configured. Please add STRIPE_SECRET_KEY." },
            { status: 500 }
        )
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json(
            { error: "Supabase service configuration is missing." },
            { status: 500 }
        )
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2025-12-15.clover",
    })

    try {
        const { data: profile, error: profileError } = await getStripeConnectProfile(supabase, auth.userId)
        if (profileError) {
            return NextResponse.json(
                { error: "Failed to load Stripe Connect profile." },
                { status: 500 }
            )
        }

        const accountId = profile?.stripe_account_id?.trim() || ""
        if (!accountId) {
            return NextResponse.json(
                { error: "Stripe Connect account is not linked yet." },
                { status: 403 }
            )
        }

        const link = await stripe.accounts.createLoginLink(accountId)
        return NextResponse.json({ url: link.url })
    } catch (error: any) {
        console.error("Stripe dashboard link error:", error)

        if (error.type === "StripeAuthenticationError") {
            return NextResponse.json(
                { error: "Invalid Stripe API key. Please check your configuration." },
                { status: 401 }
            )
        }

        return NextResponse.json(
            { error: error.message || "Failed to create Stripe dashboard link." },
            { status: 500 }
        )
    }
}

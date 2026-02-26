import { NextResponse } from "next/server"
import Stripe from "stripe"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import {
    createServiceSupabaseClient,
    getStripeConnectProfile,
    upsertStripeConnectProfile,
} from "@/lib/server/stripe-connect"

function toAccountFlags(account: Stripe.Account | Stripe.DeletedAccount) {
    if ("deleted" in account && account.deleted) {
        return {
            detailsSubmitted: false,
            chargesEnabled: false,
            payoutsEnabled: false,
        }
    }

    return {
        detailsSubmitted: Boolean(account.details_submitted),
        chargesEnabled: Boolean(account.charges_enabled),
        payoutsEnabled: Boolean(account.payouts_enabled),
    }
}

export async function GET(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `stripe-connect-status:${ip}`,
        limit: 60,
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
            return NextResponse.json({
                connected: false,
            })
        }

        const account = await stripe.accounts.retrieve(accountId)
        const flags = toAccountFlags(account)

        await upsertStripeConnectProfile(supabase, auth.userId, {
            stripe_account_id: accountId,
            stripe_details_submitted: flags.detailsSubmitted,
            stripe_charges_enabled: flags.chargesEnabled,
            stripe_payouts_enabled: flags.payoutsEnabled,
            stripe_onboarded_at: flags.detailsSubmitted && flags.chargesEnabled
                ? (profile?.stripe_onboarded_at || new Date().toISOString())
                : profile?.stripe_onboarded_at || null,
        })

        return NextResponse.json({
            connected: true,
            accountId,
            detailsSubmitted: flags.detailsSubmitted,
            chargesEnabled: flags.chargesEnabled,
            payoutsEnabled: flags.payoutsEnabled,
        })
    } catch (error: any) {
        console.error("Stripe Connect status error:", error)

        if (error.type === "StripeAuthenticationError") {
            return NextResponse.json(
                { error: "Invalid Stripe API key. Please check your configuration." },
                { status: 401 }
            )
        }

        return NextResponse.json(
            { error: error.message || "Failed to load Stripe Connect status." },
            { status: 500 }
        )
    }
}

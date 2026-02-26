import { NextResponse } from "next/server"
import Stripe from "stripe"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import {
    createServiceSupabaseClient,
    ensureProfileExists,
    getStripeConnectProfile,
    upsertStripeConnectProfile,
} from "@/lib/server/stripe-connect"

function getAppUrl(): string {
    const raw = process.env.NEXT_PUBLIC_APP_URL || "https://snapquote.app"
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

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

async function createExpressAccount(stripe: Stripe, userId: string) {
    return stripe.accounts.create({
        type: "express",
        country: (process.env.STRIPE_CONNECT_DEFAULT_COUNTRY || "CA").toUpperCase(),
        capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
        },
        metadata: {
            userId,
        },
    })
}

export async function POST(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `stripe-connect-onboard:${ip}`,
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
        await ensureProfileExists(supabase, auth.userId)

        const { data: profile, error: profileError } = await getStripeConnectProfile(supabase, auth.userId)
        if (profileError) {
            return NextResponse.json(
                { error: "Failed to load Stripe Connect profile." },
                { status: 500 }
            )
        }

        let accountId = profile?.stripe_account_id?.trim() || ""
        let account: Stripe.Account | Stripe.DeletedAccount

        if (accountId) {
            account = await stripe.accounts.retrieve(accountId)
            if ("deleted" in account && account.deleted) {
                account = await createExpressAccount(stripe, auth.userId)
                accountId = account.id
            }
        } else {
            account = await createExpressAccount(stripe, auth.userId)
            accountId = account.id
        }

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

        const appUrl = getAppUrl()
        const accountLink = await stripe.accountLinks.create({
            account: accountId,
            refresh_url: `${appUrl}/profile?stripe=refresh`,
            return_url: `${appUrl}/profile?stripe=return`,
            type: "account_onboarding",
        })

        return NextResponse.json({
            url: accountLink.url,
            accountId,
        })
    } catch (error: any) {
        console.error("Stripe Connect onboarding error:", error)

        if (error.type === "StripeAuthenticationError") {
            return NextResponse.json(
                { error: "Invalid Stripe API key. Please check your configuration." },
                { status: 401 }
            )
        }

        return NextResponse.json(
            { error: error.message || "Failed to create Stripe onboarding link." },
            { status: 500 }
        )
    }
}

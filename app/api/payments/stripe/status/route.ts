import { NextResponse } from "next/server"
import Stripe from "stripe"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeQueryValue(value: string | null, maxLength = 255): string {
    if (!value) return ""
    return value.trim().slice(0, maxLength)
}

async function resolveSessionMetadata(stripe: Stripe, session: Stripe.Checkout.Session) {
    let estimateId = session.metadata?.estimateId?.trim() || ""
    let estimateNumber = session.metadata?.estimateNumber?.trim() || ""
    let userId = session.metadata?.userId?.trim() || ""

    if ((!estimateId || !estimateNumber) && session.payment_intent) {
        try {
            const paymentIntent =
                typeof session.payment_intent === "string"
                    ? await stripe.paymentIntents.retrieve(session.payment_intent)
                    : session.payment_intent

            estimateId = estimateId || paymentIntent.metadata?.estimateId?.trim() || ""
            estimateNumber = estimateNumber || paymentIntent.metadata?.estimateNumber?.trim() || ""
            userId = userId || paymentIntent.metadata?.userId?.trim() || ""
        } catch (error) {
            console.error("Failed to resolve payment intent metadata:", error)
        }
    }

    return { estimateId, estimateNumber, userId }
}

export async function GET(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `payments-stripe-status:${ip}`,
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

    const url = new URL(req.url)
    const paymentLinkId = normalizeQueryValue(url.searchParams.get("paymentLinkId"))
    const estimateId = normalizeQueryValue(url.searchParams.get("estimateId"), 80)
    const estimateNumber = normalizeQueryValue(url.searchParams.get("estimateNumber"), 80)

    if (!paymentLinkId) {
        return NextResponse.json(
            { error: "paymentLinkId is required" },
            { status: 400 }
        )
    }

    if (estimateId && !UUID_PATTERN.test(estimateId)) {
        return NextResponse.json(
            { error: "Invalid estimateId" },
            { status: 400 }
        )
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2025-12-15.clover",
    })

    try {
        let hasMore = true
        let cursor: string | undefined
        let scanned = 0
        const MAX_SCANNED_SESSIONS = 300

        while (hasMore && scanned < MAX_SCANNED_SESSIONS) {
            const page = await stripe.checkout.sessions.list({
                payment_link: paymentLinkId,
                status: "complete",
                limit: 100,
                ...(cursor ? { starting_after: cursor } : {}),
            })

            if (page.data.length === 0) break

            for (const session of page.data) {
                if (scanned >= MAX_SCANNED_SESSIONS) break
                scanned += 1

                if (session.payment_status !== "paid") continue

                const metadata = await resolveSessionMetadata(stripe, session)

                if (!metadata.userId || metadata.userId !== auth.userId) continue
                if (estimateId && metadata.estimateId !== estimateId) continue
                if (estimateNumber && metadata.estimateNumber !== estimateNumber) continue

                return NextResponse.json({
                    ok: true,
                    paid: true,
                    checkoutSessionId: session.id,
                    paidAt: session.created
                        ? new Date(session.created * 1000).toISOString()
                        : undefined,
                    estimateId: metadata.estimateId || undefined,
                    estimateNumber: metadata.estimateNumber || undefined,
                })
            }

            hasMore = page.has_more
            cursor = page.data[page.data.length - 1]?.id
        }

        return NextResponse.json({
            ok: true,
            paid: false,
        })
    } catch (error: any) {
        console.error("Stripe payment status lookup error:", error)

        if (error.type === "StripeAuthenticationError") {
            return NextResponse.json(
                { error: "Invalid Stripe API key. Please check your configuration." },
                { status: 401 }
            )
        }

        return NextResponse.json(
            { error: error.message || "Failed to check payment status" },
            { status: 500 }
        )
    }
}

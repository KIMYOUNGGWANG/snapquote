import { NextResponse } from "next/server"
import Stripe from "stripe"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `create-payment-link:${ip}`,
        limit: 30,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: "Too many requests. Please try again later." },
            { status: 429 }
        )
    }

    // Initialize Stripe lazily to avoid build-time errors
    if (!process.env.STRIPE_SECRET_KEY) {
        return NextResponse.json(
            { error: "Stripe is not configured. Please add STRIPE_SECRET_KEY." },
            { status: 500 }
        )
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2025-12-15.clover",
    })

    try {
        const { amount, customerName, estimateNumber, estimateId } = await req.json()
        const normalizedAmount = Number(amount)
        const safeCustomerName = typeof customerName === "string" ? customerName.trim().slice(0, 120) : ""
        const safeEstimateNumber = typeof estimateNumber === "string" ? estimateNumber.trim().slice(0, 80) : ""
        const safeEstimateId = typeof estimateId === "string" ? estimateId.trim().slice(0, 80) : ""

        // Validate amount
        if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0 || normalizedAmount > 500000) {
            return NextResponse.json(
                { error: "Invalid amount" },
                { status: 400 }
            )
        }

        if (safeEstimateId && !UUID_PATTERN.test(safeEstimateId)) {
            return NextResponse.json(
                { error: "Invalid estimateId" },
                { status: 400 }
            )
        }

        // Convert to cents (Stripe uses smallest currency unit)
        const amountInCents = Math.round(normalizedAmount * 100)
        const metadata = {
            estimateId: safeEstimateId,
            estimateNumber: safeEstimateNumber,
            userId: auth.userId,
        }

        // Create a Payment Link with dynamic pricing
        const paymentLink = await stripe.paymentLinks.create({
            metadata,
            payment_intent_data: {
                metadata,
            },
            line_items: [
                {
                    price_data: {
                        currency: "cad",
                        product_data: {
                            name: safeEstimateNumber
                                ? `Estimate Payment - ${safeEstimateNumber}`
                                : "Estimate Payment",
                            description: safeCustomerName
                                ? `Service for ${safeCustomerName}`
                                : "Professional service payment",
                        },
                        unit_amount: amountInCents,
                    },
                    quantity: 1,
                },
            ],
            after_completion: {
                type: "redirect",
                redirect: {
                    url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://snapquote.app'}/payment-success`,
                },
            },
        })

        return NextResponse.json({
            url: paymentLink.url,
            id: paymentLink.id,
        })
    } catch (error: any) {
        console.error("Stripe Payment Link error:", error)

        // Handle Stripe-specific errors
        if (error.type === 'StripeAuthenticationError') {
            return NextResponse.json(
                { error: "Invalid Stripe API key. Please check your configuration." },
                { status: 401 }
            )
        }

        return NextResponse.json(
            { error: error.message || "Failed to create payment link" },
            { status: 500 }
        )
    }
}

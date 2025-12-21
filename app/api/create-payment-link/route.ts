import { NextResponse } from "next/server"
import Stripe from "stripe"

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-12-15.clover",
})

export async function POST(req: Request) {
    try {
        const { amount, customerName, estimateNumber } = await req.json()

        // Validate amount
        if (!amount || amount <= 0) {
            return NextResponse.json(
                { error: "Invalid amount" },
                { status: 400 }
            )
        }

        // Convert to cents (Stripe uses smallest currency unit)
        const amountInCents = Math.round(amount * 100)

        // Create a Payment Link with dynamic pricing
        const paymentLink = await stripe.paymentLinks.create({
            line_items: [
                {
                    price_data: {
                        currency: "cad",
                        product_data: {
                            name: estimateNumber
                                ? `Estimate Payment - ${estimateNumber}`
                                : "Estimate Payment",
                            description: customerName
                                ? `Service for ${customerName}`
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

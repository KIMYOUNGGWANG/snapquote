import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
    // Validate required environment variables
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
        console.error('Missing Stripe configuration')
        return new NextResponse('Server configuration error', { status: 500 })
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('Missing Supabase configuration')
        return new NextResponse('Server configuration error', { status: 500 })
    }

    // Initialize clients lazily
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2025-12-15.clover',
    })

    // NEED TO USE SERVICE_ROLE_KEY TO BYPASS RLS FOR WEBHOOK UPDATES
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET

    const body = await req.text()
    const sig = req.headers.get('stripe-signature') as string

    let event: Stripe.Event

    try {
        if (!sig || !endpointSecret) {
            return new NextResponse('Webhook Error: Missing signature or secret', { status: 400 })
        }
        event = stripe.webhooks.constructEvent(body, sig, endpointSecret)
    } catch (err: any) {
        console.error(`Webhook signature verification failed.`, err.message)
        return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 })
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session

        // The payment link automatically creates a session.
        // We look for metadata passed from the payment link.
        // Logic:
        // 1. Check if metadata.estimateId exists
        // 2. Update Supabase

        const estimateId = session.metadata?.estimateId

        if (estimateId) {
            console.log(`💰 Payment succeeded for estimate: ${estimateId}`)

            const { error } = await supabase
                .from('estimates')
                .update({ status: 'paid' })
                .eq('id', estimateId)

            if (error) {
                console.error('Failed to update estimate status:', error)
                return new NextResponse('Database Error', { status: 500 })
            }
        } else {
            console.warn('⚠️ No estimateId found in session metadata')
        }
    }

    return new NextResponse('Received', { status: 200 })
}

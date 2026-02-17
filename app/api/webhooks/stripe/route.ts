import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { recordOpsAlert } from '@/lib/ops-alerts'

export async function POST(req: Request) {
    // Validate required environment variables
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
        console.error('Missing Stripe configuration')
        await recordOpsAlert({
            source: 'stripe_webhook',
            severity: 'error',
            alertKey: 'stripe_webhook_missing_stripe_config',
            message: 'Missing Stripe configuration for webhook handler',
            context: {
                hasSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
                hasWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
            },
        })
        return new NextResponse('Server configuration error', { status: 500 })
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('Missing Supabase configuration')
        await recordOpsAlert({
            source: 'stripe_webhook',
            severity: 'error',
            alertKey: 'stripe_webhook_missing_supabase_config',
            message: 'Missing Supabase service configuration for webhook handler',
            context: {
                hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
                hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
            },
        })
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
            await recordOpsAlert({
                source: 'stripe_webhook',
                severity: 'warning',
                alertKey: 'stripe_webhook_missing_signature',
                message: 'Stripe webhook request missing signature or endpoint secret',
                context: {
                    hasSignature: Boolean(sig),
                    hasEndpointSecret: Boolean(endpointSecret),
                },
            })
            return new NextResponse('Webhook Error: Missing signature or secret', { status: 400 })
        }
        event = stripe.webhooks.constructEvent(body, sig, endpointSecret)
    } catch (err: any) {
        console.error(`Webhook signature verification failed.`, err.message)
        await recordOpsAlert({
            source: 'stripe_webhook',
            severity: 'warning',
            alertKey: 'stripe_webhook_signature_verification_failed',
            message: 'Stripe webhook signature verification failed',
            context: { error: err.message },
        })
        return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 })
    }

    if (
        event.type === 'checkout.session.completed'
        || event.type === 'checkout.session.async_payment_succeeded'
    ) {
        const session = event.data.object as Stripe.Checkout.Session

        // The payment link automatically creates a session.
        // We look for metadata passed from the payment link.
        // Logic:
        // 1. Check if metadata.estimateId exists
        // 2. Update Supabase

        let estimateId = session.metadata?.estimateId?.trim() || ''
        let estimateNumber = session.metadata?.estimateNumber?.trim() || ''

        // Fallback: some flows preserve metadata on payment_intent instead of session metadata.
        if ((!estimateId || !estimateNumber) && typeof session.payment_intent === 'string') {
            try {
                const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent)
                estimateId = estimateId || paymentIntent.metadata?.estimateId?.trim() || ''
                estimateNumber = estimateNumber || paymentIntent.metadata?.estimateNumber?.trim() || ''
            } catch (error) {
                console.error('Failed to retrieve payment_intent metadata:', error)
            }
        }

        let targetEstimateId = estimateId

        // Fallback: find latest estimate by estimate number when ID is not available.
        if (!targetEstimateId && estimateNumber) {
            const { data: estimateByNumber, error: findError } = await supabase
                .from('estimates')
                .select('id')
                .eq('estimate_number', estimateNumber)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (findError) {
                console.error('Failed to find estimate by estimate_number:', findError)
                await recordOpsAlert({
                    source: 'stripe_webhook',
                    severity: 'error',
                    alertKey: 'stripe_webhook_estimate_lookup_failed',
                    message: 'Failed to find estimate by estimate_number during webhook handling',
                    context: {
                        eventId: event.id,
                        estimateNumber,
                        error: findError.message,
                    },
                })
                return new NextResponse('Database Error', { status: 500 })
            }

            targetEstimateId = estimateByNumber?.id || ''
        }

        if (!targetEstimateId) {
            console.warn('⚠️ No estimateId/estimateNumber found for paid session')
            await recordOpsAlert({
                source: 'stripe_webhook',
                severity: 'warning',
                alertKey: 'stripe_webhook_missing_estimate_reference',
                message: 'Paid checkout session missing estimate reference metadata',
                context: {
                    eventId: event.id,
                    sessionId: session.id,
                },
            })
            return new NextResponse('Received', { status: 200 })
        }

        const { data: targetEstimate, error: estimateFetchError } = await supabase
            .from('estimates')
            .select('id, user_id, estimate_number, status')
            .eq('id', targetEstimateId)
            .maybeSingle()

        if (estimateFetchError) {
            console.error('Failed to fetch target estimate for payment update:', estimateFetchError)
            await recordOpsAlert({
                source: 'stripe_webhook',
                severity: 'error',
                alertKey: 'stripe_webhook_target_estimate_fetch_failed',
                message: 'Failed to load target estimate before payment status update',
                context: {
                    eventId: event.id,
                    targetEstimateId,
                    error: estimateFetchError.message,
                },
            })
            return new NextResponse('Database Error', { status: 500 })
        }

        if (!targetEstimate) {
            console.warn(`⚠️ Target estimate not found: ${targetEstimateId}`)
            await recordOpsAlert({
                source: 'stripe_webhook',
                severity: 'warning',
                alertKey: 'stripe_webhook_target_estimate_not_found',
                message: 'Target estimate was not found during webhook handling',
                context: {
                    eventId: event.id,
                    targetEstimateId,
                },
            })
            return new NextResponse('Received', { status: 200 })
        }

        console.log(`💰 Payment succeeded for estimate: ${targetEstimateId}`)

        let statusTransitioned = false

        const { data: updatedEstimate, error } = await supabase
            .from('estimates')
            .update({ status: 'paid' })
            .eq('id', targetEstimateId)
            .neq('status', 'paid')
            .select('id')
            .maybeSingle()

        if (error) {
            console.error('Failed to update estimate status:', error)
            await recordOpsAlert({
                source: 'stripe_webhook',
                severity: 'error',
                alertKey: 'stripe_webhook_status_update_failed',
                message: 'Failed to update estimate status to paid',
                context: {
                    eventId: event.id,
                    targetEstimateId,
                    error: error.message,
                },
            })
            return new NextResponse('Database Error', { status: 500 })
        }

        statusTransitioned = Boolean(updatedEstimate?.id)

        // Non-blocking analytics event emit for payment conversion tracking.
        const { error: analyticsError } = await supabase
            .from('analytics_events')
            .upsert([{
                user_id: targetEstimate.user_id,
                event_name: 'payment_completed',
                estimate_id: targetEstimate.id,
                estimate_number: targetEstimate.estimate_number || estimateNumber || null,
                channel: 'stripe_webhook',
                external_id: event.id,
                metadata: {
                    stripe_event_type: event.type,
                    checkout_session_id: session.id,
                    status_transitioned: statusTransitioned,
                },
            }], {
                onConflict: 'external_id',
                ignoreDuplicates: true,
            })

        if (analyticsError) {
            console.error('Failed to insert payment_completed analytics event:', analyticsError)
            await recordOpsAlert({
                source: 'stripe_webhook',
                severity: 'warning',
                alertKey: 'stripe_webhook_analytics_insert_failed',
                message: 'Failed to insert payment_completed analytics event',
                context: {
                    eventId: event.id,
                    targetEstimateId,
                    error: analyticsError.message,
                },
            })
        }
    }

    return new NextResponse('Received', { status: 200 })
}

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { isEstimatePaidLike } from '@/lib/estimate-payment-state'
import { recordOpsAlert } from '@/lib/ops-alerts'
import { applyCheckoutSettlement } from '@/lib/server/estimate-settlement'
import { errorMessage } from '@/lib/unknown-fields'
import { resolveEstimateForSettlement } from '@/lib/server/payment-estimate-ownership'

function getCheckoutSessionPaidAt(session: Stripe.Checkout.Session): string {
    const createdUnixSeconds = typeof session.created === 'number' && Number.isFinite(session.created)
        ? session.created
        : Math.floor(Date.now() / 1000)

    return new Date(createdUnixSeconds * 1000).toISOString()
}

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
    } catch (err: unknown) {
        const message = errorMessage(err)
        console.error(`Webhook signature verification failed.`, message)
        await recordOpsAlert({
            source: 'stripe_webhook',
            severity: 'warning',
            alertKey: 'stripe_webhook_signature_verification_failed',
            message: 'Stripe webhook signature verification failed',
            context: { error: message },
        })
        return new NextResponse(`Webhook Error: ${message}`, { status: 400 })
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
        let userId = session.metadata?.userId?.trim() || ''

        // Fallback: some flows preserve metadata on payment_intent instead of session metadata.
        if ((!estimateId || !estimateNumber || !userId) && typeof session.payment_intent === 'string') {
            try {
                const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent)
                estimateId = estimateId || paymentIntent.metadata?.estimateId?.trim() || ''
                estimateNumber = estimateNumber || paymentIntent.metadata?.estimateNumber?.trim() || ''
                userId = userId || paymentIntent.metadata?.userId?.trim() || ''
            } catch (error) {
                console.error('Failed to retrieve payment_intent metadata:', error)
            }
        }

        const settlementResolution = await resolveEstimateForSettlement(supabase, {
            estimateId,
            estimateNumber,
            userId,
        })
        if (!settlementResolution.ok && settlementResolution.reason === 'lookup_error') {
            console.error('Failed to fetch target estimate for payment update:', settlementResolution.message)
            await recordOpsAlert({
                source: 'stripe_webhook',
                severity: 'error',
                alertKey: 'stripe_webhook_target_estimate_fetch_failed',
                message: 'Failed to load target estimate before payment status update',
                context: {
                    eventId: event.id,
                    estimateId,
                    estimateNumber,
                    userId,
                    error: settlementResolution.message,
                },
            })
            return new NextResponse('Database Error', { status: 500 })
        }

        if (!settlementResolution.ok) {
            console.warn(`⚠️ Stripe settlement skipped: ${settlementResolution.reason}`)
            await recordOpsAlert({
                source: 'stripe_webhook',
                severity: 'warning',
                alertKey: `stripe_webhook_${settlementResolution.reason}`,
                message: 'Stripe webhook skipped settlement because metadata did not resolve to an owned estimate',
                context: {
                    eventId: event.id,
                    sessionId: session.id,
                    estimateId,
                    estimateNumber,
                    userId,
                    reason: settlementResolution.reason,
                },
            })
            return new NextResponse('Received', { status: 200 })
        }

        const targetEstimate = settlementResolution.estimate
        console.log(`💰 Payment succeeded for estimate: ${targetEstimate.id}`)

        const wasPaidLike = isEstimatePaidLike(targetEstimate)

        const settlement = await applyCheckoutSettlement(supabase, {
            estimate: {
                id: targetEstimate.id,
        user_id: targetEstimate.user_id,
                total_amount: targetEstimate.total_amount ?? null,
                amount_paid: targetEstimate.amount_paid ?? null,
                last_payment_session_id: targetEstimate.last_payment_session_id ?? null,
                status: targetEstimate.status ?? null,
                payment_completed_at: targetEstimate.payment_completed_at ?? null,
            },
            sessionId: session.id,
            amountTotalCents: typeof session.amount_total === 'number' ? session.amount_total : null,
            paymentStatus: session.payment_status ?? null,
            paidAt: getCheckoutSessionPaidAt(session),
        })

        if (!settlement.ok) {
            console.error('Failed to update estimate payment:', settlement.message)
            await recordOpsAlert({
                source: 'stripe_webhook',
                severity: 'error',
                alertKey: 'stripe_webhook_status_update_failed',
                message: 'Failed to record Stripe payment on estimate',
                context: {
                    eventId: event.id,
                    targetEstimateId: targetEstimate.id,
                    error: settlement.message,
                },
            })
            return new NextResponse('Database Error', { status: 500 })
        }

        // Async payment methods complete the session before the money arrives.
        if (session.payment_status !== 'paid') return new NextResponse('Received', { status: 200 })

        if (settlement.applied && !((targetEstimate.total_amount ?? 0) > 0)) {
            await recordOpsAlert({
                source: 'stripe_webhook',
                severity: 'warning',
                alertKey: 'stripe_settlement_missing_total',
                message: 'Paid Stripe session settled against an estimate without a total_amount',
                context: {
                    eventId: event.id,
                    sessionId: session.id,
                    targetEstimateId: targetEstimate.id,
                    totalAmount: targetEstimate.total_amount ?? null,
                },
            })
        }

        const statusTransitioned = settlement.applied && settlement.fullyPaid && !wasPaidLike

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
                    targetEstimateId: targetEstimate.id,
                    error: analyticsError.message,
                },
            })
        }
    }

    return new NextResponse('Received', { status: 200 })
}

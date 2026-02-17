import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { recordOpsAlert } from '@/lib/ops-alerts'

const DEFAULT_LOOKBACK_HOURS = 72
const MAX_LOOKBACK_HOURS = 24 * 30
const MAX_SCANNED_SESSIONS = 500

function getLookbackHours(req: Request): number {
    const raw = new URL(req.url).searchParams.get('lookbackHours')
    const parsed = Number(raw ?? DEFAULT_LOOKBACK_HOURS)

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_LOOKBACK_HOURS
    }

    return Math.min(MAX_LOOKBACK_HOURS, Math.floor(parsed))
}

function isAuthorized(req: Request): boolean {
    const secret = process.env.CRON_SECRET
    if (!secret) return false

    const bearer = req.headers.get('authorization')
    const headerSecret = req.headers.get('x-cron-secret')

    return bearer === `Bearer ${secret}` || headerSecret === secret
}

type ReconcileStats = {
    scanned: number
    paidSessions: number
    matched: number
    updated: number
    alreadyPaid: number
    missingMetadata: number
    missingEstimate: number
    errors: number
}

async function reconcilePaidSessions(req: Request) {
    if (!process.env.STRIPE_SECRET_KEY) {
        await recordOpsAlert({
            source: 'stripe_reconcile',
            severity: 'error',
            alertKey: 'stripe_reconcile_missing_stripe_secret',
            message: 'Missing STRIPE_SECRET_KEY for reconcile route',
        })
        return NextResponse.json({ error: 'Missing STRIPE_SECRET_KEY' }, { status: 500 })
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        await recordOpsAlert({
            source: 'stripe_reconcile',
            severity: 'error',
            alertKey: 'stripe_reconcile_missing_supabase_config',
            message: 'Missing Supabase service credentials for reconcile route',
            context: {
                hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
                hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
            },
        })
        return NextResponse.json({ error: 'Missing Supabase service credentials' }, { status: 500 })
    }
    if (!process.env.CRON_SECRET) {
        await recordOpsAlert({
            source: 'stripe_reconcile',
            severity: 'error',
            alertKey: 'stripe_reconcile_missing_cron_secret',
            message: 'Missing CRON_SECRET for reconcile route',
        })
        return NextResponse.json({ error: 'Missing CRON_SECRET' }, { status: 500 })
    }
    if (!isAuthorized(req)) {
        await recordOpsAlert({
            source: 'stripe_reconcile',
            severity: 'warning',
            alertKey: 'stripe_reconcile_unauthorized',
            message: 'Unauthorized access attempt on reconcile route',
            context: {
                hasAuthHeader: Boolean(req.headers.get('authorization')),
                hasCronHeader: Boolean(req.headers.get('x-cron-secret')),
            },
        })
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2025-12-15.clover',
    })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const lookbackHours = getLookbackHours(req)
    const sinceUnix = Math.floor((Date.now() - lookbackHours * 60 * 60 * 1000) / 1000)

    const stats: ReconcileStats = {
        scanned: 0,
        paidSessions: 0,
        matched: 0,
        updated: 0,
        alreadyPaid: 0,
        missingMetadata: 0,
        missingEstimate: 0,
        errors: 0,
    }

    let hasMore = true
    let cursor: string | undefined

    while (hasMore && stats.scanned < MAX_SCANNED_SESSIONS) {
        const page = await stripe.checkout.sessions.list({
            limit: 100,
            created: { gte: sinceUnix },
            status: 'complete',
            ...(cursor ? { starting_after: cursor } : {}),
        })

        if (page.data.length === 0) break

        for (const session of page.data) {
            if (stats.scanned >= MAX_SCANNED_SESSIONS) break
            stats.scanned += 1

            if (session.payment_status !== 'paid') continue
            stats.paidSessions += 1

            let estimateId = session.metadata?.estimateId?.trim() || ''
            let estimateNumber = session.metadata?.estimateNumber?.trim() || ''

            if (!estimateId || !estimateNumber) {
                try {
                    if (typeof session.payment_intent === 'string') {
                        const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent)
                        estimateId = estimateId || paymentIntent.metadata?.estimateId?.trim() || ''
                        estimateNumber = estimateNumber || paymentIntent.metadata?.estimateNumber?.trim() || ''
                    } else if (session.payment_intent && typeof session.payment_intent !== 'string') {
                        estimateId = estimateId || session.payment_intent.metadata?.estimateId?.trim() || ''
                        estimateNumber = estimateNumber || session.payment_intent.metadata?.estimateNumber?.trim() || ''
                    }
                } catch (error) {
                    stats.errors += 1
                    console.error('Stripe reconcile: failed to fetch payment intent metadata', error)
                }
            }

            if (!estimateId && !estimateNumber) {
                stats.missingMetadata += 1
                continue
            }

            let targetEstimateId = estimateId

            if (!targetEstimateId && estimateNumber) {
                const { data: estimateByNumber, error: findError } = await supabase
                    .from('estimates')
                    .select('id')
                    .eq('estimate_number', estimateNumber)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()

                if (findError) {
                    stats.errors += 1
                    console.error('Stripe reconcile: estimate lookup failed', findError)
                    continue
                }

                targetEstimateId = estimateByNumber?.id || ''
            }

            if (!targetEstimateId) {
                stats.missingEstimate += 1
                continue
            }

            const { data: targetEstimate, error: estimateError } = await supabase
                .from('estimates')
                .select('id, user_id, estimate_number')
                .eq('id', targetEstimateId)
                .maybeSingle()

            if (estimateError) {
                stats.errors += 1
                console.error('Stripe reconcile: failed to load target estimate', estimateError)
                continue
            }

            if (!targetEstimate) {
                stats.missingEstimate += 1
                continue
            }

            stats.matched += 1

            const { data: updatedRows, error: updateError } = await supabase
                .from('estimates')
                .update({ status: 'paid' })
                .eq('id', targetEstimate.id)
                .neq('status', 'paid')
                .select('id')

            if (updateError) {
                stats.errors += 1
                console.error('Stripe reconcile: status update failed', updateError)
                continue
            }

            if ((updatedRows?.length || 0) > 0) {
                stats.updated += 1
            } else {
                stats.alreadyPaid += 1
            }

            const { error: analyticsError } = await supabase
                .from('analytics_events')
                .upsert([{
                    user_id: targetEstimate.user_id,
                    event_name: 'payment_completed',
                    estimate_id: targetEstimate.id,
                    estimate_number: targetEstimate.estimate_number || estimateNumber || null,
                    channel: 'stripe_reconcile',
                    external_id: `reconcile:${session.id}`,
                    metadata: {
                        checkout_session_id: session.id,
                        status_transitioned: (updatedRows?.length || 0) > 0,
                    },
                }], {
                    onConflict: 'external_id',
                    ignoreDuplicates: true,
                })

            if (analyticsError) {
                stats.errors += 1
                console.error('Stripe reconcile: failed to insert payment_completed analytics event', analyticsError)
            }
        }

        hasMore = page.has_more
        cursor = page.data[page.data.length - 1]?.id
    }

    if (stats.errors > 0) {
        await recordOpsAlert({
            source: 'stripe_reconcile',
            severity: 'error',
            alertKey: 'stripe_reconcile_errors_detected',
            message: 'Stripe reconcile completed with processing errors',
            context: {
                lookbackHours,
                stats,
            },
        })
    }

    if (stats.missingMetadata > 0 || stats.missingEstimate > 0) {
        await recordOpsAlert({
            source: 'stripe_reconcile',
            severity: 'warning',
            alertKey: 'stripe_reconcile_reference_gaps',
            message: 'Stripe reconcile found sessions without complete estimate references',
            context: {
                lookbackHours,
                missingMetadata: stats.missingMetadata,
                missingEstimate: stats.missingEstimate,
                scanned: stats.scanned,
            },
        })
    }

    return NextResponse.json({
        ok: true,
        lookbackHours,
        capped: stats.scanned >= MAX_SCANNED_SESSIONS,
        ...stats,
    })
}

export async function GET(req: Request) {
    return reconcilePaidSessions(req)
}

export async function POST(req: Request) {
    return reconcilePaidSessions(req)
}

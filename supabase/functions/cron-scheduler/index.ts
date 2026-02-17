import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// This function scans for candidates for "Quote Chaser" and "Reputation Manager"
// It runs periodically (e.g., hourly) and inserts jobs into the job_queue.

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

const supabase = createClient(supabaseUrl, supabaseKey)

function getDelayHours(settings: any, stage: 1 | 2): number {
    if (stage === 1) {
        const explicit = Number(settings?.first_delay_hours)
        if (Number.isFinite(explicit) && explicit > 0) return explicit

        const legacyDays = Number(settings?.delay_days)
        if (Number.isFinite(legacyDays) && legacyDays > 0) return legacyDays * 24

        return 48
    }

    const explicit = Number(settings?.second_delay_hours)
    if (Number.isFinite(explicit) && explicit > 0) return explicit
    return 168
}

function getThresholdIso(hoursAgo: number): string {
    const threshold = new Date()
    threshold.setHours(threshold.getHours() - hoursAgo)
    return threshold.toISOString()
}

Deno.serve(async (req: Request) => {
    try {
        // Security: Verify cron secret header to prevent unauthorized access
        if (!CRON_SECRET) {
            return new Response(JSON.stringify({ error: 'CRON_SECRET is not configured' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            })
        }

        const authHeader = req.headers.get('Authorization')
        const cronHeader = req.headers.get('x-cron-secret')
        if (authHeader !== `Bearer ${CRON_SECRET}` && cronHeader !== CRON_SECRET) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            })
        }

        console.log('Cron Scheduler triggered')

        // 1. Fetch enabled automations
        const { data: activeAutomations, error: autoError } = await supabase
            .from('automations')
            .select('*')
            .eq('is_enabled', true)

        if (autoError) throw autoError

        const jobsCreated: string[] = []

        for (const automation of activeAutomations || []) {
            const { user_id, type, settings } = automation

            if (type === 'quote_chaser') {
                const firstDelayHours = getDelayHours(settings, 1)
                const secondDelayHours = Math.max(getDelayHours(settings, 2), firstDelayHours + 24)

                // Stage 1: first follow-up at ~48h (default)
                const stage1ThresholdIso = getThresholdIso(firstDelayHours)
                const { data: stage1Candidates, error: stage1Error } = await supabase
                    .from('estimates')
                    .select('*, profiles(business_name), clients(name, email, phone)')
                    .eq('user_id', user_id)
                    .eq('status', 'sent')
                    .is('first_followup_queued_at', null)
                    // Fallback to created_at for legacy rows where sent_at was never set.
                    .or(`sent_at.lt.${stage1ThresholdIso},and(sent_at.is.null,created_at.lt.${stage1ThresholdIso})`)

                if (stage1Error) {
                    console.error(`Error fetching stage1 candidates for user ${user_id}:`, stage1Error)
                    continue
                }

                for (const estimate of stage1Candidates || []) {
                    if (!estimate.clients?.email) {
                        await supabase
                            .from('analytics_events')
                            .upsert(
                                {
                                    user_id,
                                    event_name: 'followup_skipped_no_email',
                                    estimate_id: estimate.id,
                                    estimate_number: estimate.estimate_number,
                                    channel: 'automation',
                                    external_id: `followup_skip_no_email:${estimate.id}:stage1`,
                                    metadata: {
                                        automation: 'quote_chaser',
                                        stage: 1,
                                        reason: 'missing_client_email',
                                    },
                                },
                                { onConflict: 'external_id', ignoreDuplicates: true }
                            )
                        continue
                    }

                    const scheduledAt = new Date().toISOString()
                    const { error: jobError } = await supabase.from('job_queue').insert({
                        user_id,
                        task_type: 'email_followup',
                        payload: {
                            estimate_id: estimate.id,
                            estimate_number: estimate.estimate_number,
                            client_name: estimate.clients?.name,
                            client_email: estimate.clients?.email,
                            business_name: estimate.profiles?.business_name,
                            followup_stage: 1,
                        },
                        scheduled_for: scheduledAt,
                        max_attempts: 3,
                    })

                    if (!jobError) {
                        jobsCreated.push(`${estimate.id}:stage1`)
                        await supabase
                            .from('estimates')
                            .update({
                                first_followup_queued_at: scheduledAt,
                            })
                            .eq('id', estimate.id)
                    }
                }

                // Stage 2: second follow-up at ~7d (default), only if first follow-up was queued.
                const stage2ThresholdIso = getThresholdIso(secondDelayHours)
                const { data: stage2Candidates, error: stage2Error } = await supabase
                    .from('estimates')
                    .select('*, profiles(business_name), clients(name, email, phone)')
                    .eq('user_id', user_id)
                    .eq('status', 'sent')
                    .not('first_followed_up_at', 'is', null)
                    .is('second_followup_queued_at', null)
                    // Fallback to created_at for legacy rows where sent_at was never set.
                    .or(`sent_at.lt.${stage2ThresholdIso},and(sent_at.is.null,created_at.lt.${stage2ThresholdIso})`)

                if (stage2Error) {
                    console.error(`Error fetching stage2 candidates for user ${user_id}:`, stage2Error)
                    continue
                }

                for (const estimate of stage2Candidates || []) {
                    if (!estimate.clients?.email) {
                        await supabase
                            .from('analytics_events')
                            .upsert(
                                {
                                    user_id,
                                    event_name: 'followup_skipped_no_email',
                                    estimate_id: estimate.id,
                                    estimate_number: estimate.estimate_number,
                                    channel: 'automation',
                                    external_id: `followup_skip_no_email:${estimate.id}:stage2`,
                                    metadata: {
                                        automation: 'quote_chaser',
                                        stage: 2,
                                        reason: 'missing_client_email',
                                    },
                                },
                                { onConflict: 'external_id', ignoreDuplicates: true }
                            )
                        continue
                    }

                    const scheduledAt = new Date().toISOString()
                    const { error: jobError } = await supabase.from('job_queue').insert({
                        user_id,
                        task_type: 'email_followup',
                        payload: {
                            estimate_id: estimate.id,
                            estimate_number: estimate.estimate_number,
                            client_name: estimate.clients?.name,
                            client_email: estimate.clients?.email,
                            business_name: estimate.profiles?.business_name,
                            followup_stage: 2,
                        },
                        scheduled_for: scheduledAt,
                        max_attempts: 3,
                    })

                    if (!jobError) {
                        jobsCreated.push(`${estimate.id}:stage2`)
                        await supabase
                            .from('estimates')
                            .update({
                                second_followup_queued_at: scheduledAt,
                            })
                            .eq('id', estimate.id)
                    }
                }
            }

            // ---- Reputation Manager Logic ----
            if (type === 'review_request') {
                // Find estimates 'paid' more than 1 day ago and never requested for review
                const threshold = new Date()
                threshold.setDate(threshold.getDate() - 1) // D+1 after payment

                const { data: paidEstimates, error: paidError } = await supabase
                    .from('estimates')
                    .select('*, profiles(business_name), clients(name, email)')
                    .eq('user_id', user_id)
                    .eq('status', 'paid')
                    .is('review_requested_at', null)
                    .lt('updated_at', threshold.toISOString())

                if (paidError) {
                    console.error(`Error fetching paid estimates for user ${user_id}:`, paidError)
                    continue
                }

                for (const estimate of paidEstimates || []) {
                    // Get user's review link from settings
                    const reviewLink = settings?.review_link || ''

                    const { error: jobError } = await supabase
                        .from('job_queue')
                        .insert({
                            user_id,
                            task_type: 'review_request',
                            payload: {
                                estimate_id: estimate.id,
                                client_name: estimate.clients?.name,
                                client_email: estimate.clients?.email,
                                business_name: estimate.profiles?.business_name,
                                review_link: reviewLink
                            },
                            scheduled_for: new Date().toISOString()
                        })

                    if (!jobError) {
                        jobsCreated.push(estimate.id)
                        // Mark as requested to prevent re-queueing
                        await supabase
                            .from('estimates')
                            .update({ review_requested_at: new Date().toISOString() })
                            .eq('id', estimate.id)
                    }
                }
            }

            // Add more automation types here...
        }

        return new Response(JSON.stringify({
            success: true,
            jobs_created: jobsCreated.length,
            details: jobsCreated
        }), {
            headers: { 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error('Scheduler error:', error)
        return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        })
    }
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// This function scans for candidates for "Quote Chaser" and "Reputation Manager"
// It runs periodically (e.g., hourly) and inserts jobs into the job_queue.

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

const supabase = createClient(supabaseUrl, supabaseKey)

Deno.serve(async (req: Request) => {
    try {
        // Security: Verify cron secret header to prevent unauthorized access
        const authHeader = req.headers.get('Authorization')
        if (!CRON_SECRET) {
            console.warn('CRON_SECRET not set - endpoint is unprotected!')
        } else if (authHeader !== `Bearer ${CRON_SECRET}`) {
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
            const delayDays = settings?.delay_days ?? 3

            if (type === 'quote_chaser') {
                // Find estimates 'sent' more than X days ago and never followed up
                const thresholdDate = new Date()
                thresholdDate.setDate(thresholdDate.getDate() - delayDays)

                const { data: candidates, error: candidateError } = await supabase
                    .from('estimates')
                    .select('*, profiles(business_name), clients(name, email, phone)')
                    .eq('user_id', user_id)
                    .eq('status', 'sent')
                    .is('last_followed_up_at', null)
                    .lt('created_at', thresholdDate.toISOString())

                if (candidateError) {
                    console.error(`Error fetching candidates for user ${user_id}:`, candidateError)
                    continue
                }

                for (const estimate of candidates || []) {
                    // Insert into job_queue
                    const { error: jobError } = await supabase
                        .from('job_queue')
                        .insert({
                            user_id,
                            task_type: 'email_followup',
                            payload: {
                                estimate_id: estimate.id,
                                estimate_number: estimate.estimate_number,
                                client_name: estimate.clients?.name,
                                client_email: estimate.clients?.email,
                                business_name: estimate.profiles?.business_name
                            },
                            scheduled_for: new Date().toISOString()
                        })

                    if (!jobError) {
                        jobsCreated.push(estimate.id)
                        // Update estimate to prevent re-queueing
                        await supabase
                            .from('estimates')
                            .update({ last_followed_up_at: new Date().toISOString() })
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

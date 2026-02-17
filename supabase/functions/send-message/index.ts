import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// This function processes a single job from the job_queue.
// Triggered manually or by a database webhook.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const JOB_RUNNER_SECRET = Deno.env.get('JOB_RUNNER_SECRET') ?? Deno.env.get('CRON_SECRET') ?? ''
const DEFAULT_RESEND_COST_USD = 0.001

const supabase = createClient(supabaseUrl, supabaseKey)

// Security: HTML escape function to prevent XSS
function escapeHtml(text: string | undefined | null): string {
    if (!text) return ''
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

// Security: Basic email validation
function isValidEmail(email: string | undefined | null): boolean {
    if (!email) return false
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
}

function getMonthPeriodStart(): string {
    const now = new Date()
    const utcStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    return utcStart.toISOString().slice(0, 10)
}

async function recordResendUsage(userId: string): Promise<void> {
    const periodStart = getMonthPeriodStart()

    const { data: existing, error: existingError } = await supabase
        .from('usage_counters_monthly')
        .select('id, send_email_count, resend_estimated_cost')
        .eq('user_id', userId)
        .eq('period_start', periodStart)
        .maybeSingle()

    if (existingError) {
        console.error('Failed to fetch usage row for resend usage:', existingError)
        return
    }

    if (!existing?.id) {
        const { error: insertError } = await supabase
            .from('usage_counters_monthly')
            .insert({
                user_id: userId,
                period_start: periodStart,
                send_email_count: 1,
                resend_estimated_cost: DEFAULT_RESEND_COST_USD,
            })

        if (insertError) {
            console.error('Failed to insert usage row for resend usage:', insertError)
        }
        return
    }

    const nextSendCount = Number(existing.send_email_count || 0) + 1
    const nextResendCost = Number((Number(existing.resend_estimated_cost || 0) + DEFAULT_RESEND_COST_USD).toFixed(6))

    const { error: updateError } = await supabase
        .from('usage_counters_monthly')
        .update({
            send_email_count: nextSendCount,
            resend_estimated_cost: nextResendCost,
            updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

    if (updateError) {
        console.error('Failed to update usage row for resend usage:', updateError)
    }
}

Deno.serve(async (req: Request) => {
    let jobId: string | undefined
    let hasJobLock = false
    let claimedJob: any | null = null

    try {
        if (!JOB_RUNNER_SECRET) {
            return new Response(JSON.stringify({ error: 'JOB_RUNNER_SECRET is not configured' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        const authHeader = req.headers.get('Authorization')
        const secretHeader = req.headers.get('x-job-secret')
        const isAuthorized =
            authHeader === `Bearer ${JOB_RUNNER_SECRET}` || secretHeader === JOB_RUNNER_SECRET

        if (!isAuthorized) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        const body = await req.json()
        jobId = body.job_id

        if (!jobId) {
            return new Response(JSON.stringify({ error: 'job_id is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            })
        }

        // 1. Atomically claim pending/queued job to prevent duplicate sends.
        const { data: job, error: jobFetchError } = await supabase
            .from('job_queue')
            .update({ status: 'processing' })
            .eq('id', jobId)
            .or('status.eq.pending,status.eq.queued,status.is.null')
            .select('*')
            .maybeSingle()

        if (jobFetchError) throw jobFetchError

        if (!job) {
            const { data: existingJob, error: existingJobError } = await supabase
                .from('job_queue')
                .select('id, status')
                .eq('id', jobId)
                .maybeSingle()

            if (existingJobError) throw existingJobError
            if (!existingJob) throw new Error('Job not found')

            return new Response(
                JSON.stringify({
                    success: true,
                    skipped: true,
                    reason: `job_already_${existingJob.status || 'processed'}`,
                }),
                { headers: { 'Content-Type': 'application/json' } }
            )
        }

        hasJobLock = true
        claimedJob = job

        // 2. Track attempts (best-effort)
        const nowIso = new Date().toISOString()
        const nextAttemptCount = Number(claimedJob.attempt_count || 0) + 1
        const maxAttempts = Number(claimedJob.max_attempts || 3)

        claimedJob.attempt_count = nextAttemptCount
        claimedJob.max_attempts = maxAttempts

        await supabase
            .from('job_queue')
            .update({
                attempt_count: nextAttemptCount,
                last_attempt_at: nowIso,
                updated_at: nowIso,
            })
            .eq('id', jobId)
            .eq('status', 'processing')

        // 3. Dispatch based on type
        let shouldRecordResendUsage = false

        if (job.task_type === 'email_followup') {
            const { client_email, client_name, business_name, estimate_number, followup_stage } = job.payload

            if (!RESEND_API_KEY) {
                throw new Error('RESEND_API_KEY is not configured')
            }

            // Security: Validate email before sending
            if (!isValidEmail(client_email)) {
                throw new Error(`Invalid client email: ${client_email}`)
            }

            // Security: Escape user-provided content
            const safeName = escapeHtml(client_name)
            const safeBusiness = escapeHtml(business_name)
            const safeEstimate = escapeHtml(estimate_number)
            const stage = Number(followup_stage) === 2 ? 2 : 1
            const subject =
                stage === 2
                    ? `Final follow-up: Estimate ${safeEstimate}`
                    : `Checking in: Estimate ${safeEstimate}`
            const html =
                stage === 2
                    ? `<p>Hi ${safeName},</p><p>I wanted to send one final follow-up on the estimate from <strong>${safeBusiness}</strong>. If you'd like to proceed, just reply and we can lock in the schedule.</p>`
                    : `<p>Hi ${safeName},</p><p>Just checking in on the estimate I sent over from <strong>${safeBusiness}</strong>. Let me know if you have any questions!</p>`

            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                },
                body: JSON.stringify({
                    from: 'SnapQuote <no-reply@snapquote.ai>',
                    to: [client_email],
                    subject,
                    html,
                }),
            })

            if (!response.ok) {
                throw new Error(`Resend API error: ${await response.text()}`)
            }

            // Acknowledge send-complete time for follow-up tracking (stage timestamps).
            const estimateId = job.payload?.estimate_id
            const stage = Number(followup_stage) === 2 ? 2 : 1
            if (estimateId) {
                const sentAt = new Date().toISOString()
                const update: Record<string, string> = {
                    last_followed_up_at: sentAt,
                }

                if (stage === 2) update.second_followed_up_at = sentAt
                else update.first_followed_up_at = sentAt

                const { error: followupAckError } = await supabase
                    .from('estimates')
                    .update(update)
                    .eq('id', estimateId)

                if (followupAckError) {
                    console.error('Failed to ack follow-up send time:', followupAckError)
                }
            }

            shouldRecordResendUsage = true
        }

        // ---- Review Request Email ----
        if (job.task_type === 'review_request') {
            const { client_email, client_name, business_name, review_link } = job.payload

            if (!RESEND_API_KEY) {
                throw new Error('RESEND_API_KEY is not configured')
            }

            // Security: Validate email before sending
            if (!isValidEmail(client_email)) {
                throw new Error(`Invalid client email: ${client_email}`)
            }

            // Security: Escape user-provided content
            const safeName = escapeHtml(client_name)
            const safeBusiness = escapeHtml(business_name)

            // Security: Validate review_link is a proper URL
            let safeReviewLink = ''
            if (review_link) {
                try {
                    const url = new URL(review_link)
                    if (url.protocol === 'https:' || url.protocol === 'http:') {
                        safeReviewLink = review_link
                    }
                } catch {
                    // Invalid URL, skip the button
                }
            }

            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                },
                body: JSON.stringify({
                    from: 'SnapQuote <no-reply@snapquote.ai>',
                    to: [client_email],
                    subject: `Thank you for choosing ${safeBusiness}!`,
                    html: `
                        <p>Hi ${safeName},</p>
                        <p>Thank you for trusting <strong>${safeBusiness}</strong> with your recent project.</p>
                        <p>If you were happy with our work, we'd really appreciate it if you could leave us a quick review. It helps other customers find us!</p>
                        ${safeReviewLink ? `<p><a href="${safeReviewLink}" style="background-color:#4F46E5;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;">Leave a Review ⭐</a></p>` : ''}
                        <p>Thanks again!</p>
                    `,
                }),
            })

            if (!response.ok) {
                throw new Error(`Resend API error (review): ${await response.text()}`)
            }

            shouldRecordResendUsage = true
        }

        if (shouldRecordResendUsage && job.user_id) {
            await recordResendUsage(job.user_id)
        }

        // 4. Mark as completed
        await supabase
            .from('job_queue')
            .update({ status: 'completed' })
            .eq('id', jobId)
            .eq('status', 'processing')

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error('Send message error:', error)

        // 5. Update failure - use stored jobId from before the try block
        if (jobId && hasJobLock) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            const nowIso = new Date().toISOString()
            const attemptCount = Number(claimedJob?.attempt_count || 0)
            const maxAttempts = Number(claimedJob?.max_attempts || 3)

            // Basic retry/backoff: reschedule pending jobs up to max_attempts.
            if (attemptCount > 0 && attemptCount < maxAttempts) {
                const delayMinutes = Math.min(60, 15 * Math.pow(2, Math.max(0, attemptCount - 1)))
                const nextScheduledFor = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()

                await supabase
                    .from('job_queue')
                    .update({
                        status: 'pending',
                        scheduled_for: nextScheduledFor,
                        error_message: message,
                        updated_at: nowIso,
                    })
                    .eq('id', jobId)
                    .eq('status', 'processing')
            } else {
                await supabase
                    .from('job_queue')
                    .update({
                        status: 'failed',
                        error_message: message,
                        updated_at: nowIso,
                    })
                    .eq('id', jobId)
                    .eq('status', 'processing')
            }
        }

        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        })
    }
})

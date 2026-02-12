import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// This function processes a single job from the job_queue.
// Triggered manually or by a database webhook.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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

Deno.serve(async (req: Request) => {
    let jobId: string | undefined

    try {
        const body = await req.json()
        jobId = body.job_id

        if (!jobId) {
            return new Response(JSON.stringify({ error: 'job_id is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            })
        }

        // 1. Fetch Job
        const { data: job, error: jobFetchError } = await supabase
            .from('job_queue')
            .select('*')
            .eq('id', jobId)
            .single()

        if (jobFetchError || !job) throw new Error('Job not found')

        // 2. Mark as processing
        await supabase.from('job_queue').update({ status: 'processing' }).eq('id', jobId)

        // 3. Dispatch based on type
        if (job.task_type === 'email_followup') {
            const { client_email, client_name, business_name, estimate_number } = job.payload

            // Security: Validate email before sending
            if (!isValidEmail(client_email)) {
                throw new Error(`Invalid client email: ${client_email}`)
            }

            // Security: Escape user-provided content
            const safeName = escapeHtml(client_name)
            const safeBusiness = escapeHtml(business_name)
            const safeEstimate = escapeHtml(estimate_number)

            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                },
                body: JSON.stringify({
                    from: 'SnapQuote <no-reply@snapquote.ai>',
                    to: [client_email],
                    subject: `Checking in: Estimate ${safeEstimate}`,
                    html: `<p>Hi ${safeName},</p><p>Just checking in on the estimate I sent over from <strong>${safeBusiness}</strong>. Let me know if you have any questions!</p>`,
                }),
            })

            if (!response.ok) {
                throw new Error(`Resend API error: ${await response.text()}`)
            }
        }

        // ---- Review Request Email ----
        if (job.task_type === 'review_request') {
            const { client_email, client_name, business_name, review_link } = job.payload

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
        }

        // 4. Mark as completed
        await supabase.from('job_queue').update({ status: 'completed' }).eq('id', jobId)

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error('Send message error:', error)

        // 5. Update failure - use stored jobId from before the try block
        if (jobId) {
            await supabase.from('job_queue').update({
                status: 'failed',
                error_message: error instanceof Error ? error.message : 'Unknown error'
            }).eq('id', jobId)
        }

        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        })
    }
})

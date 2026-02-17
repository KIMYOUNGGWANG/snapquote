import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { enforceUsageQuota, recordUsage } from '@/lib/server/usage-quota';
import { requireAuthenticatedUser } from '@/lib/server/route-auth';

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function asTrimmedString(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') return ''
    return value.trim().slice(0, maxLength)
}

function normalizeHttpUrl(value: unknown, maxLength: number): string | null {
    const maybeUrl = asTrimmedString(value, maxLength)
    if (!maybeUrl) return null

    try {
        const parsed = new URL(maybeUrl)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
        return parsed.toString()
    } catch {
        return null
    }
}

export async function POST(req: Request) {
    try {
        const auth = await requireAuthenticatedUser(req)
        if (!auth.ok) {
            return auth.response
        }

        let quotaContext: Awaited<ReturnType<typeof enforceUsageQuota>>["context"] = null
        if (process.env.RESEND_API_KEY) {
            const quota = await enforceUsageQuota(req, "send_email", { requireAuth: true })
            if (!quota.ok) {
                return NextResponse.json(
                    {
                        error: quota.error || "Free plan limit reached",
                        code: "FREE_PLAN_LIMIT_REACHED",
                        metric: "send_email",
                        usage: quota.used,
                        limit: quota.limit,
                    },
                    { status: quota.status || 402 }
                )
            }
            quotaContext = quota.context
        }

        const ip = getClientIp(req)
        const rateLimit = await checkRateLimit({
            key: `send-email:${ip}`,
            limit: 30,
            windowMs: 10 * 60 * 1000,
        })

        if (!rateLimit.allowed) {
            return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
        }

        const body = await req.json();

        // Support both field naming conventions for backward compatibility
        const recipientEmail = asTrimmedString(body.email || body.to, 320)
        const pdfData = asTrimmedString(body.pdfBase64 || body.pdfBuffer, 20_000_000)
        const subject = asTrimmedString(body.subject, 200)
        const filename = asTrimmedString(body.filename, 120)
        const clientName = asTrimmedString(body.clientName, 120)
        const message = asTrimmedString(body.message, 8_000)
        const businessName = asTrimmedString(body.businessName, 120)
        const referralUrl = normalizeHttpUrl(body.referralUrl, 400)

        if (!recipientEmail || !EMAIL_REGEX.test(recipientEmail)) {
            return NextResponse.json({ error: 'Invalid recipient email' }, { status: 400 });
        }

        if (!process.env.RESEND_API_KEY) {
            // Fallback to mailto: if no API key
            const mailtoUrl = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject || 'Your Estimate')}&body=${encodeURIComponent(message || 'Please find attached your estimate.')}`;
            return NextResponse.json({
                method: 'mailto',
                mailtoUrl,
                message: 'No email service configured. Opening email client.'
            });
        }

        const resend = new Resend(process.env.RESEND_API_KEY);

        let attachments: { filename: string; content: Buffer }[] | undefined

        if (pdfData) {
            const normalizedPdfData = pdfData.replace(/^data:application\/pdf;base64,/, '')
            const buffer = Buffer.from(normalizedPdfData, 'base64');
            if (buffer.length > MAX_PDF_BYTES) {
                return NextResponse.json({ error: 'PDF is too large' }, { status: 413 });
            }

            attachments = [
                {
                    filename: filename || 'Estimate.pdf',
                    content: buffer,
                },
            ]
        }

        // Build HTML email with escaped user content
        const safeBusinessName = escapeHtml(businessName || 'SnapQuote')
        const safeClientName = escapeHtml(clientName || 'Valued Customer')
        const safeMessage = message ? escapeHtml(message).replace(/\n/g, '<br />') : ''
        const safeReferralUrl = referralUrl ? escapeHtml(referralUrl) : ''
        const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #2563EB;">Estimate from ${safeBusinessName}</h1>
                <p>Dear ${safeClientName},</p>
                ${safeMessage ? `<p style="white-space: pre-line;">${safeMessage}</p>` : '<p>Please find attached your estimate.</p>'}
                ${safeReferralUrl ? `<p style="margin-top: 18px; padding: 10px 12px; background: #f5f9ff; border-radius: 8px; font-size: 13px;">
                    Need fast professional estimates too? <a href="${safeReferralUrl}" target="_blank" rel="noopener noreferrer">Try SnapQuote</a>
                </p>` : ''}
                <hr style="border: 1px solid #e5e7eb; margin: 20px 0;" />
                <p style="color: #6b7280; font-size: 12px;">
                    This estimate was generated by SnapQuote - Trade-Focused AI Estimator
                </p>
            </div>
        `;

        const data = await resend.emails.send({
            from: 'SnapQuote <onboarding@resend.dev>', // Update with verified domain later
            to: [recipientEmail],
            subject: subject || 'Your Estimate from SnapQuote',
            html: htmlContent,
            attachments,
        });

        if (data.error) {
            console.error('Resend API Error:', data.error);
            return NextResponse.json({
                success: false,
                error: data.error.message || 'Failed to send email'
            }, { status: 400 });
        }

        await recordUsage(quotaContext, "send_email")

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error('Email send exception:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Internal server error during email sending'
        }, { status: 500 });
    }
}

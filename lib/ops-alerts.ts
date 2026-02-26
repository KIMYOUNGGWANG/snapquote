import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"

type OpsAlertSource = "stripe_webhook" | "stripe_reconcile" | "stripe_billing_webhook"
type OpsAlertSeverity = "info" | "warning" | "error"

interface RecordOpsAlertInput {
    source: OpsAlertSource
    severity?: OpsAlertSeverity
    alertKey: string
    message: string
    context?: Record<string, unknown>
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

function getSupabaseServiceClient() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return null
    }

    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    )
}

function normalizeContext(context?: Record<string, unknown>): Record<string, unknown> {
    if (!context) return {}
    try {
        const serialized = JSON.stringify(context)
        if (serialized.length <= 8000) return context
        return {
            truncated: true,
            preview: serialized.slice(0, 7800),
        }
    } catch {
        return { parseError: "context_not_serializable" }
    }
}

async function sendOpsAlertEmail(input: {
    source: OpsAlertSource
    severity: OpsAlertSeverity
    message: string
    alertKey: string
    context: Record<string, unknown>
}) {
    if (!process.env.RESEND_API_KEY || !process.env.OPS_ALERT_EMAIL) return

    const recipients = process.env.OPS_ALERT_EMAIL
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean)

    if (recipients.length === 0) return

    const resend = new Resend(process.env.RESEND_API_KEY)
    const subject = `[SnapQuote Ops][${input.severity.toUpperCase()}] ${input.source}`
    const contextText = JSON.stringify(input.context, null, 2).slice(0, 6000)

    const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.45;">
            <h2 style="margin:0 0 8px;">SnapQuote Operational Alert</h2>
            <p><strong>Source:</strong> ${escapeHtml(input.source)}</p>
            <p><strong>Severity:</strong> ${escapeHtml(input.severity)}</p>
            <p><strong>Alert Key:</strong> ${escapeHtml(input.alertKey)}</p>
            <p><strong>Message:</strong> ${escapeHtml(input.message)}</p>
            <p><strong>Context:</strong></p>
            <pre style="white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px;">${escapeHtml(contextText)}</pre>
        </div>
    `

    const { error } = await resend.emails.send({
        from: "SnapQuote Ops <onboarding@resend.dev>",
        to: recipients,
        subject,
        html,
    })

    if (error) {
        console.error("Failed to send ops alert email:", error)
    }
}

export async function recordOpsAlert(input: RecordOpsAlertInput): Promise<void> {
    const supabase = getSupabaseServiceClient()
    if (!supabase) {
        console.error("Ops alert skipped: missing Supabase service configuration", input)
        return
    }

    const now = new Date().toISOString()
    const severity: OpsAlertSeverity = input.severity || "error"
    const context = normalizeContext(input.context)
    const alertKey = input.alertKey.trim().slice(0, 120)
    const message = input.message.trim().slice(0, 500)

    try {
        const { data: existing, error: findError } = await supabase
            .from("ops_alerts")
            .select("id, occurrences")
            .eq("alert_key", alertKey)
            .is("resolved_at", null)
            .limit(1)
            .maybeSingle()

        if (findError) {
            console.error("Failed to load existing ops alert:", findError)
            return
        }

        if (existing?.id) {
            const { error: updateError } = await supabase
                .from("ops_alerts")
                .update({
                    source: input.source,
                    severity,
                    message,
                    context,
                    last_seen_at: now,
                    occurrences: (existing.occurrences || 0) + 1,
                })
                .eq("id", existing.id)

            if (updateError) {
                console.error("Failed to update ops alert:", updateError)
            }
            return
        }

        const { error: insertError } = await supabase
            .from("ops_alerts")
            .insert({
                source: input.source,
                severity,
                alert_key: alertKey,
                message,
                context,
                occurrences: 1,
                first_seen_at: now,
                last_seen_at: now,
            })

        if (insertError) {
            console.error("Failed to insert ops alert:", insertError)
            return
        }

        await sendOpsAlertEmail({
            source: input.source,
            severity,
            message,
            alertKey,
            context,
        })
    } catch (error) {
        console.error("Unexpected ops alert error:", error)
    }
}

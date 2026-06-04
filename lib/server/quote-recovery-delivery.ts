import { Resend } from "resend"
import { extractGeminiText } from "@/lib/ai/gemini"
import {
    appendCustomerPortalReviewLink,
    defaultRecoveryMessage,
} from "@/lib/server/quote-recovery-messages"
import { asTrimmedString, isPlainObject } from "@/lib/server/quote-recovery-normalization"
import type { CustomerPortalFollowupStatus } from "@/lib/server/quote-recovery-types"

const GEMINI_RECOVERY_MODEL = process.env.GEMINI_RECOVERY_MODEL?.trim() || "gemini-2.5-flash"

export async function generateRecoveryMessage(input: {
    clientName: string
    estimateNumber: string
    totalAmount?: number | null
    businessName: string
    customerPortalStatus?: CustomerPortalFollowupStatus
    customerPortalUrl?: string
}): Promise<string> {
    const fallback = appendCustomerPortalReviewLink(defaultRecoveryMessage(input), input.customerPortalUrl || "")
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) return fallback

    const customerContext = input.customerPortalStatus === "viewed"
        ? "The customer has already opened the quote link; write a timely, helpful follow-up."
        : input.customerPortalUrl
            ? "The customer has an approval link available; do not invent a URL because the app appends the real link after your message."
            : "No approval link is available."

    const prompt = [
        "You are a contractor follow-up assistant.",
        "Write one concise, warm follow-up message for a homeowner.",
        "Constraints:",
        "- max 280 characters",
        "- plain text only",
        "- no markdown",
        "- no pressure tactics",
        "- include estimate number naturally",
        `Client name: ${input.clientName}`,
        `Estimate number: ${input.estimateNumber}`,
        `Estimate total: ${
            typeof input.totalAmount === "number" && Number.isFinite(input.totalAmount)
                ? input.totalAmount.toFixed(2)
                : "not provided"
        }`,
        `Business name: ${input.businessName}`,
        `Customer quote status: ${input.customerPortalStatus || "not shared"}`,
        `Customer context: ${customerContext}`,
    ].join("\n")

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_RECOVERY_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: "user",
                        parts: [{ text: prompt }],
                    },
                ],
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 180,
                    responseMimeType: "text/plain",
                },
            }),
            cache: "no-store",
        })

        const payload = await response.json().catch(() => null)
        if (!response.ok) {
            const providerMessage =
                typeof payload?.error?.message === "string" ? payload.error.message : "Gemini request failed"
            console.error("Quote recovery Gemini error:", providerMessage)
            return fallback
        }

        const generated = extractGeminiText(payload)
        if (!generated) return fallback
        return appendCustomerPortalReviewLink(generated.slice(0, 350), input.customerPortalUrl || "")
    } catch (error) {
        console.error("Quote recovery Gemini exception:", error)
        return fallback
    }
}

function getTwilioConfig() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() || ""
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || ""
    const fromPhoneNumber = process.env.TWILIO_FROM_NUMBER?.trim() || ""

    if (!accountSid || !authToken || !fromPhoneNumber) {
        return null
    }

    return {
        accountSid,
        authToken,
        fromPhoneNumber,
    }
}

export async function sendViaTwilio(
    toPhoneNumber: string,
    message: string
): Promise<{ messageId: string; status: string }> {
    const twilio = getTwilioConfig()
    if (!twilio) {
        throw new Error("Twilio is not configured")
    }

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Messages.json`
    const body = new URLSearchParams({
        To: toPhoneNumber,
        From: twilio.fromPhoneNumber,
        Body: message,
    })

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            authorization: `Basic ${Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64")}`,
            "content-type": "application/x-www-form-urlencoded",
        },
        body,
        cache: "no-store",
    })

    const data = await response.json().catch(() => null)
    if (!response.ok) {
        const providerMessage =
            typeof data?.message === "string" && data.message.trim()
                ? data.message.trim()
                : `Twilio request failed (${response.status})`
        throw new Error(providerMessage)
    }

    const messageId = asTrimmedString(data?.sid, 80)
    if (!messageId) {
        throw new Error("Twilio response is missing message id")
    }

    return {
        messageId,
        status: asTrimmedString(data?.status, 40) || "queued",
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

function getResendMessageId(response: unknown): string {
    if (!isPlainObject(response)) return ""

    const directId = asTrimmedString(response.id, 120)
    if (directId) return directId

    return isPlainObject(response.data)
        ? asTrimmedString(response.data.id, 120)
        : ""
}

export async function sendViaResend(input: {
    toEmail: string
    clientName: string
    businessName: string
    message: string
    estimateNumber: string
}): Promise<string> {
    const apiKey = process.env.RESEND_API_KEY?.trim()
    if (!apiKey) {
        throw new Error("Resend is not configured")
    }

    const resend = new Resend(apiKey)
    const subject = `Checking in on estimate ${input.estimateNumber}`
    const safeClientName = escapeHtml(input.clientName)
    const safeMessage = escapeHtml(input.message).replace(/\n/g, "<br />")
    const safeBusinessName = escapeHtml(input.businessName)

    const response = await resend.emails.send({
        from: "SnapQuote <onboarding@resend.dev>",
        to: [input.toEmail],
        subject,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
                <p>Hi ${safeClientName},</p>
                <p>${safeMessage}</p>
                <p>Thanks,<br />${safeBusinessName}</p>
            </div>
        `,
    })

    if (response.error) {
        throw new Error(response.error.message || "Resend request failed")
    }

    return getResendMessageId(response) || "resend-message"
}

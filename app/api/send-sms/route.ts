import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"

const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/
const ESTIMATE_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,128}$/
const MAX_MESSAGE_LENGTH = 1200

type SendSmsPayload = {
    toPhoneNumber: string
    message: string
    estimateId: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizePayload(input: unknown): SendSmsPayload | null {
    if (!isPlainObject(input)) return null

    const toPhoneNumber =
        typeof input.toPhoneNumber === "string" ? input.toPhoneNumber.trim() : ""
    const message = typeof input.message === "string" ? input.message.trim() : ""
    const estimateId =
        typeof input.estimateId === "string" ? input.estimateId.trim() : ""

    if (!E164_PHONE_PATTERN.test(toPhoneNumber)) return null
    if (!message || message.length > MAX_MESSAGE_LENGTH) return null
    if (!ESTIMATE_ID_PATTERN.test(estimateId)) return null

    return {
        toPhoneNumber,
        message,
        estimateId,
    }
}

async function getSmsCreditsBalance(supabase: any, userId: string): Promise<{ balance: number; error: string | null }> {
    const { data, error } = await supabase
        .from("sms_credit_ledger")
        .select("delta_credits")
        .eq("user_id", userId)

    if (error) {
        return {
            balance: 0,
            error: error.message || "Failed to load SMS credits",
        }
    }

    const rows = Array.isArray(data) ? data : []
    const balance = rows.reduce((sum: number, row: any) => {
        const delta = Number(row?.delta_credits || 0)
        return sum + (Number.isFinite(delta) ? delta : 0)
    }, 0)

    return { balance, error: null }
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

async function sendViaTwilio(payload: SendSmsPayload): Promise<{ messageId: string; status: string }> {
    const twilio = getTwilioConfig()
    if (!twilio) {
        throw new Error("Twilio is not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.")
    }

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Messages.json`
    const body = new URLSearchParams({
        To: payload.toPhoneNumber,
        From: twilio.fromPhoneNumber,
        Body: payload.message,
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

    const messageId =
        typeof data?.sid === "string" && data.sid.trim()
            ? data.sid.trim()
            : ""

    if (!messageId) {
        throw new Error("Twilio response is missing message id")
    }

    const status =
        typeof data?.status === "string" && data.status.trim()
            ? data.status.trim()
            : "queued"

    return {
        messageId,
        status,
    }
}

export async function POST(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `send-sms:${auth.userId}:${ip}`,
        limit: 20,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: "Too many requests. Please try again later." },
            { status: 429 }
        )
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json(
            { error: "Supabase service configuration is missing." },
            { status: 500 }
        )
    }

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 }
        )
    }

    const payload = normalizePayload(body)
    if (!payload) {
        return NextResponse.json(
            { error: "Invalid SMS payload" },
            { status: 400 }
        )
    }

    const credits = await getSmsCreditsBalance(supabase, auth.userId)
    if (credits.error) {
        return NextResponse.json(
            { error: credits.error },
            { status: 500 }
        )
    }

    if (credits.balance <= 0) {
        return NextResponse.json(
            { error: "Insufficient SMS credits" },
            { status: 402 }
        )
    }

    try {
        const providerResult = await sendViaTwilio(payload)

        const remainingAfterSend = Math.max(0, credits.balance - 1)

        const { error: messageError } = await supabase
            .from("sms_messages")
            .insert({
                user_id: auth.userId,
                estimate_id: payload.estimateId,
                to_phone_e164: payload.toPhoneNumber,
                provider_id: providerResult.messageId,
                status: providerResult.status,
            })

        if (messageError) {
            return NextResponse.json(
                { error: "Failed to persist SMS message" },
                { status: 500 }
            )
        }

        const { error: ledgerError } = await supabase
            .from("sms_credit_ledger")
            .insert({
                user_id: auth.userId,
                delta_credits: -1,
                reason: "send_sms",
                ref_id: providerResult.messageId,
            })

        if (ledgerError) {
            return NextResponse.json(
                { error: "Failed to update SMS credits" },
                { status: 500 }
            )
        }

        return NextResponse.json({
            ok: true,
            messageId: providerResult.messageId,
            creditsRemaining: remainingAfterSend,
        })
    } catch (error: any) {
        console.error("Send SMS error:", error)
        return NextResponse.json(
            { error: error?.message || "Failed to send SMS" },
            { status: 500 }
        )
    }
}

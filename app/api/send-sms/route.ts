import { NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"

const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/
const ESTIMATE_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,128}$/
const MAX_MESSAGE_LENGTH = 1200
const MAX_IDEMPOTENCY_KEY_LENGTH = 255

type SendSmsPayload = {
    toPhoneNumber: string
    message: string
    estimateId: string
}

type ClaimSmsSendCreditRow = {
    message_row_id: string | null
    provider_id: string | null
    status: string | null
    credits_remaining: number | null
    deduped: boolean | null
    claimed: boolean | null
    last_error: string | null
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

function normalizeIdempotencyKey(value: string | null): string | null {
    if (!value) return null
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH)
}

function createDeterministicIdempotencyKey(input: {
    userId: string
    estimateId: string
    toPhoneNumber: string
    message: string
}): string {
    const basis = [
        input.userId,
        input.estimateId,
        input.toPhoneNumber,
        input.message,
    ].join("|")

    const digest = createHash("sha256").update(basis).digest("hex")
    return `sms:${digest}`.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH)
}

function normalizeClaimSmsSendCreditRow(value: unknown): ClaimSmsSendCreditRow | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null
    }

    const row = value as Record<string, unknown>
    return {
        message_row_id: typeof row.message_row_id === "string" ? row.message_row_id : null,
        provider_id: typeof row.provider_id === "string" ? row.provider_id : null,
        status: typeof row.status === "string" ? row.status : null,
        credits_remaining: Number.isFinite(Number(row.credits_remaining))
            ? Number(row.credits_remaining)
            : null,
        deduped: typeof row.deduped === "boolean" ? row.deduped : null,
        claimed: typeof row.claimed === "boolean" ? row.claimed : null,
        last_error: typeof row.last_error === "string" ? row.last_error : null,
    }
}

async function claimSmsSendCredit(
    supabase: any,
    input: {
        userId: string
        payload: SendSmsPayload
        idempotencyKey: string
    }
): Promise<{ data: ClaimSmsSendCreditRow | null; error: string | null }> {
    const { data, error } = await supabase.rpc("claim_sms_send_credit", {
        p_user_id: input.userId,
        p_estimate_id: input.payload.estimateId,
        p_to_phone_e164: input.payload.toPhoneNumber,
        p_message: input.payload.message,
        p_idempotency_key: input.idempotencyKey,
    })

    if (error) {
        return {
            data: null,
            error: error.message || "Failed to reserve SMS credits",
        }
    }

    const firstRow = Array.isArray(data) ? data[0] : data
    return {
        data: normalizeClaimSmsSendCreditRow(firstRow),
        error: null,
    }
}

async function finalizeSmsSendSuccess(
    supabase: any,
    input: {
        userId: string
        messageRowId: string
        idempotencyKey: string
        providerId: string
        providerStatus: string
    }
): Promise<{ data: ClaimSmsSendCreditRow | null; error: string | null }> {
    const { data, error } = await supabase.rpc("finalize_sms_send_success", {
        p_user_id: input.userId,
        p_message_row_id: input.messageRowId,
        p_idempotency_key: input.idempotencyKey,
        p_provider_id: input.providerId,
        p_provider_status: input.providerStatus,
    })

    if (error) {
        return {
            data: null,
            error: error.message || "Failed to finalize SMS send",
        }
    }

    const firstRow = Array.isArray(data) ? data[0] : data
    return {
        data: normalizeClaimSmsSendCreditRow(firstRow),
        error: null,
    }
}

async function finalizeSmsSendFailure(
    supabase: any,
    input: {
        userId: string
        messageRowId: string
        idempotencyKey: string
        lastError: string
    }
): Promise<void> {
    const { error } = await supabase.rpc("finalize_sms_send_failure", {
        p_user_id: input.userId,
        p_message_row_id: input.messageRowId,
        p_idempotency_key: input.idempotencyKey,
        p_last_error: input.lastError,
    })

    if (error) {
        console.error("Failed to finalize SMS send failure:", error)
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

    const requestIdempotencyKey = normalizeIdempotencyKey(req.headers.get("idempotency-key"))
    const idempotencyKey =
        requestIdempotencyKey ||
        createDeterministicIdempotencyKey({
            userId: auth.userId,
            estimateId: payload.estimateId,
            toPhoneNumber: payload.toPhoneNumber,
            message: payload.message,
        })

    const claim = await claimSmsSendCredit(supabase, {
        userId: auth.userId,
        payload,
        idempotencyKey,
    })
    if (claim.error) {
        return NextResponse.json(
            { error: claim.error },
            { status: 500 }
        )
    }

    const claimData = claim.data
    if (!claimData) {
        return NextResponse.json(
            { error: "Failed to reserve SMS credits" },
            { status: 500 }
        )
    }

    if (claimData.status === "insufficient_credits") {
        return NextResponse.json(
            { error: "Insufficient SMS credits" },
            { status: 402 }
        )
    }

    if (claimData.deduped) {
        if (claimData.status === "failed") {
            return NextResponse.json(
                { error: claimData.last_error || "Previous SMS send failed" },
                { status: 500 }
            )
        }

        return NextResponse.json({
            ok: true,
            messageId: claimData.provider_id || claimData.message_row_id || idempotencyKey,
            creditsRemaining: Math.max(0, claimData.credits_remaining || 0),
            deduped: true,
            status: claimData.status || "pending",
        })
    }

    if (!claimData.message_row_id) {
        return NextResponse.json(
            { error: "Failed to create SMS reservation" },
            { status: 500 }
        )
    }

    try {
        const providerResult = await sendViaTwilio(payload)
        const finalized = await finalizeSmsSendSuccess(supabase, {
            userId: auth.userId,
            messageRowId: claimData.message_row_id,
            idempotencyKey,
            providerId: providerResult.messageId,
            providerStatus: providerResult.status,
        })
        if (finalized.error) {
            console.error("Failed to finalize SMS send success:", finalized.error)
        }

        return NextResponse.json({
            ok: true,
            messageId: providerResult.messageId,
            creditsRemaining: Math.max(
                0,
                finalized.data?.credits_remaining ?? claimData.credits_remaining ?? 0
            ),
            status: finalized.data?.status || providerResult.status,
        })
    } catch (error: any) {
        await finalizeSmsSendFailure(supabase, {
            userId: auth.userId,
            messageRowId: claimData.message_row_id,
            idempotencyKey,
            lastError: error?.message || "Failed to send SMS",
        })
        console.error("Send SMS error:", error)
        return NextResponse.json(
            { error: error?.message || "Failed to send SMS" },
            { status: 500 }
        )
    }
}

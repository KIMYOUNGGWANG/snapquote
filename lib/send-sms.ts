import { withAuthHeaders } from "@/lib/auth-headers"

const MAX_IDEMPOTENCY_KEY_LENGTH = 255

export interface SendEstimateSmsInput {
    estimateId: string
    toPhoneNumber: string
    message: string
}

export interface SendEstimateSmsResponse {
    ok: true
    messageId: string
    creditsRemaining: number
    deduped?: boolean
    status?: string
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
}

async function createSmsIdempotencyKey(input: SendEstimateSmsInput): Promise<string | null> {
    const subtle = globalThis.crypto?.subtle
    if (!subtle) return null

    const basis = [
        input.estimateId.trim(),
        input.toPhoneNumber.trim(),
        input.message.trim(),
    ].join("|")

    const digest = await subtle.digest(
        "SHA-256",
        new TextEncoder().encode(basis)
    )

    return `sms:${bytesToHex(new Uint8Array(digest))}`.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH)
}

export async function sendEstimateSms(input: SendEstimateSmsInput): Promise<SendEstimateSmsResponse> {
    const headers = await withAuthHeaders({ "Content-Type": "application/json" })
    const idempotencyKey = await createSmsIdempotencyKey(input)

    if (idempotencyKey) {
        headers["Idempotency-Key"] = idempotencyKey
    }

    const response = await fetch("/api/send-sms", {
        method: "POST",
        headers,
        body: JSON.stringify(input),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
        if (response.status === 402) {
            throw new Error("Insufficient SMS credits. Upgrade or add SMS credits before sending.")
        }

        throw new Error(
            typeof data?.error === "string" && data.error.trim()
                ? data.error.trim()
                : "Failed to send SMS"
        )
    }

    return data as SendEstimateSmsResponse
}

import { needsScopeAssumptionsReview } from "@/lib/estimates/draft-state"
import type {
    CandidateContact,
    CandidateEstimate,
    CustomerPortalFollowupStatus,
    RecoveryPayload,
} from "@/lib/server/quote-recovery-types"

const RECOVERY_LOOKBACK_MS = 48 * 60 * 60 * 1000
const ESTIMATE_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,128}$/
const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function asTrimmedString(value: unknown, maxLength: number): string {
    if (typeof value !== "string") return ""
    return value.trim().slice(0, maxLength)
}

export function asOptionalHttpUrl(value: unknown): string {
    const url = asTrimmedString(value, 2048)
    if (!url) return ""

    try {
        const parsed = new URL(url)
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return ""
        return parsed.toString()
    } catch {
        return ""
    }
}

export function asPositiveNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return null
}

function normalizePhone(value: unknown): string {
    const phone = asTrimmedString(value, 32)
    if (!phone) return ""
    return E164_PHONE_PATTERN.test(phone) ? phone : ""
}

function normalizeEmail(value: unknown): string {
    const email = asTrimmedString(value, 320).toLowerCase()
    if (!email) return ""
    return EMAIL_PATTERN.test(email) ? email : ""
}

function parseIsoMillis(value: unknown): number | null {
    if (typeof value !== "string") return null
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
}

function normalizeEstimateId(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    if (!trimmed) return null
    if (!ESTIMATE_ID_PATTERN.test(trimmed)) return null
    return trimmed
}

export function normalizePayload(input: unknown): RecoveryPayload | null {
    if (input === null || input === undefined) {
        return { dryRun: false }
    }

    if (!isPlainObject(input)) return null

    const estimateId = normalizeEstimateId(input.estimateId)
    if (input.estimateId !== undefined && !estimateId) return null

    return {
        ...(estimateId ? { estimateId } : {}),
        dryRun: input.dryRun === true,
    }
}

function extractRelationObject(value: unknown): Record<string, unknown> | null {
    if (Array.isArray(value)) {
        const first = value[0]
        return isPlainObject(first) ? first : null
    }
    return isPlainObject(value) ? value : null
}

export function extractCandidateContact(estimate: CandidateEstimate): CandidateContact {
    const client = extractRelationObject(estimate.clients)
    const profile = extractRelationObject(estimate.profiles)

    return {
        clientName: asTrimmedString(client?.name, 120) || "there",
        clientEmail: normalizeEmail(client?.email),
        clientPhone: normalizePhone(client?.phone),
        businessName: asTrimmedString(profile?.business_name, 120) || "your contractor",
    }
}

export function shouldProcessEstimate(estimate: CandidateEstimate, nowMs: number): boolean {
    const sentAt = parseIsoMillis(estimate.sent_at)
    const createdAt = parseIsoMillis(estimate.created_at)
    const reference = sentAt ?? createdAt

    if (!reference) return false
    if (reference > nowMs - RECOVERY_LOOKBACK_MS) return false
    if (estimate.last_followed_up_at) return false
    if (estimate.first_followed_up_at) return false

    return true
}

export function normalizeCustomerPortalStatus(value: unknown): CustomerPortalFollowupStatus {
    if (
        value === "shared" ||
        value === "viewed" ||
        value === "approved" ||
        value === "change_requested"
    ) {
        return value
    }

    return "shared"
}

export function getErrorCode(error: unknown): string {
    if (!isPlainObject(error)) return ""
    return asTrimmedString(error.code, 80)
}

export function getErrorMessage(error: unknown): string {
    if (!isPlainObject(error)) return ""
    return asTrimmedString(error.message, 500)
}

export function customerPortalKey(userId: unknown, estimateId: unknown): string {
    return `${asTrimmedString(userId, 128)}:${asTrimmedString(estimateId, 128)}`
}

function extractAttachmentObject(value: unknown): Record<string, unknown> | null {
    if (Array.isArray(value)) {
        const first = value.find((entry) => isPlainObject(entry))
        return isPlainObject(first) ? first : null
    }

    return isPlainObject(value) ? value : null
}

function extractCandidateScopeReviewState(estimate: CandidateEstimate) {
    const attachment = extractAttachmentObject(estimate.estimate_attachments)
    const photos = Array.isArray(attachment?.photos)
        ? attachment.photos.filter((photo): photo is string => typeof photo === "string" && photo.trim() !== "")
        : []
    const originalTranscript = asTrimmedString(attachment?.original_transcript, 20000)
    const scopeAssumptionsConfirmedAt = asTrimmedString(attachment?.scope_assumptions_confirmed_at, 80)

    return {
        attachments: {
            photos,
            ...(originalTranscript ? { originalTranscript } : {}),
            ...(scopeAssumptionsConfirmedAt ? { scopeAssumptionsConfirmedAt } : {}),
        },
    }
}

export function candidateNeedsScopeReview(estimate: CandidateEstimate): boolean {
    return needsScopeAssumptionsReview(extractCandidateScopeReviewState(estimate))
}

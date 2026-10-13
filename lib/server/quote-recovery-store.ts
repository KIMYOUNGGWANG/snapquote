import { resolveEffectivePlanTier } from "@/lib/server/effective-plan"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
    asOptionalHttpUrl,
    asPositiveNumber,
    asTrimmedString,
    customerPortalKey,
    getErrorCode,
    getErrorMessage,
    isPlainObject,
    normalizeCustomerPortalStatus,
} from "@/lib/server/quote-recovery-normalization"
import type {
    CandidateCustomerPortal,
    CandidateEstimate,
    RecoveryPayload,
} from "@/lib/server/quote-recovery-types"

export type QuoteRecoverySupabaseClient = SupabaseClient

function isCandidateEstimate(row: unknown): row is CandidateEstimate {
    return isPlainObject(row) && typeof row.id === "string" && typeof row.user_id === "string"
}

export async function loadPlanTier(
    supabase: QuoteRecoverySupabaseClient,
    userId: string
): Promise<{ planTier: string; error: string | null }> {
    const { data, error } = await supabase
        .from("profiles")
        .select("plan_tier, stripe_subscription_status, referral_trial_ends_at, referral_bonus_ends_at")
        .eq("id", userId)
        .maybeSingle()

    if (error) {
        return {
            planTier: "free",
            error: error.message || "Failed to resolve plan tier",
        }
    }

    return {
        planTier: resolveEffectivePlanTier(data || {}),
        error: null,
    }
}

export async function loadRecoveryCandidates(
    supabase: QuoteRecoverySupabaseClient,
    payload: RecoveryPayload,
    callerUserId: string | null
): Promise<{ candidates: CandidateEstimate[]; error: string | null }> {
    let query = supabase
        .from("estimates")
        .select("id, user_id, estimate_number, total_amount, sent_at, created_at, first_followup_queued_at, first_followed_up_at, last_followed_up_at, payment_completed_at, clients(*), profiles(business_name), estimate_attachments(photos, original_transcript, scope_assumptions_confirmed_at)")
        .eq("status", "sent")
        .is("first_followup_queued_at", null)
        .is("first_followed_up_at", null)
        .is("last_followed_up_at", null)
        .order("created_at", { ascending: true })
        .limit(250)

    if (payload.estimateId) {
        query = query.eq("id", payload.estimateId)
    }

    if (callerUserId) {
        query = query.eq("user_id", callerUserId)
    }

    const { data, error } = await query
    if (error) {
        console.error("Quote recovery candidate query error:", error)
        return { candidates: [], error: "Failed to load quote recovery candidates." }
    }

    return {
        candidates: Array.isArray(data) ? data.filter(isCandidateEstimate) : [],
        error: null,
    }
}

export async function loadCustomerPortalLinks(
    supabase: QuoteRecoverySupabaseClient,
    estimates: CandidateEstimate[]
): Promise<Map<string, CandidateCustomerPortal>> {
    const estimateIds = Array.from(
        new Set(estimates.map((estimate) => asTrimmedString(estimate.id, 128)).filter(Boolean))
    )
    const userIds = Array.from(
        new Set(estimates.map((estimate) => asTrimmedString(estimate.user_id, 128)).filter(Boolean))
    )

    if (estimateIds.length === 0 || userIds.length === 0) {
        return new Map()
    }

    let query = supabase
        .from("estimate_share_links")
        .select("user_id, estimate_id, share_url, status, customer_note, updated_at")
        .in("estimate_id", estimateIds)

    query = query.in("user_id", userIds)

    const { data, error } = await query
    if (error) {
        const code = getErrorCode(error)
        const message = getErrorMessage(error) || "Failed to load customer quote portal links."

        if (code === "42P01" || code === "PGRST204" || code === "PGRST205") {
            console.warn("Quote recovery customer portal links unavailable:", message)
            return new Map()
        }

        console.error("Quote recovery customer portal link query error:", error)
        throw new Error(message)
    }

    const rows = Array.isArray(data) ? data : []
    const links = new Map<string, CandidateCustomerPortal>()

    for (const row of rows) {
        if (!isPlainObject(row)) continue

        const estimateId = asTrimmedString(row.estimate_id, 128)
        const userId = asTrimmedString(row.user_id, 128)
        if (!estimateId || !userId) continue

        links.set(customerPortalKey(userId, estimateId), {
            status: normalizeCustomerPortalStatus(row.status),
            shareUrl: asOptionalHttpUrl(row.share_url),
            customerNote: asTrimmedString(row.customer_note, 500),
        })
    }

    return links
}

export async function getSmsCreditsBalance(
    supabase: QuoteRecoverySupabaseClient,
    userId: string
): Promise<{ balance: number; error: string | null }> {
    const { data, error } = await supabase
        .from("sms_credit_ledger")
        .select("delta_credits")
        .eq("user_id", userId)

    if (error) {
        return { balance: 0, error: error.message || "Failed to load SMS credits" }
    }

    const rows = Array.isArray(data) ? data : []
    const balance = rows.reduce((sum: number, row: Record<string, unknown>) => {
        const delta = asPositiveNumber(row?.delta_credits)
        if (delta === null) {
            const parsed = Number(row?.delta_credits || 0)
            return sum + (Number.isFinite(parsed) ? parsed : 0)
        }
        return sum + delta
    }, 0)

    return {
        balance,
        error: null,
    }
}

export async function claimEstimateForRecovery(
    supabase: QuoteRecoverySupabaseClient,
    estimateId: string,
    queuedAt: string
): Promise<boolean> {
    const { data, error } = await supabase
        .from("estimates")
        .update({ first_followup_queued_at: queuedAt })
        .eq("id", estimateId)
        .is("first_followup_queued_at", null)
        .select("id")
        .maybeSingle()

    if (error) {
        throw new Error(error.message || "Failed to claim estimate for follow-up")
    }

    return Boolean(data?.id)
}

export async function acknowledgeFollowupSent(
    supabase: QuoteRecoverySupabaseClient,
    estimateId: string,
    sentAt: string
): Promise<void> {
    const { error } = await supabase
        .from("estimates")
        .update({
            first_followed_up_at: sentAt,
            last_followed_up_at: sentAt,
        })
        .eq("id", estimateId)

    if (error) {
        throw new Error(error.message || "Failed to mark estimate as followed up")
    }
}

export async function releaseRecoveryClaim(supabase: QuoteRecoverySupabaseClient, estimateId: string): Promise<void> {
    await supabase
        .from("estimates")
        .update({ first_followup_queued_at: null })
        .eq("id", estimateId)
        .is("first_followed_up_at", null)
}

export async function persistRecoverySmsDispatch(
    supabase: QuoteRecoverySupabaseClient,
    input: {
        userId: string
        estimateId: string
        toPhoneE164: string
        messageId: string
        status: string
    }
): Promise<void> {
    const { error: messageError } = await supabase
        .from("sms_messages")
        .insert({
            user_id: input.userId,
            estimate_id: input.estimateId,
            to_phone_e164: input.toPhoneE164,
            provider_id: input.messageId,
            status: input.status,
        })

    if (messageError) {
        throw new Error(messageError.message || "Failed to persist SMS message")
    }

    const { error: ledgerError } = await supabase
        .from("sms_credit_ledger")
        .insert({
            user_id: input.userId,
            delta_credits: -1,
            reason: "quote_recovery_sms",
            ref_id: input.messageId,
        })

    if (ledgerError) {
        throw new Error(ledgerError.message || "Failed to update SMS credit ledger")
    }
}

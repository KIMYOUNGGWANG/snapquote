import { sendViaResend, sendViaTwilio } from "@/lib/server/quote-recovery-delivery"
import {
    acknowledgeFollowupSent,
    claimEstimateForRecovery,
    persistRecoverySmsDispatch,
    releaseRecoveryClaim,
} from "@/lib/server/quote-recovery-store"
import type { CandidateContact, RecoveryAction } from "@/lib/server/quote-recovery-types"
import type { QuoteRecoverySupabaseClient } from "@/lib/server/quote-recovery-store"

export async function dispatchRecoveryFollowup(input: {
    supabase: QuoteRecoverySupabaseClient
    action: Extract<RecoveryAction, "sent_sms" | "sent_email">
    userId: string
    estimateId: string
    estimateNumber: string
    contact: CandidateContact
    message: string
    smsBalance: number
}): Promise<{ dispatched: boolean; smsBalanceAfter?: number }> {
    const queuedAt = new Date().toISOString()
    const claimed = await claimEstimateForRecovery(input.supabase, input.estimateId, queuedAt)
    if (!claimed) return { dispatched: false }

    let didDispatch = false
    try {
        if (input.action === "sent_sms") {
            const sms = await sendViaTwilio(input.contact.clientPhone, input.message)
            didDispatch = true
            await persistRecoverySmsDispatch(input.supabase, {
                userId: input.userId,
                estimateId: input.estimateId,
                toPhoneE164: input.contact.clientPhone,
                messageId: sms.messageId,
                status: sms.status,
            })
            const sentAt = new Date().toISOString()
            await acknowledgeFollowupSent(input.supabase, input.estimateId, sentAt)
            return {
                dispatched: true,
                smsBalanceAfter: Math.max(0, input.smsBalance - 1),
            }
        }

        await sendViaResend({
            toEmail: input.contact.clientEmail,
            clientName: input.contact.clientName,
            businessName: input.contact.businessName,
            message: input.message,
            estimateNumber: input.estimateNumber,
        })
        didDispatch = true
        const sentAt = new Date().toISOString()
        await acknowledgeFollowupSent(input.supabase, input.estimateId, sentAt)
        return { dispatched: true }
    } catch (error) {
        if (!didDispatch) {
            await releaseRecoveryClaim(input.supabase, input.estimateId)
        }
        throw error
    }
}

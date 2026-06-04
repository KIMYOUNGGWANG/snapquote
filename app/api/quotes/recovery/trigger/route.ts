import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import { isEstimatePaidLike } from "@/lib/estimate-payment-state"
import { hasValidCronSecret, parseJsonBody } from "@/lib/server/quote-recovery-auth"
import {
    buildCustomerDecisionSkipPreview,
    buildPaidSkipPreview,
    buildScopeReviewSkipPreview,
    getCustomerDecisionSkipAction,
    isActionableRecoveryAction,
    toMessagePreview,
} from "@/lib/server/quote-recovery-messages"
import {
    asPositiveNumber,
    asTrimmedString,
    candidateNeedsScopeReview,
    customerPortalKey,
    extractCandidateContact,
    normalizePayload,
    shouldProcessEstimate,
} from "@/lib/server/quote-recovery-normalization"
import { generateRecoveryMessage } from "@/lib/server/quote-recovery-delivery"
import { dispatchRecoveryFollowup } from "@/lib/server/quote-recovery-dispatch"
import {
    getSmsCreditsBalance,
    loadCustomerPortalLinks,
    loadPlanTier,
    loadRecoveryCandidates,
} from "@/lib/server/quote-recovery-store"
import type {
    RecoveryAction,
    RecoveryResult,
} from "@/lib/server/quote-recovery-types"

const PRO_TIERS = new Set(["pro", "team"])
const MAX_CANDIDATES = 50

export async function POST(req: Request) {
    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `quote-recovery:${ip}`,
        limit: 10,
        windowMs: 60 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: "Too many requests. Please try again later." },
            { status: 429 }
        )
    }

    const cronAuthorized = hasValidCronSecret(req)
    let callerUserId: string | null = null

    if (!cronAuthorized) {
        const auth = await requireAuthenticatedUser(req)
        if (!auth.ok) {
            return auth.response
        }
        callerUserId = auth.userId
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json(
            { error: "Supabase service configuration is missing." },
            { status: 500 }
        )
    }

    if (callerUserId) {
        const tier = await loadPlanTier(supabase, callerUserId)
        if (tier.error) {
            return NextResponse.json(
                { error: tier.error },
                { status: 500 }
            )
        }

        if (!PRO_TIERS.has(tier.planTier)) {
            return NextResponse.json(
                { error: "Quote Recovery Copilot requires Pro or Team plan." },
                { status: 402 }
            )
        }
    }

    let body: unknown
    try {
        body = await parseJsonBody(req)
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 }
        )
    }

    const payload = normalizePayload(body)
    if (!payload) {
        return NextResponse.json(
            { error: "Invalid recovery payload" },
            { status: 400 }
        )
    }

    const candidateLoad = await loadRecoveryCandidates(supabase, payload, callerUserId)
    if (candidateLoad.error) {
        return NextResponse.json(
            { error: candidateLoad.error },
            { status: 500 }
        )
    }

    const nowMs = Date.now()
    const processableCandidates = candidateLoad.candidates.filter((candidate) => shouldProcessEstimate(candidate, nowMs))
    let customerPortalByEstimate: Awaited<ReturnType<typeof loadCustomerPortalLinks>>
    try {
        customerPortalByEstimate = await loadCustomerPortalLinks(supabase, processableCandidates)
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to load customer quote portal links." },
            { status: 500 }
        )
    }

    const candidates = processableCandidates.slice(0, MAX_CANDIDATES)

    const smsBalanceByUser = new Map<string, number>()
    const results: RecoveryResult[] = []

    for (const candidate of candidates) {
        const estimateId = asTrimmedString(candidate.id, 128)
        if (!estimateId) continue

        const estimateNumber = asTrimmedString(candidate.estimate_number, 80) || estimateId
        const totalAmount = asPositiveNumber(candidate.total_amount)
        const contact = extractCandidateContact(candidate)
        const customerPortal = customerPortalByEstimate.get(customerPortalKey(candidate.user_id, estimateId))
        const customerDecisionSkipAction = getCustomerDecisionSkipAction(customerPortal)

        if (isEstimatePaidLike(candidate)) {
            results.push({
                estimateId,
                estimateNumber,
                action: "skipped_customer_paid",
                customerPortalStatus: customerPortal?.status,
                messagePreview: toMessagePreview(buildPaidSkipPreview(estimateNumber)),
            })
            continue
        }

        if (customerDecisionSkipAction && customerPortal) {
            results.push({
                estimateId,
                estimateNumber,
                action: customerDecisionSkipAction,
                customerPortalStatus: customerPortal.status,
                messagePreview: toMessagePreview(buildCustomerDecisionSkipPreview(customerPortal, estimateNumber)),
            })
            continue
        }

        if (candidateNeedsScopeReview(candidate)) {
            results.push({
                estimateId,
                estimateNumber,
                action: "skipped_scope_review_needed",
                customerPortalStatus: customerPortal?.status,
                messagePreview: toMessagePreview(buildScopeReviewSkipPreview(estimateNumber)),
            })
            continue
        }

        const message = await generateRecoveryMessage({
            clientName: contact.clientName,
            estimateNumber,
            totalAmount,
            businessName: contact.businessName,
            customerPortalStatus: customerPortal?.status,
            customerPortalUrl: customerPortal?.shareUrl,
        })
        const messagePreview = toMessagePreview(message)

        let action: RecoveryAction = "skipped_no_contact"
        let smsBalance = 0

        if (contact.clientPhone) {
            if (!smsBalanceByUser.has(candidate.user_id)) {
                const credits = await getSmsCreditsBalance(supabase, candidate.user_id)
                if (credits.error) {
                    return NextResponse.json(
                        { error: credits.error },
                        { status: 500 }
                    )
                }
                smsBalanceByUser.set(candidate.user_id, credits.balance)
            }

            smsBalance = smsBalanceByUser.get(candidate.user_id) || 0
            if (smsBalance > 0) {
                action = "sent_sms"
            }
        }

        if (action !== "sent_sms" && contact.clientEmail) {
            action = "sent_email"
        }

        if (payload.dryRun || action === "skipped_no_contact") {
            results.push({
                estimateId,
                estimateNumber,
                action,
                customerPortalStatus: customerPortal?.status,
                messagePreview,
            })
            continue
        }

        if (action !== "sent_sms" && action !== "sent_email") continue

        try {
            const dispatch = await dispatchRecoveryFollowup({
                supabase,
                action,
                userId: candidate.user_id,
                estimateId,
                estimateNumber,
                contact,
                message,
                smsBalance,
            })
            if (!dispatch.dispatched) continue
            if (dispatch.smsBalanceAfter !== undefined) {
                smsBalanceByUser.set(candidate.user_id, dispatch.smsBalanceAfter)
            }

            results.push({
                estimateId,
                estimateNumber,
                action,
                customerPortalStatus: customerPortal?.status,
                messagePreview,
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to dispatch quote recovery follow-up."
            console.error("Quote recovery dispatch error:", error)
            return NextResponse.json(
                { error: message },
                { status: 500 }
            )
        }
    }

    const actionableCount = results.filter((result) => isActionableRecoveryAction(result.action)).length
    const skippedCount = results.length - actionableCount

    return NextResponse.json({
        ok: true,
        processedCount: results.length,
        actionableCount,
        skippedCount,
        results,
    })
}

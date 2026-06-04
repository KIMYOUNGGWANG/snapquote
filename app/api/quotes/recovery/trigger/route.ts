import { NextResponse } from "next/server"
import { Resend } from "resend"
import { extractGeminiText } from "@/lib/ai/gemini"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import { resolveEffectivePlanTier } from "@/lib/server/effective-plan"
import { isEstimatePaidLike } from "@/lib/estimate-payment-state"
import {
    appendCustomerPortalReviewLink,
    buildCustomerDecisionSkipPreview,
    buildPaidSkipPreview,
    buildScopeReviewSkipPreview,
    defaultRecoveryMessage,
    getCustomerDecisionSkipAction,
    isActionableRecoveryAction,
    toMessagePreview,
} from "@/lib/server/quote-recovery-messages"
import {
    asOptionalHttpUrl,
    asPositiveNumber,
    asTrimmedString,
    candidateNeedsScopeReview,
    customerPortalKey,
    extractCandidateContact,
    getErrorCode,
    getErrorMessage,
    isPlainObject,
    normalizeCustomerPortalStatus,
    normalizePayload,
    shouldProcessEstimate,
} from "@/lib/server/quote-recovery-normalization"
import type {
    CandidateCustomerPortal,
    CandidateEstimate,
    CustomerPortalFollowupStatus,
    RecoveryAction,
    RecoveryResult,
} from "@/lib/server/quote-recovery-types"

const PRO_TIERS = new Set(["pro", "team"])
const MAX_CANDIDATES = 50
const GEMINI_RECOVERY_MODEL = process.env.GEMINI_RECOVERY_MODEL?.trim() || "gemini-2.5-flash"

async function parseJsonBody(req: Request): Promise<unknown> {
    const raw = await req.text()
    if (!raw.trim()) return {}
    return JSON.parse(raw)
}

function parseBearerToken(req: Request): string {
    const authHeader = req.headers.get("authorization") || ""
    if (!authHeader.toLowerCase().startsWith("bearer ")) return ""
    return authHeader.slice(7).trim()
}

function hasValidCronSecret(req: Request): boolean {
    const configured = process.env.CRON_SECRET?.trim() || ""
    if (!configured) return false

    const bearer = parseBearerToken(req)
    const cronHeader = asTrimmedString(req.headers.get("x-cron-secret"), 512)
    return bearer === configured || cronHeader === configured
}

async function loadPlanTier(
    supabase: any,
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

async function loadCustomerPortalLinks(
    supabase: any,
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

async function generateRecoveryMessage(input: {
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

async function getSmsCreditsBalance(
    supabase: any,
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
    const balance = rows.reduce((sum: number, row: any) => {
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

async function sendViaTwilio(toPhoneNumber: string, message: string): Promise<{ messageId: string; status: string }> {
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

async function sendViaResend(input: {
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

    return asTrimmedString((response as any)?.id, 120) || "resend-message"
}

async function claimEstimateForRecovery(supabase: any, estimateId: string, queuedAt: string): Promise<boolean> {
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

async function acknowledgeFollowupSent(supabase: any, estimateId: string, sentAt: string): Promise<void> {
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

async function releaseRecoveryClaim(supabase: any, estimateId: string): Promise<void> {
    await supabase
        .from("estimates")
        .update({ first_followup_queued_at: null })
        .eq("id", estimateId)
        .is("first_followed_up_at", null)
}

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
        return NextResponse.json(
            { error: "Failed to load quote recovery candidates." },
            { status: 500 }
        )
    }

    const nowMs = Date.now()
    const allCandidates = Array.isArray(data) ? (data as CandidateEstimate[]) : []
    const processableCandidates = allCandidates.filter((candidate) => shouldProcessEstimate(candidate, nowMs))
    let customerPortalByEstimate: Map<string, CandidateCustomerPortal>
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

        const queuedAt = new Date().toISOString()
        const claimed = await claimEstimateForRecovery(supabase, estimateId, queuedAt)
        if (!claimed) {
            continue
        }

        let didDispatch = false
        try {
            if (action === "sent_sms") {
                const sms = await sendViaTwilio(contact.clientPhone, message)
                didDispatch = true

                const { error: messageError } = await supabase
                    .from("sms_messages")
                    .insert({
                        user_id: candidate.user_id,
                        estimate_id: estimateId,
                        to_phone_e164: contact.clientPhone,
                        provider_id: sms.messageId,
                        status: sms.status,
                    })

                if (messageError) {
                    throw new Error(messageError.message || "Failed to persist SMS message")
                }

                const { error: ledgerError } = await supabase
                    .from("sms_credit_ledger")
                    .insert({
                        user_id: candidate.user_id,
                        delta_credits: -1,
                        reason: "quote_recovery_sms",
                        ref_id: sms.messageId,
                    })

                if (ledgerError) {
                    throw new Error(ledgerError.message || "Failed to update SMS credit ledger")
                }

                smsBalanceByUser.set(candidate.user_id, Math.max(0, smsBalance - 1))
            } else {
                await sendViaResend({
                    toEmail: contact.clientEmail,
                    clientName: contact.clientName,
                    businessName: contact.businessName,
                    message,
                    estimateNumber,
                })
                didDispatch = true
            }

            const sentAt = new Date().toISOString()
            await acknowledgeFollowupSent(supabase, estimateId, sentAt)

            results.push({
                estimateId,
                estimateNumber,
                action,
                customerPortalStatus: customerPortal?.status,
                messagePreview,
            })
        } catch (error: any) {
            if (!didDispatch) {
                await releaseRecoveryClaim(supabase, estimateId)
            }
            console.error("Quote recovery dispatch error:", error)
            return NextResponse.json(
                { error: error?.message || "Failed to dispatch quote recovery follow-up." },
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

import { NextResponse } from "next/server"
import { Resend } from "resend"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import {
    buildOnboardingLifecycleEmail,
    ONBOARDING_LIFECYCLE_STAGES,
    resolveLifecycleStageForAgeHours,
    shouldSkipLifecycleStage,
    type LifecycleActivitySummary,
    type OnboardingLifecycleStage,
} from "@/lib/server/onboarding-lifecycle"

const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type TriggerPayload = {
    dryRun: boolean
    stage?: OnboardingLifecycleStage
    userId?: string
    limit: number
}

type CandidateProfile = {
    id: string
    email?: string | null
    business_name?: string | null
    created_at?: string | null
}

type LifecycleSendLog = {
    user_id?: string | null
    stage?: string | null
}

type AnalyticsEventRow = {
    user_id?: string | null
    event_name?: string | null
}

function asTrimmedString(value: unknown, maxLength: number): string {
    if (typeof value !== "string") return ""
    return value.trim().slice(0, maxLength)
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

function normalizeLimit(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(parsed)) return DEFAULT_LIMIT
    return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)))
}

function normalizeStage(value: unknown): OnboardingLifecycleStage | undefined {
    if (typeof value !== "string") return undefined
    return ONBOARDING_LIFECYCLE_STAGES.includes(value as OnboardingLifecycleStage)
        ? (value as OnboardingLifecycleStage)
        : undefined
}

function normalizeUserId(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined
    const trimmed = value.trim()
    return UUID_PATTERN.test(trimmed) ? trimmed : undefined
}

async function parsePayload(req: Request): Promise<TriggerPayload | null> {
    const raw = await req.text()
    if (!raw.trim()) {
        return {
            dryRun: false,
            limit: DEFAULT_LIMIT,
        }
    }

    const body = JSON.parse(raw)
    if (!body || typeof body !== "object" || Array.isArray(body)) return null

    const stage = normalizeStage((body as Record<string, unknown>).stage)
    if ((body as Record<string, unknown>).stage !== undefined && !stage) return null

    const userId = normalizeUserId((body as Record<string, unknown>).userId)
    if ((body as Record<string, unknown>).userId !== undefined && !userId) return null

    return {
        dryRun: (body as Record<string, unknown>).dryRun === true,
        stage,
        userId,
        limit: normalizeLimit((body as Record<string, unknown>).limit),
    }
}

function normalizeEmail(value: unknown): string {
    const email = asTrimmedString(value, 320).toLowerCase()
    return EMAIL_PATTERN.test(email) ? email : ""
}

function parseCreatedAt(value: unknown): number | null {
    if (typeof value !== "string") return null
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
}

function getAppUrl(): string {
    return (
        process.env.NEXT_PUBLIC_APP_URL?.trim()
        || process.env.NEXT_PUBLIC_SITE_URL?.trim()
        || "http://localhost:3000"
    )
}

function groupEventsByUser(rows: AnalyticsEventRow[]): Map<string, LifecycleActivitySummary> {
    const grouped = new Map<string, LifecycleActivitySummary>()

    for (const row of rows) {
        const userId = asTrimmedString(row.user_id, 64)
        if (!userId) continue

        const current = grouped.get(userId) || {
            draftSavedCount: 0,
            quoteSentCount: 0,
            paymentLinkCreatedCount: 0,
        }
        const eventName = asTrimmedString(row.event_name, 64)

        if (eventName === "draft_saved") current.draftSavedCount += 1
        if (eventName === "quote_sent") current.quoteSentCount += 1
        if (eventName === "payment_link_created") current.paymentLinkCreatedCount += 1

        grouped.set(userId, current)
    }

    return grouped
}

export async function POST(req: Request) {
    if (!hasValidCronSecret(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload = await parsePayload(req).catch(() => null)
    if (!payload) {
        return NextResponse.json({ error: "Invalid onboarding lifecycle payload" }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json({ error: "Supabase service client is not configured" }, { status: 500 })
    }

    if (!payload.dryRun && !process.env.RESEND_API_KEY?.trim()) {
        return NextResponse.json({ error: "Resend is not configured" }, { status: 500 })
    }

    const nowMs = Date.now()
    const lookbackIso = new Date(nowMs - 8 * 24 * 60 * 60 * 1000).toISOString()

    let profileQuery = supabase
        .from("profiles")
        .select("id, email, business_name, created_at")
        .gte("created_at", lookbackIso)
        .order("created_at", { ascending: false })
        .limit(payload.limit)

    if (payload.userId) {
        profileQuery = profileQuery.eq("id", payload.userId)
    }

    const { data: profilesRaw, error: profilesError } = await profileQuery
    if (profilesError) {
        return NextResponse.json({ error: "Failed to load onboarding lifecycle candidates." }, { status: 500 })
    }

    const profiles = Array.isArray(profilesRaw) ? profilesRaw as CandidateProfile[] : []
    const userIds = profiles.map((profile) => profile.id).filter(Boolean)

    const [sendLogResult, activityResult] = await Promise.all([
        userIds.length > 0
            ? supabase
                .from("onboarding_lifecycle_sends")
                .select("user_id, stage")
                .in("user_id", userIds)
            : Promise.resolve({ data: [], error: null }),
        userIds.length > 0
            ? supabase
                .from("analytics_events")
                .select("user_id, event_name")
                .in("user_id", userIds)
                .in("event_name", ["draft_saved", "quote_sent", "payment_link_created"])
            : Promise.resolve({ data: [], error: null }),
    ])

    if (sendLogResult.error || activityResult.error) {
        return NextResponse.json({ error: "Failed to load onboarding lifecycle state." }, { status: 500 })
    }

    const sentKeys = new Set(
        ((sendLogResult.data || []) as LifecycleSendLog[])
            .map((row) => `${asTrimmedString(row.user_id, 64)}:${asTrimmedString(row.stage, 32)}`)
    )
    const activityByUser = groupEventsByUser((activityResult.data || []) as AnalyticsEventRow[])
    const appUrl = getAppUrl()
    const resend = payload.dryRun ? null : new Resend(process.env.RESEND_API_KEY!)

    const results: Array<{
        userId: string
        email: string
        stage: OnboardingLifecycleStage
        action: "sent" | "would_send" | "skipped_missing_email" | "skipped_not_due" | "skipped_already_sent" | "skipped_already_activated"
        subject: string
        messagePreview: string
    }> = []

    for (const profile of profiles) {
        const userId = asTrimmedString(profile.id, 64)
        if (!userId) continue

        const createdAtMs = parseCreatedAt(profile.created_at)
        const ageHours = createdAtMs === null ? Number.NaN : (nowMs - createdAtMs) / (1000 * 60 * 60)
        const stage = resolveLifecycleStageForAgeHours(ageHours, payload.stage)
        const email = normalizeEmail(profile.email)
        const activity = activityByUser.get(userId) || {
            draftSavedCount: 0,
            quoteSentCount: 0,
            paymentLinkCreatedCount: 0,
        }
        const fallbackStage = payload.stage || "day_0"
        const content = buildOnboardingLifecycleEmail({
            stage: stage || fallbackStage,
            businessName: profile.business_name,
            appUrl,
            activity,
        })

        if (!stage) {
            results.push({
                userId,
                email,
                stage: fallbackStage,
                action: "skipped_not_due",
                subject: content.subject,
                messagePreview: content.preview,
            })
            continue
        }

        if (!email) {
            results.push({
                userId,
                email: "",
                stage,
                action: "skipped_missing_email",
                subject: content.subject,
                messagePreview: content.preview,
            })
            continue
        }

        if (sentKeys.has(`${userId}:${stage}`)) {
            results.push({
                userId,
                email,
                stage,
                action: "skipped_already_sent",
                subject: content.subject,
                messagePreview: content.preview,
            })
            continue
        }

        if (shouldSkipLifecycleStage(stage, activity)) {
            results.push({
                userId,
                email,
                stage,
                action: "skipped_already_activated",
                subject: content.subject,
                messagePreview: content.preview,
            })
            continue
        }

        if (payload.dryRun) {
            results.push({
                userId,
                email,
                stage,
                action: "would_send",
                subject: content.subject,
                messagePreview: content.preview,
            })
            continue
        }

        const { data: claimRow, error: claimError } = await supabase
            .from("onboarding_lifecycle_sends")
            .insert({
                user_id: userId,
                stage,
                email,
                subject: content.subject,
                message_preview: content.preview,
                status: "queued",
            })
            .select("id")
            .single()

        if (claimError) {
            if ((claimError as { code?: string }).code === "23505") {
                results.push({
                    userId,
                    email,
                    stage,
                    action: "skipped_already_sent",
                    subject: content.subject,
                    messagePreview: content.preview,
                })
                continue
            }

            return NextResponse.json({ error: "Failed to claim onboarding lifecycle send." }, { status: 500 })
        }

        const sendResponse = await resend!.emails.send({
            from: "SnapQuote <onboarding@resend.dev>",
            to: [email],
            subject: content.subject,
            html: content.html,
        })

        if (sendResponse.error) {
            await supabase
                .from("onboarding_lifecycle_sends")
                .update({
                    status: "failed",
                    error_message: sendResponse.error.message || "Resend request failed",
                })
                .eq("id", claimRow.id)

            return NextResponse.json({ error: sendResponse.error.message || "Failed to send onboarding lifecycle email." }, { status: 500 })
        }

        await supabase
            .from("onboarding_lifecycle_sends")
            .update({
                status: "sent",
                sent_at: new Date().toISOString(),
                provider_message_id: sendResponse.data?.id || sendResponse.id || null,
            })
            .eq("id", claimRow.id)

        results.push({
            userId,
            email,
            stage,
            action: "sent",
            subject: content.subject,
            messagePreview: content.preview,
        })
    }

    return NextResponse.json({
        ok: true,
        dryRun: payload.dryRun,
        processedCount: results.filter((item) => item.action === "sent" || item.action === "would_send").length,
        results,
    })
}

import type { SupabaseClient } from "@supabase/supabase-js"
import { createAuthedSupabaseClient, parseBearerToken } from "@/lib/server/supabase-auth"

export type UsageMetric = "generate" | "transcribe" | "send_email"
type PlanTier = "free" | "starter" | "pro" | "team"

type QuotaMilestone = "warning" | "limit"

interface UsageCountersRow {
    id: string
    user_id: string
    period_start: string
    plan_tier: PlanTier
    generate_count: number
    transcribe_count: number
    send_email_count: number
    openai_prompt_tokens: number
    openai_completion_tokens: number
    openai_estimated_cost: number
    resend_estimated_cost: number
    updated_at: string
}

interface UsageContext {
    supabase: SupabaseClient
    userId: string
    planTier: PlanTier
    periodStart: string
    row: UsageCountersRow
}

interface ResolveUsageContextOptions {
    requireAuth?: boolean
}

interface ResolvedUsageContext {
    context: UsageContext | null
    status?: number
    error?: string
}

export interface QuotaCheckResult {
    ok: boolean
    status?: number
    error?: string
    context: UsageContext | null
    used?: number
    limit?: number
    remaining?: number
    planTier?: PlanTier
}

interface EnforceUsageQuotaOptions {
    requireAuth?: boolean
}

export interface UsageRecordInput {
    promptTokens?: number
    completionTokens?: number
    resendCostUsd?: number
}

const PLAN_LIMITS: Record<PlanTier, Record<UsageMetric, number>> = {
    free: {
        generate: 3,
        transcribe: 5,
        send_email: 3,
    },
    starter: {
        generate: 80,
        transcribe: 60,
        send_email: 60,
    },
    pro: {
        generate: 250,
        transcribe: 180,
        send_email: 200,
    },
    team: {
        generate: 800,
        transcribe: 600,
        send_email: 600,
    },
}

const OPENAI_INPUT_COST_PER_TOKEN = 5 / 1_000_000
const OPENAI_OUTPUT_COST_PER_TOKEN = 15 / 1_000_000
const DEFAULT_RESEND_COST_USD = 0.001

function toPlanTier(value: unknown): PlanTier {
    if (value === "starter") return "starter"
    if (value === "pro") return "pro"
    if (value === "team") return "team"
    return "free"
}

function toNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return 0
}

function getMonthPeriodStart(date = new Date()): string {
    const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    return utc.toISOString().slice(0, 10)
}

function metricCount(row: UsageCountersRow, metric: UsageMetric): number {
    if (metric === "generate") return toNumber(row.generate_count)
    if (metric === "transcribe") return toNumber(row.transcribe_count)
    return toNumber(row.send_email_count)
}

async function ensureProfileRow(supabase: SupabaseClient, userId: string): Promise<void> {
    try {
        await supabase.from("profiles").upsert(
            { id: userId },
            { onConflict: "id", ignoreDuplicates: true }
        )
    } catch {
        // Profile creation should not block runtime usage checks.
    }
}

async function loadPlanTier(supabase: SupabaseClient, userId: string): Promise<PlanTier> {
    const { data, error } = await supabase
        .from("profiles")
        .select("plan_tier")
        .eq("id", userId)
        .maybeSingle()

    if (error) {
        return "free"
    }

    return toPlanTier(data?.plan_tier)
}

async function getOrCreateUsageRow(
    supabase: SupabaseClient,
    userId: string,
    periodStart: string,
    planTier: PlanTier
): Promise<UsageCountersRow> {
    const { data: existing, error: existingError } = await supabase
        .from("usage_counters_monthly")
        .select("*")
        .eq("user_id", userId)
        .eq("period_start", periodStart)
        .maybeSingle()

    if (existingError) throw existingError
    if (existing) {
        return {
            ...(existing as UsageCountersRow),
            plan_tier: toPlanTier(existing.plan_tier),
        }
    }

    const { data: inserted, error: insertError } = await supabase
        .from("usage_counters_monthly")
        .insert({
            user_id: userId,
            period_start: periodStart,
            plan_tier: planTier,
        })
        .select("*")
        .single()

    if (insertError || !inserted) throw insertError || new Error("Failed to initialize usage row")

    return {
        ...(inserted as UsageCountersRow),
        plan_tier: toPlanTier(inserted.plan_tier),
    }
}

async function emitQuotaMilestoneEvent(
    context: UsageContext,
    metric: UsageMetric,
    milestone: QuotaMilestone,
    used: number,
    limit: number
): Promise<void> {
    const eventName = milestone === "warning" ? "free_quota_warning" : "free_quota_limit_hit"
    const externalId = `quota:${context.userId}:${context.periodStart}:${metric}:${milestone}`

    try {
        await context.supabase
            .from("analytics_events")
            .upsert(
                {
                    user_id: context.userId,
                    event_name: eventName,
                    channel: "paywall",
                    external_id: externalId,
                    metadata: {
                        metric,
                        used,
                        limit,
                        periodStart: context.periodStart,
                        planTier: context.planTier,
                    },
                },
                {
                    onConflict: "external_id",
                    ignoreDuplicates: true,
                }
            )
    } catch {
        // Analytics insert should never break core flows.
    }
}

async function resolveUsageContext(
    req: Request,
    options: ResolveUsageContextOptions = {}
): Promise<ResolvedUsageContext> {
    const token = parseBearerToken(req)

    if (!token) {
        if (options.requireAuth) {
            return { context: null, status: 401, error: "Unauthorized" }
        }
        return { context: null }
    }

    const supabase = createAuthedSupabaseClient(token)
    if (!supabase) {
        if (options.requireAuth) {
            return { context: null, status: 500, error: "Supabase is not configured" }
        }
        return { context: null }
    }

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
        if (options.requireAuth) {
            return { context: null, status: 401, error: "Unauthorized" }
        }
        return { context: null }
    }

    const userId = user.id
    const periodStart = getMonthPeriodStart()

    try {
        await ensureProfileRow(supabase, userId)

        const planTier = await loadPlanTier(supabase, userId)
        const row = await getOrCreateUsageRow(supabase, userId, periodStart, planTier)

        return {
            context: {
                supabase,
                userId,
                planTier,
                periodStart,
                row,
            },
        }
    } catch (error) {
        console.error("Usage context resolution failed:", error)
        if (options.requireAuth) {
            return { context: null, status: 500, error: "Failed to resolve usage context" }
        }
        return { context: null }
    }
}

export async function enforceUsageQuota(
    req: Request,
    metric: UsageMetric,
    options: EnforceUsageQuotaOptions = {}
): Promise<QuotaCheckResult> {
    const resolved = await resolveUsageContext(req, { requireAuth: Boolean(options.requireAuth) })
    if (!resolved.context) {
        if (resolved.error) {
            return {
                ok: false,
                status: resolved.status || 401,
                error: resolved.error,
                context: null,
            }
        }

        // No auth token and auth not required: keep endpoint usable, but no per-user quota enforcement.
        return { ok: true, context: null }
    }

    const context = resolved.context
    const used = metricCount(context.row, metric)
    const limit = PLAN_LIMITS[context.planTier][metric]
    const remaining = Math.max(0, limit - used)

    if (context.planTier === "free") {
        if (limit > 0 && used >= limit) {
            await emitQuotaMilestoneEvent(context, metric, "limit", used, limit)

            return {
                ok: false,
                status: 402,
                error: `Free plan monthly limit reached for ${metric}.`,
                context,
                used,
                limit,
                remaining,
                planTier: context.planTier,
            }
        }

        if (limit > 0 && used >= Math.ceil(limit * 0.8)) {
            await emitQuotaMilestoneEvent(context, metric, "warning", used, limit)
        }
    }

    return {
        ok: true,
        context,
        used,
        limit,
        remaining,
        planTier: context.planTier,
    }
}

export async function recordUsage(
    context: UsageContext | null,
    metric: UsageMetric,
    input: UsageRecordInput = {}
): Promise<void> {
    if (!context) return

    const current = context.row
    const nextGenerateCount = toNumber(current.generate_count) + (metric === "generate" ? 1 : 0)
    const nextTranscribeCount = toNumber(current.transcribe_count) + (metric === "transcribe" ? 1 : 0)
    const nextSendEmailCount = toNumber(current.send_email_count) + (metric === "send_email" ? 1 : 0)

    const promptTokens = Math.max(0, Math.floor(input.promptTokens || 0))
    const completionTokens = Math.max(0, Math.floor(input.completionTokens || 0))
    const openaiCostIncrement =
        promptTokens * OPENAI_INPUT_COST_PER_TOKEN + completionTokens * OPENAI_OUTPUT_COST_PER_TOKEN

    const resendCostIncrement = metric === "send_email"
        ? Math.max(0, Number.isFinite(input.resendCostUsd) ? Number(input.resendCostUsd) : DEFAULT_RESEND_COST_USD)
        : 0

    const nextRowUpdate = {
        plan_tier: context.planTier,
        generate_count: nextGenerateCount,
        transcribe_count: nextTranscribeCount,
        send_email_count: nextSendEmailCount,
        openai_prompt_tokens: toNumber(current.openai_prompt_tokens) + promptTokens,
        openai_completion_tokens: toNumber(current.openai_completion_tokens) + completionTokens,
        openai_estimated_cost: Number((toNumber(current.openai_estimated_cost) + openaiCostIncrement).toFixed(6)),
        resend_estimated_cost: Number((toNumber(current.resend_estimated_cost) + resendCostIncrement).toFixed(6)),
        updated_at: new Date().toISOString(),
    }

    const { data: updated, error: updateError } = await context.supabase
        .from("usage_counters_monthly")
        .update(nextRowUpdate)
        .eq("id", current.id)
        .select("*")
        .single()

    if (updateError || !updated) {
        console.error("Failed to update usage counters:", updateError)
        return
    }

    const normalizedUpdated: UsageCountersRow = {
        ...(updated as UsageCountersRow),
        plan_tier: toPlanTier(updated.plan_tier),
    }

    context.row = normalizedUpdated

    if (context.planTier !== "free") return

    const updatedUsed = metricCount(normalizedUpdated, metric)
    const limit = PLAN_LIMITS[context.planTier][metric]

    if (limit > 0 && updatedUsed >= limit) {
        await emitQuotaMilestoneEvent(context, metric, "limit", updatedUsed, limit)
        return
    }

    if (limit > 0 && updatedUsed >= Math.ceil(limit * 0.8)) {
        await emitQuotaMilestoneEvent(context, metric, "warning", updatedUsed, limit)
    }
}

export async function getUsageSnapshot(req: Request): Promise<
    | {
        ok: true
        data: {
            planTier: PlanTier
            periodStart: string
            usage: Record<UsageMetric, number>
            limits: Record<UsageMetric, number>
            remaining: Record<UsageMetric, number>
            usageRatePct: Record<UsageMetric, number>
            openaiPromptTokens: number
            openaiCompletionTokens: number
            estimatedCosts: {
                openai: number
                resend: number
                total: number
            }
        }
    }
    | { ok: false; status: number; error: string }
> {
    const resolved = await resolveUsageContext(req, { requireAuth: true })

    if (!resolved.context) {
        return {
            ok: false,
            status: resolved.status || 401,
            error: resolved.error || "Unauthorized",
        }
    }

    const { planTier, periodStart, row } = resolved.context
    const usage = {
        generate: toNumber(row.generate_count),
        transcribe: toNumber(row.transcribe_count),
        send_email: toNumber(row.send_email_count),
    }
    const limits = PLAN_LIMITS[planTier]
    const remaining = {
        generate: Math.max(0, limits.generate - usage.generate),
        transcribe: Math.max(0, limits.transcribe - usage.transcribe),
        send_email: Math.max(0, limits.send_email - usage.send_email),
    }
    const usageRatePct = {
        generate: limits.generate > 0 ? Number(((usage.generate / limits.generate) * 100).toFixed(1)) : 0,
        transcribe: limits.transcribe > 0 ? Number(((usage.transcribe / limits.transcribe) * 100).toFixed(1)) : 0,
        send_email: limits.send_email > 0 ? Number(((usage.send_email / limits.send_email) * 100).toFixed(1)) : 0,
    }

    const estimatedOpenai = Number(toNumber(row.openai_estimated_cost).toFixed(4))
    const estimatedResend = Number(toNumber(row.resend_estimated_cost).toFixed(4))

    return {
        ok: true,
        data: {
            planTier,
            periodStart,
            usage,
            limits,
            remaining,
            usageRatePct,
            openaiPromptTokens: toNumber(row.openai_prompt_tokens),
            openaiCompletionTokens: toNumber(row.openai_completion_tokens),
            estimatedCosts: {
                openai: estimatedOpenai,
                resend: estimatedResend,
                total: Number((estimatedOpenai + estimatedResend).toFixed(4)),
            },
        },
    }
}

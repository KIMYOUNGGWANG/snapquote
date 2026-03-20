import type { SupabaseClient } from "@supabase/supabase-js"

export const REFERRAL_TOKEN_PATTERN = /^[a-z0-9]{8,32}$/
const TOKEN_LENGTH = 12

export type ReferralRewardMode = "pro_trial" | "pending_credit" | "none"

export type ReferralProfileRewardRow = {
    plan_tier?: unknown
    stripe_subscription_status?: unknown
    stripe_subscription_current_period_end?: unknown
    referral_trial_ends_at?: unknown
    referral_bonus_ends_at?: unknown
    referral_credit_balance_months?: unknown
}

export function generateReferralToken(): string {
    return crypto.randomUUID().replace(/-/g, "").slice(0, TOKEN_LENGTH)
}

export function normalizeReferralToken(value: unknown): string {
    if (typeof value !== "string") return ""
    return value.trim().toLowerCase()
}

export function asTrimmedReferralSource(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim().slice(0, 40)
    return trimmed || null
}

export function toOptionalIsoString(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed || null
}

export function addDaysIso(days: number, baseIso?: string | null): string {
    const base = baseIso ? new Date(baseIso) : new Date()
    const next = Number.isNaN(base.getTime()) ? new Date() : new Date(base.getTime())
    next.setUTCDate(next.getUTCDate() + days)
    return next.toISOString()
}

export function isFutureIso(value: unknown, now = Date.now()): value is string {
    if (typeof value !== "string") return false
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) && parsed > now
}

export function maxIso(a: string | null, b: string | null): string | null {
    if (!a) return b
    if (!b) return a
    return Date.parse(a) >= Date.parse(b) ? a : b
}

export function toNonNegativeInt(value: unknown): number {
    const numeric = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(numeric)) return 0
    return Math.max(0, Math.floor(numeric))
}

export function buildReferralShareUrl(origin: string, token: string): string {
    const url = new URL(origin)
    url.searchParams.set("ref", token)
    return url.toString()
}

export function buildReferralShareMessages(shareUrl: string): {
    en: string
    es: string
    ko: string
} {
    return {
        en: `SnapQuote turns rough field notes into a clean English quote in seconds. Try it here: ${shareUrl}`,
        es: `Oye, esta app te hace cotizaciones en ingles en segundos aunque hables espanol en la obra 👷 ${shareUrl}`,
        ko: `현장에서 한국어로 말해도 영어 견적서를 바로 만들어주는 SnapQuote예요. 여기서 써보세요: ${shareUrl}`,
    }
}

export async function getOrCreateReferralToken(
    supabase: SupabaseClient,
    userId: string
): Promise<{ token: string | null; error: string | null }> {
    const { data: existing, error: existingError } = await supabase
        .from("referral_tokens")
        .select("token")
        .eq("user_id", userId)
        .maybeSingle()

    if (existingError) {
        return { token: null, error: existingError.message || "Failed to load referral token" }
    }

    const existingToken = normalizeReferralToken(existing?.token)
    if (existingToken) {
        return { token: existingToken, error: null }
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const nextToken = generateReferralToken()
        const { data: inserted, error: insertError } = await supabase
            .from("referral_tokens")
            .insert({
                user_id: userId,
                token: nextToken,
            })
            .select("token")
            .single()

        const insertedToken = normalizeReferralToken(inserted?.token)
        if (!insertError && insertedToken) {
            return { token: insertedToken, error: null }
        }

        if (insertError?.code === "23505") {
            const { data: retriedExisting, error: retriedError } = await supabase
                .from("referral_tokens")
                .select("token")
                .eq("user_id", userId)
                .maybeSingle()

            if (retriedError) {
                return { token: null, error: retriedError.message || "Failed to load referral token" }
            }

            const retriedToken = normalizeReferralToken(retriedExisting?.token)
            if (retriedToken) {
                return { token: retriedToken, error: null }
            }

            continue
        }

        return { token: null, error: insertError?.message || "Failed to create referral token" }
    }

    return { token: null, error: "Failed to create referral token" }
}

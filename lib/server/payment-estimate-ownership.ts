import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"

type ServiceSupabaseClient = NonNullable<ReturnType<typeof createServiceSupabaseClient>>

export type PaymentEstimateRecord = {
    id: string
    user_id: string
    estimate_number: string | null
    status?: string | null
}

type PaymentLinkEstimateInput = {
    estimateId: string
    estimateNumber: string
    userId: string
}

type PaymentLinkEstimateResolution =
    | {
        ok: true
        estimate: PaymentEstimateRecord
    }
    | {
        ok: false
        status: 400 | 404 | 500
        error: string
    }

type SettlementEstimateInput = {
    estimateId: string
    estimateNumber: string
    userId: string
}

type SettlementEstimateResolution =
    | {
        ok: true
        estimate: PaymentEstimateRecord
    }
    | {
        ok: false
        reason: "missing_user_id" | "missing_reference" | "missing_estimate" | "ownership_mismatch" | "lookup_error"
        message: string
    }

async function fetchEstimateById(supabase: ServiceSupabaseClient, estimateId: string) {
    const result = await supabase
        .from("estimates")
        .select("id, user_id, estimate_number, status")
        .eq("id", estimateId)
        .maybeSingle()

    return {
        data: (result.data as PaymentEstimateRecord | null) ?? null,
        error: result.error,
    }
}

async function fetchEstimateByNumber(
    supabase: ServiceSupabaseClient,
    userId: string,
    estimateNumber: string
) {
    const result = await supabase
        .from("estimates")
        .select("id, user_id, estimate_number, status")
        .eq("user_id", userId)
        .eq("estimate_number", estimateNumber)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

    return {
        data: (result.data as PaymentEstimateRecord | null) ?? null,
        error: result.error,
    }
}

export async function resolveCallerEstimateForPaymentLink(
    supabase: ServiceSupabaseClient,
    input: PaymentLinkEstimateInput
): Promise<PaymentLinkEstimateResolution | null> {
    if (!input.estimateId && !input.estimateNumber) {
        return null
    }

    if (input.estimateId) {
        const { data, error } = await fetchEstimateById(supabase, input.estimateId)
        if (error) return { ok: false, status: 500, error: "Failed to load estimate." }
        if (!data || data.user_id !== input.userId) {
            return { ok: false, status: 404, error: "Estimate not found." }
        }
        if (input.estimateNumber && data.estimate_number && data.estimate_number !== input.estimateNumber) {
            return { ok: false, status: 400, error: "Estimate reference mismatch." }
        }
        return { ok: true, estimate: data }
    }

    const { data, error } = await fetchEstimateByNumber(supabase, input.userId, input.estimateNumber)
    if (error) return { ok: false, status: 500, error: "Failed to load estimate." }
    if (!data) return { ok: false, status: 404, error: "Estimate not found." }
    return { ok: true, estimate: data }
}

export async function resolveEstimateForSettlement(
    supabase: ServiceSupabaseClient,
    input: SettlementEstimateInput
): Promise<SettlementEstimateResolution> {
    if (!input.userId) {
        return {
            ok: false,
            reason: "missing_user_id",
            message: "Missing userId in Stripe metadata.",
        }
    }

    if (!input.estimateId && !input.estimateNumber) {
        return {
            ok: false,
            reason: "missing_reference",
            message: "Missing estimateId and estimateNumber in Stripe metadata.",
        }
    }

    if (input.estimateId) {
        const { data, error } = await fetchEstimateById(supabase, input.estimateId)
        if (error) {
            return {
                ok: false,
                reason: "lookup_error",
                message: error.message,
            }
        }
        if (!data) {
            return {
                ok: false,
                reason: "missing_estimate",
                message: "Estimate not found for Stripe settlement.",
            }
        }
        if (data.user_id !== input.userId) {
            return {
                ok: false,
                reason: "ownership_mismatch",
                message: "Stripe metadata userId does not match estimate owner.",
            }
        }
        if (input.estimateNumber && data.estimate_number && data.estimate_number !== input.estimateNumber) {
            return {
                ok: false,
                reason: "ownership_mismatch",
                message: "Stripe metadata estimateNumber does not match estimate record.",
            }
        }
        return { ok: true, estimate: data }
    }

    const { data, error } = await fetchEstimateByNumber(supabase, input.userId, input.estimateNumber)
    if (error) {
        return {
            ok: false,
            reason: "lookup_error",
            message: error.message,
        }
    }
    if (!data) {
        return {
            ok: false,
            reason: "missing_estimate",
            message: "Estimate not found for Stripe settlement.",
        }
    }
    return { ok: true, estimate: data }
}

import { resolveEffectivePlanTier } from "@/lib/server/effective-plan"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"

export type GeneratePlanTierResult =
    | { readonly ok: true; readonly planTier: string }
    | { readonly ok: false; readonly status: number; readonly error: string }

export async function resolveGeneratePlanTier(userId: string): Promise<GeneratePlanTierResult> {
    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return {
            ok: false,
            status: 500,
            error: "Supabase service configuration is missing.",
        }
    }

    const { data, error } = await supabase
        .from("profiles")
        .select("plan_tier, stripe_subscription_status, referral_trial_ends_at, referral_bonus_ends_at")
        .eq("id", userId)
        .maybeSingle()

    if (error) {
        return {
            ok: false,
            status: 500,
            error: error.message || "Failed to resolve plan tier",
        }
    }

    return {
        ok: true,
        planTier: resolveEffectivePlanTier(data || {}),
    }
}

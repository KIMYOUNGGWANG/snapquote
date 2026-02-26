import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export type StripeConnectProfile = {
    stripe_account_id: string | null
    stripe_charges_enabled: boolean | null
    stripe_payouts_enabled: boolean | null
    stripe_details_submitted: boolean | null
    stripe_onboarded_at: string | null
}

type ServiceSupabaseClient = SupabaseClient

export function createServiceSupabaseClient(): ServiceSupabaseClient | null {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return null
    }

    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    )
}

export async function ensureProfileExists(
    supabase: ServiceSupabaseClient,
    userId: string
): Promise<void> {
    await supabase.from("profiles").upsert(
        { id: userId },
        { onConflict: "id", ignoreDuplicates: true }
    )
}

export async function getStripeConnectProfile(
    supabase: ServiceSupabaseClient,
    userId: string
): Promise<{ data: StripeConnectProfile | null; error: { message: string } | null }> {
    const { data, error } = await supabase
        .from("profiles")
        .select("stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_onboarded_at")
        .eq("id", userId)
        .maybeSingle()

    return {
        data: (data as StripeConnectProfile | null) ?? null,
        error: error ? { message: error.message } : null,
    }
}

export async function upsertStripeConnectProfile(
    supabase: ServiceSupabaseClient,
    userId: string,
    updates: Partial<StripeConnectProfile>
) {
    return supabase
        .from("profiles")
        .upsert(
            { id: userId, ...updates },
            { onConflict: "id" }
        )
}

import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { createAuthedSupabaseClient, parseBearerToken } from "@/lib/server/supabase-auth"
import { createServiceSupabaseClient, ensureProfileExists } from "@/lib/server/stripe-connect"
import { getBillingPlanPriceConfig, type PaidBillingPlanTier } from "@/lib/server/stripe-billing"

const DEFAULT_EXPERIMENT_NAME = "pricing_v1"

type PricingVariantConfig = {
    name: string
    priceMonthly?: number
    ctaLabel?: string
    [key: string]: unknown
}

type PricingAssignmentRow = {
    experiment_id?: string | null
    variant?: string | null
    out_experiment_id?: string | null
    out_variant?: string | null
}

function isSchemaMismatchError(error: unknown, relatedTerms: string[] = []): boolean {
    if (!error || typeof error !== "object") return false
    const record = error as Record<string, unknown>
    const code = typeof record.code === "string" ? record.code : ""
    const rawMessage = [
        typeof record.message === "string" ? record.message : "",
        typeof record.details === "string" ? record.details : "",
        typeof record.hint === "string" ? record.hint : "",
    ]
        .join(" ")
        .toLowerCase()

    if (code === "PGRST204" || code === "42703" || code === "42P01" || code === "42883") {
        return true
    }

    return relatedTerms.some((term) => rawMessage.includes(term.toLowerCase()))
}

function resolveBillingOptions() {
    const planTiers: PaidBillingPlanTier[] = ["starter", "pro", "team"]
    const plans = Object.fromEntries(planTiers.map((planTier) => {
        const config = getBillingPlanPriceConfig(planTier)
        return [planTier, {
            monthlyPriceId: config.monthly,
            annualPriceId: config.annual,
            annualEnabled: Boolean(config.annual),
        }]
    }))

    return {
        annualDiscountPct: 20,
        plans,
    }
}

function normalizeExperimentName(value: unknown): string {
    if (typeof value !== "string") return DEFAULT_EXPERIMENT_NAME
    const trimmed = value.trim()
    if (!trimmed) return DEFAULT_EXPERIMENT_NAME
    return trimmed.slice(0, 80)
}

function safeObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

function safeArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
}

function resolveVariantConfig(config: Record<string, unknown>, variantName: string): PricingVariantConfig {
    const variants = safeArray(config.variants)
    const match = variants.find((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false
        const obj = entry as Record<string, unknown>
        return obj.name === variantName || obj.variant === variantName
    })

    if (match && typeof match === "object" && !Array.isArray(match)) {
        const obj = match as Record<string, unknown>
        return {
            ...obj,
            name: typeof obj.name === "string" ? obj.name : variantName,
        } as PricingVariantConfig
    }

    return { name: variantName }
}

function pricingOfferUnavailableResponse() {
    return NextResponse.json({
        ok: true,
        experiment: null,
        variant: null,
        billing: resolveBillingOptions(),
    })
}

function normalizeAssignmentRow(value: unknown): { experimentId: string; variant: string } | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const record = value as PricingAssignmentRow
    const experimentId =
        typeof record.experiment_id === "string"
            ? record.experiment_id.trim()
            : typeof record.out_experiment_id === "string"
              ? record.out_experiment_id.trim()
              : ""
    const variant =
        typeof record.variant === "string"
            ? record.variant.trim()
            : typeof record.out_variant === "string"
              ? record.out_variant.trim()
              : ""

    if (!experimentId || !variant) return null
    return { experimentId, variant }
}

export async function GET(req: Request) {
    const token = parseBearerToken(req)
    if (!token) {
        return NextResponse.json(
            { error: { message: "Unauthorized", code: 401 } },
            { status: 401 }
        )
    }

    const supabase = createAuthedSupabaseClient(token)
    if (!supabase) {
        return NextResponse.json(
            { error: { message: "Supabase is not configured", code: 500 } },
            { status: 500 }
        )
    }

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
        return NextResponse.json(
            { error: { message: "Unauthorized", code: 401 } },
            { status: 401 }
        )
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `pricing-offer:${user.id}:${ip}`,
        limit: 120,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    const serviceSupabase = createServiceSupabaseClient()
    if (serviceSupabase) {
        await ensureProfileExists(serviceSupabase, user.id)
    }

    const experimentName = normalizeExperimentName(new URL(req.url).searchParams.get("experiment"))

    const { data: assignmentRows, error: assignmentError } = await supabase.rpc(
        "get_or_create_pricing_assignment",
        { experiment_name: experimentName }
    )

    if (assignmentError) {
        if (isSchemaMismatchError(assignmentError, [
            "get_or_create_pricing_assignment",
            "pricing_experiments",
        ])) {
            console.warn("pricing/offer: pricing schema missing, returning null offer.")
            return pricingOfferUnavailableResponse()
        }

        console.error("Failed to resolve pricing assignment:", assignmentError)
        return NextResponse.json(
            { error: { message: "Failed to resolve pricing offer", code: 500 } },
            { status: 500 }
        )
    }

    const assignment = normalizeAssignmentRow(Array.isArray(assignmentRows) ? assignmentRows[0] : null)
    if (!assignment) {
        return pricingOfferUnavailableResponse()
    }

    const { data: experiment, error: experimentError } = await supabase
        .from("pricing_experiments")
        .select("id, name, config")
        .eq("id", assignment.experimentId)
        .maybeSingle()

    if (experimentError || !experiment) {
        if (isSchemaMismatchError(experimentError, ["pricing_experiments"])) {
            console.warn("pricing/offer: pricing experiment table missing, returning null offer.")
            return pricingOfferUnavailableResponse()
        }

        console.error("Failed to load pricing experiment:", experimentError)
        return NextResponse.json(
            { error: { message: "Failed to load pricing offer", code: 500 } },
            { status: 500 }
        )
    }

    const config = safeObject(experiment.config)
    const currency = typeof config.currency === "string" ? config.currency : "USD"
    const variant = resolveVariantConfig(config, String(assignment.variant))

    return NextResponse.json({
        ok: true,
        experiment: {
            id: experiment.id,
            name: experiment.name,
            currency,
        },
        variant,
        billing: resolveBillingOptions(),
    })
}

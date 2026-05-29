import type { BusinessInfo } from "@/lib/estimates-storage"

export type ProfileValidationResult =
    | { ok: true; profile: BusinessInfo }
    | { ok: false; error: string }

function trimOptional(value: string | undefined): string {
    return value?.trim() || ""
}

export function validateAndNormalizeBusinessProfile(profile: BusinessInfo): ProfileValidationResult {
    const businessName = profile.business_name.trim()

    if (!businessName) {
        return { ok: false, error: "Business name is required." }
    }

    const taxRate = Number(profile.tax_rate ?? 0)

    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
        return { ok: false, error: "Tax rate must be between 0 and 100." }
    }

    return {
        ok: true,
        profile: {
            ...profile,
            business_name: businessName,
            phone: trimOptional(profile.phone),
            email: trimOptional(profile.email),
            address: trimOptional(profile.address),
            license_number: trimOptional(profile.license_number),
            logo_url: trimOptional(profile.logo_url),
            state_province: trimOptional(profile.state_province) || "ON",
            tradeType: trimOptional(profile.tradeType),
            estimate_template_url: trimOptional(profile.estimate_template_url),
            payment_link: trimOptional(profile.payment_link),
            tax_rate: taxRate,
        },
    }
}

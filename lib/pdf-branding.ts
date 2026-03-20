export type PdfBrandingPlanTier = "free" | "starter" | "pro" | "team"

const PDF_BRANDING_PLAN_TIERS = new Set<PdfBrandingPlanTier>(["starter", "pro", "team"])
const PDF_TEMPLATE_PLAN_TIERS = new Set<PdfBrandingPlanTier>(["pro", "team"])

export function normalizePdfBrandingPlanTier(value: unknown): PdfBrandingPlanTier {
    if (value === "starter" || value === "pro" || value === "team") return value
    return "free"
}

export function hasPdfBrandingAccess(value: unknown): boolean {
    return PDF_BRANDING_PLAN_TIERS.has(normalizePdfBrandingPlanTier(value))
}

export function hasPdfTemplateAccess(value: unknown): boolean {
    return PDF_TEMPLATE_PLAN_TIERS.has(normalizePdfBrandingPlanTier(value))
}

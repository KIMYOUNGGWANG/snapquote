import { z } from "zod"

// Customer photo-diagnosis requests: shared by the public /r/[slug] page, its API routes, and the contractor's app.

export const PUBLIC_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
export const MAX_REQUEST_PHOTOS = 3
// Must match lib/image-compress.ts (400,000 chars per photo); the request-photos bucket caps a file at 409,600 bytes.
export const MAX_REQUEST_PHOTO_CHARS = 400_000
export const REQUEST_PHOTO_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/
export const DIAGNOSIS_DISCLAIMER = "Photo-based estimate. The final price is confirmed after an on-site check."

export const REQUEST_SPACES = ["kitchen", "bathroom", "laundry", "basement", "exterior", "electrical panel", "heating / cooling", "other"] as const
export const REQUEST_CURRENCIES = ["USD", "CAD"] as const

export const publicSlugSchema = z.string().trim().toLowerCase().regex(PUBLIC_SLUG_PATTERN)

/** Profile form input → slug to save. An empty field clears the link (NULL, never "", which the DB check rejects). */
export function normalizePublicSlugInput(value: string): { ok: true; slug: string | null } | { ok: false; error: string } {
    const slug = value.trim().toLowerCase()
    if (!slug) return { ok: true, slug: null }
    if (!PUBLIC_SLUG_PATTERN.test(slug)) {
        return { ok: false, error: "Use 3-40 lowercase letters, numbers or hyphens, not starting or ending with a hyphen." }
    }
    return { ok: true, slug }
}

const photosSchema = z
    .array(z.string().max(MAX_REQUEST_PHOTO_CHARS).regex(REQUEST_PHOTO_DATA_URL))
    .min(1)
    .max(MAX_REQUEST_PHOTOS)

export const diagnosisSchema = z.object({
    cause: z.string().trim().min(1).max(600),
    urgency: z.enum(["low", "medium", "high"]),
    priceRange: z
        .object({
            min: z.number().finite().min(0).max(1_000_000),
            max: z.number().finite().min(0).max(1_000_000),
            currency: z.enum(REQUEST_CURRENCIES),
        })
        .refine((range) => range.min <= range.max)
        .optional(),
    beforeVisit: z.array(z.string().trim().min(1).max(200)).max(5),
    confidence: z.enum(["low", "medium", "high"]),
})

export type Diagnosis = z.infer<typeof diagnosisSchema>

export const diagnoseRequestSchema = z.object({
    slug: publicSlugSchema,
    space: z.enum(REQUEST_SPACES),
    note: z.string().trim().max(500).optional(),
    photos: photosSchema,
})

export const customerRequestSchema = z
    .object({
        slug: publicSlugSchema,
        space: z.enum(REQUEST_SPACES),
        note: z.string().trim().max(500).optional(),
        diagnosis: diagnosisSchema,
        // From /api/public/diagnose; ties the diagnosis to these photos so it cannot be made up.
        diagnosisToken: z.string().max(200),
        photos: photosSchema,
        name: z.string().trim().min(1).max(120),
        email: z.union([z.literal(""), z.string().trim().max(254).pipe(z.email())]).optional(),
        phone: z.string().trim().max(40).optional(),
        areaLabel: z.string().trim().max(120).optional(),
    })
    .refine((value) => Boolean(value.email || value.phone), { message: "Add an email or a phone number" })

/** Contractor-side view of a stored request. Storage paths never leave the server. */
export type CustomerRequestSummary = {
    id: string
    status: "new" | "drafted" | "dismissed"
    customerName: string
    customerEmail?: string
    customerPhone?: string
    areaLabel?: string
    diagnosis: Diagnosis & { space?: string; note?: string }
    photoCount: number
    estimateId?: string
    createdAt: string
}

export type CustomerRequestDetail = CustomerRequestSummary & { photos: string[] }

export function formatRequestPrice(range: NonNullable<Diagnosis["priceRange"]>): string {
    const format = (value: number) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency: range.currency, maximumFractionDigits: 0 }).format(value)
    return `${format(range.min)} – ${format(range.max)}`
}

/** Field notes the contractor's estimate composer starts from. */
export function buildRequestEstimateNotes(request: CustomerRequestSummary): string {
    const { diagnosis } = request
    return [
        `Customer request from ${request.customerName}${request.areaLabel ? ` (${request.areaLabel})` : ""}.`,
        diagnosis.space ? `Area: ${diagnosis.space}.` : "",
        diagnosis.note ? `Customer note: ${diagnosis.note}` : "",
        `AI photo diagnosis (${diagnosis.confidence} confidence, ${diagnosis.urgency} urgency): ${diagnosis.cause}`,
        diagnosis.priceRange ? `AI price range shown to customer: ${formatRequestPrice(diagnosis.priceRange)}.` : "",
        diagnosis.beforeVisit.length ? `Customer was told before the visit: ${diagnosis.beforeVisit.join("; ")}.` : "",
    ]
        .filter(Boolean)
        .join("\n")
}

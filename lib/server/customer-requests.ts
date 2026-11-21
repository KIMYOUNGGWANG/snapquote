import type { SupabaseClient } from "@supabase/supabase-js"
import {
    REQUEST_PHOTO_DATA_URL,
    diagnosisSchema,
    type CustomerRequestSummary,
} from "@/lib/customer-requests"

// Server side of customer photo-diagnosis requests. Rows in customer_requests and files in the private
// request-photos bucket are written only here, with the service role
// (see supabase/migrations/20261121000000_add_customer_requests.sql).

export const REQUEST_PHOTO_BUCKET = "request-photos"

export type PublicContractor = {
    userId: string
    businessName: string
    logoUrl?: string
    email?: string
    address?: string
    hidePriceRange: boolean
}

/** Looks up the contractor behind /r/{slug}. Returns null for unknown slugs or lookup errors. */
export async function loadPublicContractor(supabase: SupabaseClient, slug: string): Promise<PublicContractor | null> {
    const { data, error } = await supabase
        .from("profiles")
        .select("id, business_name, logo_url, email, address, request_hide_price_range")
        .eq("public_slug", slug)
        .maybeSingle()

    if (error) {
        console.error("Failed to load contractor by public slug:", error)
        return null
    }
    const row = data as Record<string, unknown> | null
    if (!row || typeof row.id !== "string") return null

    const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined)
    return {
        userId: row.id,
        businessName: text(row.business_name) || "Your contractor",
        logoUrl: text(row.logo_url),
        email: text(row.email),
        address: text(row.address),
        hidePriceRange: row.request_hide_price_range === true,
    }
}

export function photoDataUrlToUpload(dataUrl: string): { contentType: string; extension: string; bytes: Buffer } {
    const match = REQUEST_PHOTO_DATA_URL.exec(dataUrl)
    const type = match?.[1] || "jpeg"
    return {
        contentType: `image/${type}`,
        extension: type === "jpeg" ? "jpg" : type,
        bytes: Buffer.from(match?.[2] || "", "base64"),
    }
}

export const CUSTOMER_REQUEST_COLUMNS =
    "id, status, customer_name, customer_email, customer_phone, area_label, diagnosis, photo_paths, estimate_id, created_at"

/** Maps a DB row to the contractor-facing shape. Returns null for rows that fail validation. */
export function toCustomerRequestSummary(row: Record<string, unknown>): CustomerRequestSummary | null {
    const rawDiagnosis = (row.diagnosis && typeof row.diagnosis === "object" ? row.diagnosis : {}) as Record<string, unknown>
    const diagnosis = diagnosisSchema.safeParse(rawDiagnosis)
    if (!diagnosis.success || typeof row.id !== "string") return null

    const text = (value: unknown) => (typeof value === "string" && value ? value : undefined)
    const status = row.status === "drafted" || row.status === "dismissed" ? row.status : "new"
    return {
        id: row.id,
        status,
        customerName: text(row.customer_name) || "Customer",
        customerEmail: text(row.customer_email),
        customerPhone: text(row.customer_phone),
        areaLabel: text(row.area_label),
        diagnosis: { ...diagnosis.data, space: text(rawDiagnosis.space), note: text(rawDiagnosis.note) },
        photoCount: Array.isArray(row.photo_paths) ? row.photo_paths.length : 0,
        estimateId: text(row.estimate_id),
        createdAt: text(row.created_at) || "",
    }
}

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

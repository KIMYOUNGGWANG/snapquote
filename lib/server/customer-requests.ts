import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
    REQUEST_PHOTO_DATA_URL,
    diagnosisSchema,
    type CustomerRequestSummary,
    type Diagnosis,
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

// The customer's browser carries the diagnosis from /diagnose to /requests, and the contractor sees it labelled
// as the AI read. The token proves the server produced this exact read for these exact photos and link.
const DIAGNOSIS_TOKEN_TTL_MS = 2 * 60 * 60 * 1000

type SignedDiagnosisInput = { slug: string; diagnosis: Diagnosis; photos: string[] }

function diagnosisSigningKey(): Buffer | null {
    // Derived from the service role key (always set when these routes can run), so no extra secret to manage
    // and the raw key never signs anything itself.
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
    return secret ? createHmac("sha256", secret).update("customer-request-diagnosis-v1").digest() : null
}

function diagnosisSignature(key: Buffer, input: SignedDiagnosisInput, expiresAt: number): Buffer {
    const { diagnosis } = input
    const range = diagnosis.priceRange
    const payload = JSON.stringify([
        input.slug,
        diagnosis.cause,
        diagnosis.urgency,
        range ? [range.min, range.max, range.currency] : null,
        diagnosis.beforeVisit,
        diagnosis.confidence,
        createHash("sha256").update(input.photos.join("\n")).digest("base64url"),
        expiresAt,
    ])
    return createHmac("sha256", key).update(payload).digest()
}

/** Token for a diagnosis exactly as returned to the customer. Null when the server is not configured. */
export function signDiagnosis(input: SignedDiagnosisInput, now = Date.now()): string | null {
    const key = diagnosisSigningKey()
    if (!key) return null
    const expiresAt = now + DIAGNOSIS_TOKEN_TTL_MS
    return `${expiresAt}.${diagnosisSignature(key, input, expiresAt).toString("base64url")}`
}

export function verifyDiagnosisToken(token: string, input: SignedDiagnosisInput, now = Date.now()): boolean {
    const key = diagnosisSigningKey()
    const [expiresText, signatureText] = token.split(".")
    const expiresAt = Number(expiresText)
    if (!key || !signatureText || !Number.isSafeInteger(expiresAt) || expiresAt < now) return false
    const expected = diagnosisSignature(key, input, expiresAt)
    const given = Buffer.from(signatureText, "base64url")
    return given.length === expected.length && timingSafeEqual(given, expected)
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

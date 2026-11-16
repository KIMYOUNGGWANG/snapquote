import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"

// 3D walkthrough preview add-on (WalkPlan). Rows live in estimate_walkthroughs and are written only by
// server routes with the service role; see supabase/migrations/20261116000000_add_estimate_walkthroughs.sql.

export type WalkthroughStatus = "none" | "requested" | "ready"

const MAX_PHOTOS = 4
// Vercel caps a request body at 4.5MB; enforce the same total on the server so self-hosted runs are bounded too.
export const MAX_WALKTHROUGH_PHOTO_CHARS = 4_000_000
const PHOTO_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/

export const walkthroughRequestSchema = z.object({
    estimateNumber: z.string().trim().max(80).optional(),
    scope: z.string().trim().min(1).max(8000),
    photos: z
        .array(z.string().regex(PHOTO_DATA_URL))
        .max(MAX_PHOTOS)
        .default([])
        .refine((photos) => photos.reduce((sum, photo) => sum + photo.length, 0) <= MAX_WALKTHROUGH_PHOTO_CHARS, "photos too large"),
})

export const walkthroughAttachSchema = z.object({
    userId: z.string().uuid(),
    estimateId: z.string().trim().min(1).max(120),
    url: z
        .string()
        .trim()
        .max(2000)
        .refine((value) => {
            try {
                return new URL(value).protocol === "https:"
            } catch {
                return false
            }
        }, "url must be https")
        // Normalize (e.g. "HTTPS://" → "https://") so the DB check `url ~ '^https://'` always agrees.
        .transform((value) => new URL(value).toString()),
})

export type WalkthroughRow = { status: WalkthroughStatus; url?: string; requestedAt?: string }

/** Never throws: the public portal must render even if this table is unreadable. */
export async function loadWalkthrough(
    supabase: SupabaseClient,
    userId: string,
    estimateId: string
): Promise<WalkthroughRow> {
    try {
        const { data, error } = await supabase
            .from("estimate_walkthroughs")
            .select("status, url, requested_at")
            .eq("user_id", userId)
            .eq("estimate_id", estimateId)
            .maybeSingle()

        if (error) {
            console.warn("Failed to load estimate walkthrough:", error)
            return { status: "none" }
        }
        const row = data as { status?: unknown; url?: unknown; requested_at?: unknown } | null
        if (!row) return { status: "none" }
        if (row.status === "ready" && typeof row.url === "string" && row.url.startsWith("https://")) {
            return { status: "ready", url: row.url }
        }
        return { status: "requested", requestedAt: typeof row.requested_at === "string" ? row.requested_at : undefined }
    } catch (error) {
        console.warn("Failed to load estimate walkthrough:", error)
        return { status: "none" }
    }
}

/** data:image/jpeg;base64,... → Resend attachment (input already validated by walkthroughRequestSchema) */
export function photoDataUrlToAttachment(dataUrl: string, index: number): { filename: string; content: Buffer } {
    const match = PHOTO_DATA_URL.exec(dataUrl)
    const ext = match?.[1] === "jpeg" ? "jpg" : match?.[1] || "jpg"
    return { filename: `before-${index + 1}.${ext}`, content: Buffer.from(match?.[2] || "", "base64") }
}

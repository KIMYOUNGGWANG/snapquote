import { withAuthHeaders } from "@/lib/auth-headers"
import type { LocalEstimate } from "@/lib/estimates-storage"
import { getAllItemsFromEstimate } from "@/lib/estimates/math"

// Must match MAX_WALKTHROUGH_PHOTO_CHARS on the server (Vercel caps a request body at 4.5MB).
const MAX_PHOTO_PAYLOAD_CHARS = 4_000_000
const MAX_PHOTOS = 4

export function hasWalkthroughPhotos(estimate: LocalEstimate): boolean {
    return (estimate.attachments?.photos?.length ?? 0) > 0
}

/** Plain-text scope for the operator: what changes in the room, line by line. */
export function buildWalkthroughScope(estimate: LocalEstimate): string {
    const lines = getAllItemsFromEstimate(estimate)
        .map((item) => `- ${item.description}${item.quantity ? ` (${item.quantity}${item.unit ? ` ${item.unit}` : ""})` : ""}`)
    return [estimate.summary_note?.trim(), ...lines].filter(Boolean).join("\n").slice(0, 8000)
}

export function pickWalkthroughPhotos(photos: string[]): string[] {
    const picked: string[] = []
    let total = 0
    for (const photo of photos) {
        if (picked.length >= MAX_PHOTOS) break
        if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo)) continue
        if (total + photo.length > MAX_PHOTO_PAYLOAD_CHARS) continue
        picked.push(photo)
        total += photo.length
    }
    return picked
}

export async function requestWalkthroughPreview(estimate: LocalEstimate): Promise<{ status: "requested" | "ready"; url?: string }> {
    const response = await fetch(`/api/estimates/${encodeURIComponent(estimate.id)}/walkthrough`, {
        method: "POST",
        headers: await withAuthHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
            estimateNumber: estimate.estimateNumber,
            scope: buildWalkthroughScope(estimate),
            photos: pickWalkthroughPhotos(estimate.attachments?.photos ?? []),
        }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
        throw new Error(typeof data?.error?.message === "string" ? data.error.message : "Failed to request the 3D preview.")
    }
    return { status: data.status === "ready" ? "ready" : "requested", url: typeof data.url === "string" ? data.url : undefined }
}

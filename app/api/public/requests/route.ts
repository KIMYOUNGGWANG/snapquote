import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { Resend } from "resend"
import { customerRequestSchema } from "@/lib/customer-requests"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import {
    REQUEST_PHOTO_BUCKET,
    escapeHtml,
    loadPublicContractor,
    photoDataUrlToUpload,
    verifyDiagnosisToken,
} from "@/lib/server/customer-requests"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"

const HOUR_MS = 60 * 60 * 1000
const MAX_BODY_BYTES = 1_300_000
// One heads-up email per contractor per window; later requests in the window just show up in History.
const NOTIFY_WINDOW_MS = 15 * 60 * 1000

function getAppUrl(): string {
    // snapquote.app is another company's site; ours is snapquotes.app.
    return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://snapquotes.app").replace(/\/$/, "")
}

/** Public: a homeowner sends a quote request with photos and the AI diagnosis to the contractor behind /r/{slug}. */
export async function POST(request: Request) {
    const ipLimit = await checkRateLimit({ key: `public-requests:ip:${getClientIp(request)}`, limit: 5, windowMs: HOUR_MS })
    if (!ipLimit.allowed) {
        return NextResponse.json({ error: "Too many requests. Try again in an hour." }, { status: 429 })
    }

    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
        return NextResponse.json({ error: "Photos are too large" }, { status: 413 })
    }

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const parsed = customerRequestSchema.safeParse(body)
    if (!parsed.success) {
        const message = parsed.error.issues.some((issue) => issue.message === "Add an email or a phone number")
            ? "Add an email or a phone number so the contractor can reach you."
            : "Check your name, contact details and photos."
        return NextResponse.json({ error: message }, { status: 400 })
    }
    const input = parsed.data
    if (!verifyDiagnosisToken(input.diagnosisToken, input)) {
        return NextResponse.json({ error: "This photo check has expired. Reload the page and check your photos again." }, { status: 400 })
    }

    // Per link too, so nobody can flood one contractor's inbox from many IPs.
    const slugLimit = await checkRateLimit({ key: `public-requests:slug:${input.slug}`, limit: 20, windowMs: HOUR_MS })
    if (!slugLimit.allowed) {
        return NextResponse.json({ error: "This link is busy right now. Try again later." }, { status: 429 })
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 500 })
    const contractor = await loadPublicContractor(supabase, input.slug)
    if (!contractor) return NextResponse.json({ error: "This request link does not exist." }, { status: 404 })

    const requestId = randomUUID()
    const uploadedPaths: string[] = []
    const removeUploaded = async () => {
        if (uploadedPaths.length === 0) return
        const { error } = await supabase.storage.from(REQUEST_PHOTO_BUCKET).remove(uploadedPaths)
        if (error) console.error("Failed to remove orphaned request photos:", error)
    }

    for (const [index, photo] of input.photos.entries()) {
        const upload = photoDataUrlToUpload(photo)
        const path = `${contractor.userId}/${requestId}/${index + 1}.${upload.extension}`
        const { error } = await supabase.storage
            .from(REQUEST_PHOTO_BUCKET)
            .upload(path, upload.bytes, { contentType: upload.contentType, upsert: false })
        if (error) {
            console.error("Failed to upload request photo:", error)
            await removeUploaded()
            return NextResponse.json({ error: "Could not save your photos. Please try again." }, { status: 500 })
        }
        uploadedPaths.push(path)
    }

    const { priceRange, ...diagnosisWithoutPrice } = input.diagnosis
    const { error: insertError } = await supabase.from("customer_requests").insert({
        id: requestId,
        user_id: contractor.userId,
        customer_name: input.name,
        customer_email: input.email || null,
        customer_phone: input.phone || null,
        area_label: input.areaLabel || null,
        diagnosis: {
            ...diagnosisWithoutPrice,
            // The customer never saw a hidden range, so the contractor's copy should not carry one either.
            ...(contractor.hidePriceRange || !priceRange ? {} : { priceRange }),
            space: input.space,
            ...(input.note ? { note: input.note } : {}),
        },
        photo_paths: uploadedPaths,
    })
    if (insertError) {
        console.error("Failed to save customer request:", insertError)
        await removeUploaded()
        return NextResponse.json({ error: "Could not send your request. Please try again." }, { status: 500 })
    }

    const notify = await checkRateLimit({ key: `customer-request-notify:${contractor.userId}`, limit: 1, windowMs: NOTIFY_WINDOW_MS })
    if (notify.allowed && contractor.email && process.env.RESEND_API_KEY) {
        try {
            // Customer contact details stay out of the email; the contractor opens them in the app.
            const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
                from: "SnapQuote <onboarding@resend.dev>",
                to: [contractor.email],
                subject: "New customer request on SnapQuote",
                html: `
                    <p><strong>You have a new customer request.</strong></p>
                    <p>Area: ${escapeHtml(input.space)}<br/>AI read: ${escapeHtml(input.diagnosis.cause)}</p>
                    <p><a href="${getAppUrl()}/history#customer-requests">Open requests in SnapQuote</a></p>
                `,
            })
            if (error) console.error("Failed to send customer request email:", error)
        } catch (error) {
            console.error("Failed to send customer request email:", error)
        }
    }

    return NextResponse.json({ ok: true, businessName: contractor.businessName })
}

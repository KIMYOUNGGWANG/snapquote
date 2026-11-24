import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import {
    CUSTOMER_REQUEST_COLUMNS,
    REQUEST_PHOTO_BUCKET,
    toCustomerRequestSummary,
} from "@/lib/server/customer-requests"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"

type RouteContext = { params: Promise<{ requestId: string }> }

const updateSchema = z.discriminatedUnion("status", [
    z.object({ status: z.literal("drafted"), estimateId: z.string().trim().min(1).max(120) }),
    z.object({ status: z.literal("dismissed") }),
])

function errorResponse(message: string, status: number) {
    return NextResponse.json({ error: { message, code: status } }, { status })
}

async function readRequestId(context: RouteContext): Promise<string | null> {
    const requestId = (await context.params).requestId?.trim()
    return requestId && requestId.length <= 64 ? requestId : null
}

/** One request with its photos as data URLs, ready to drop into a local draft estimate. */
export async function GET(request: Request, context: RouteContext) {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const requestId = await readRequestId(context)
    if (!requestId) return errorResponse("Invalid request id", 400)

    const supabase = createServiceSupabaseClient()
    if (!supabase) return errorResponse("Not configured", 500)

    const { data, error } = await supabase
        .from("customer_requests")
        .select(CUSTOMER_REQUEST_COLUMNS)
        .eq("id", requestId)
        .eq("user_id", auth.userId)
        .maybeSingle()

    if (error) {
        console.error("Failed to load customer request:", error)
        return errorResponse("Failed to load the request", 500)
    }
    const row = data as Record<string, unknown> | null
    const summary = row ? toCustomerRequestSummary(row) : null
    if (!row || !summary) return errorResponse("Request not found", 404)

    // Only files under the owner's folder, even if a bad path ever made it into the row.
    const ownerPrefix = `${auth.userId}/`
    const paths = (Array.isArray(row.photo_paths) ? row.photo_paths : [])
        .filter((path): path is string => typeof path === "string" && path.startsWith(ownerPrefix))

    const photos: string[] = []
    for (const path of paths) {
        const { data: file, error: downloadError } = await supabase.storage.from(REQUEST_PHOTO_BUCKET).download(path)
        if (downloadError || !file) {
            console.warn("Failed to download request photo:", downloadError)
            continue
        }
        const type = file.type?.startsWith("image/") ? file.type : "image/jpeg"
        photos.push(`data:${type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`)
    }

    return NextResponse.json({ request: { ...summary, photos } })
}

/** Mark a request as turned into a draft estimate, or dismiss it. */
export async function PATCH(request: Request, context: RouteContext) {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const requestId = await readRequestId(context)
    if (!requestId) return errorResponse("Invalid request id", 400)

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return errorResponse("Invalid request payload", 400)
    }
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return errorResponse("Invalid status update", 400)

    const supabase = createServiceSupabaseClient()
    if (!supabase) return errorResponse("Not configured", 500)

    const { data, error } = await supabase
        .from("customer_requests")
        .update({
            status: parsed.data.status,
            ...(parsed.data.status === "drafted" ? { estimate_id: parsed.data.estimateId } : {}),
            updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("user_id", auth.userId)
        .select("id")

    if (error) {
        console.error("Failed to update customer request:", error)
        return errorResponse("Failed to update the request", 500)
    }
    if (!Array.isArray(data) || data.length === 0) return errorResponse("Request not found", 404)

    return NextResponse.json({ ok: true })
}

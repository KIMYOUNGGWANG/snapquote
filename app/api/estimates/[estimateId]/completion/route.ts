import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import { createEstimatePaymentLink, deactivatePaymentLink } from "@/lib/server/stripe-payment-link"
import { computeBalanceDue, toCents } from "@/lib/estimates/balance"
import { completionFinalizeRequestSchema } from "@/lib/validation/api-schemas"

type FinalizeEstimateRow = {
    id: string
    user_id: string
    estimate_number: string | null
    status: string | null
    total_amount: number | null
    payment_link_id: string | null
    payment_link_type: string | null
    clients: { name: string | null } | null
}

function errorResponse(message: string, status: number) {
    return NextResponse.json({ error: { message, code: status } }, { status })
}

function toMoney(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export async function POST(req: Request, context: { params: Promise<{ estimateId: string }> }) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) return auth.response

    const { estimateId: rawEstimateId } = await context.params
    const estimateId = rawEstimateId.trim()
    if (!estimateId || estimateId.length > 120) {
        return errorResponse("Invalid estimate id", 400)
    }

    const rateLimit = await checkRateLimit({
        key: `completion-finalize:${auth.userId}:${estimateId}:${getClientIp(req)}`,
        limit: 20,
        windowMs: 10 * 60 * 1000,
    })
    if (!rateLimit.allowed) {
        return errorResponse("Too many requests", 429)
    }

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return errorResponse("Invalid request payload", 400)
    }
    const parsed = completionFinalizeRequestSchema.safeParse(body)
    if (!parsed.success) {
        return errorResponse("Invalid amount received", 400)
    }
    const alreadyReceived = toCents(parsed.data.alreadyReceived) / 100

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return errorResponse("Supabase service configuration is missing", 500)
    }

    const { data, error: loadError } = await supabase
        .from("estimates")
        .select("id, user_id, estimate_number, status, total_amount, payment_link_id, payment_link_type, clients(name)")
        .eq("id", estimateId)
        .eq("user_id", auth.userId)
        .maybeSingle()
    if (loadError) return errorResponse("Failed to load estimate.", 500)

    const estimate = data as FinalizeEstimateRow | null
    if (!estimate || estimate.user_id !== auth.userId) {
        return errorResponse("Estimate not found.", 404)
    }

    const reopeningDeposit = estimate.status === "paid" && estimate.payment_link_type === "deposit"
    if (estimate.status !== "sent" && !reopeningDeposit) {
        return errorResponse("This estimate can't be completed in its current state.", 409)
    }

    const totalAmount = toMoney(estimate.total_amount)
    const balanceDue = computeBalanceDue(totalAmount, alreadyReceived)
    const previousLinkId = estimate.payment_link_id?.trim() || ""

    // Create the new link first so a failure leaves the old link working.
    let newLink: { url: string; id: string } | null = null
    if (balanceDue > 0) {
        const created = await createEstimatePaymentLink({
            userId: auth.userId,
            estimateId: estimate.id,
            estimateNumber: estimate.estimate_number?.trim() || "",
            customerName: estimate.clients?.name?.trim().slice(0, 120) || "",
            amount: balanceDue,
        })
        if (!created.ok) {
            return NextResponse.json(
                { error: { message: created.error, code: created.status, ...(created.code ? { reason: created.code } : {}) } },
                { status: created.status }
            )
        }
        newLink = created
    }

    // Same idempotent link returned again: it is still the live one.
    if (previousLinkId && previousLinkId !== newLink?.id) {
        await deactivatePaymentLink({ userId: auth.userId, paymentLinkId: previousLinkId })
    }

    const { error: updateError } = await supabase
        .from("estimates")
        .update({
            amount_paid: alreadyReceived,
            payment_link: newLink?.url ?? null,
            payment_link_id: newLink?.id ?? null,
            payment_link_type: newLink ? "custom" : null,
            updated_at: new Date().toISOString(),
            ...(reopeningDeposit ? { status: "sent", payment_completed_at: null } : {}),
        })
        .eq("id", estimate.id)
        .eq("user_id", auth.userId)
    if (updateError) return errorResponse("Failed to save completion.", 500)

    return NextResponse.json({
        ok: true,
        totalAmount,
        amountPaid: alreadyReceived,
        balanceDue,
        ...(newLink ? { paymentLink: newLink.url, paymentLinkId: newLink.id } : {}),
    })
}

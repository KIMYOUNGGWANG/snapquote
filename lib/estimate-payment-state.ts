export type EstimatePaymentStateLike = {
    status?: unknown
    paymentCompletedAt?: unknown
    payment_completed_at?: unknown
}

function hasValidPaymentTimestamp(value: unknown): boolean {
    if (typeof value !== "string") return false
    const trimmed = value.trim()
    if (!trimmed) return false

    return !Number.isNaN(new Date(trimmed).getTime())
}

export function isEstimatePaidLike(estimate: EstimatePaymentStateLike): boolean {
    return estimate.status === "paid"
        || hasValidPaymentTimestamp(estimate.paymentCompletedAt)
        || hasValidPaymentTimestamp(estimate.payment_completed_at)
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { isFullyPaid, toCents } from '@/lib/estimates/balance'

export type SettlementEstimate = {
    id: string
    total_amount: number | null
    amount_paid: number | null
    last_payment_session_id: string | null
    status: string | null
    payment_completed_at: string | null
}

export type CheckoutSettlementInput = {
    estimate: SettlementEstimate
    sessionId: string
    amountTotalCents: number | null
    paymentStatus: string | null
    paidAt: string
}

export type CheckoutSettlementResult =
    | { ok: true; applied: boolean; fullyPaid: boolean }
    | { ok: false; message: string }

function toAmount(value: number | null): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Adds one paid Checkout Session to estimates.amount_paid.
 * Only a fully paid estimate becomes `paid` (partial payments leave status untouched).
 */
export async function applyCheckoutSettlement(
    supabase: SupabaseClient,
    input: CheckoutSettlementInput
): Promise<CheckoutSettlementResult> {
    const { estimate, sessionId, amountTotalCents, paymentStatus, paidAt } = input

    if (paymentStatus !== 'paid') return { ok: true, applied: false, fullyPaid: false }

    // ponytail: 마지막 세션 id 하나로만 중복을 막는다. 완납 전에 부분 결제 2건 이상이 섞여 재처리되면 중복 가능 → 필요해지면 결제 원장 테이블로 옮긴다.
    if (estimate.last_payment_session_id === sessionId) {
        return { ok: true, applied: false, fullyPaid: false }
    }

    // 이미 완납이면 과거 세션(reconcile 재스캔, 웹훅 재시도)이 다시 들어와도 금액을 더하지 않는다.
    const total = toAmount(estimate.total_amount)
    const alreadyPaid = toAmount(estimate.amount_paid)
    if (
        isFullyPaid(total, alreadyPaid)
        || (estimate.status === 'paid' && toCents(alreadyPaid) >= toCents(total))
    ) {
        return { ok: true, applied: false, fullyPaid: true }
    }

    if (typeof amountTotalCents !== 'number' || !Number.isFinite(amountTotalCents)) {
        return { ok: false, message: 'Paid checkout session is missing amount_total.' }
    }

    const newAmountPaid = (toCents(alreadyPaid) + Math.round(amountTotalCents)) / 100
    const fullyPaid = isFullyPaid(total, newAmountPaid)

    const update = supabase
        .from('estimates')
        .update({
            amount_paid: newAmountPaid,
            ...(fullyPaid
                ? { status: 'paid', payment_completed_at: estimate.payment_completed_at || paidAt }
                : {}),
            last_payment_session_id: sessionId,
            updated_at: new Date().toISOString(),
        })
        .eq('id', estimate.id)

    // 동시에 들어온 업데이트가 이미 세션 id를 바꿨다면 0행이 갱신된다.
    const guarded = estimate.last_payment_session_id === null
        ? update.is('last_payment_session_id', null)
        : update.eq('last_payment_session_id', estimate.last_payment_session_id)

    const { data, error } = await guarded.select('id').maybeSingle()
    if (error) return { ok: false, message: error.message }

    return { ok: true, applied: Boolean(data?.id), fullyPaid }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { isFullyPaid, toCents } from '@/lib/estimates/balance'

export type SettlementEstimate = {
    id: string
    user_id: string
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

    // ponytail: 세션 단위 중복 방지는 analytics_events.external_id(unique)를 결제 원장으로 쓴다. 분석 테이블에 원장이 있으니 분석 데이터 보관/정리 정책을 넣게 되면 → 전용 payments 테이블로 옮긴다.
    // last_payment_session_id는 "이미 처리됨"의 근거로 쓰지 않는다(동시성 가드 전용). 중복 판단은 원장만 한다.

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

    const ledgerKey = `payment_settlement:${sessionId}`
    const { error: ledgerError } = await supabase.from('analytics_events').insert({
        user_id: estimate.user_id,
        event_name: 'payment_settled',
        estimate_id: estimate.id,
        channel: 'stripe_settlement',
        external_id: ledgerKey,
        metadata: { checkout_session_id: sessionId, amount_total_cents: Math.round(amountTotalCents) },
    })
    if (ledgerError) {
        // 이미 정산된 세션(웹훅 재시도, reconcile 재스캔)
        if (ledgerError.code === '23505') return { ok: true, applied: false, fullyPaid: false }
        return { ok: false, message: ledgerError.message }
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
    if (error || !data?.id) {
        // 정산을 못 했으니 원장을 지워 재시도(웹훅 재전송, 다음 reconcile)가 다시 반영하게 한다.
        const { error: rollbackError } = await supabase
            .from('analytics_events')
            .delete()
            .eq('external_id', ledgerKey)
        if (rollbackError) console.error('Failed to roll back settlement ledger row:', rollbackError)

        return {
            ok: false,
            message: error?.message ?? 'Estimate was changed concurrently; payment not recorded.',
        }
    }

    return { ok: true, applied: true, fullyPaid }
}

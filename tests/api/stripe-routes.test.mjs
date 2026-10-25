import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { getTestState, resetTestState } from '../mocks/state.mjs'

import { POST as stripeWebhook } from '../../app/api/webhooks/stripe/route.ts'
import { GET as stripeReconcileGet } from '../../app/api/webhooks/stripe/reconcile/route.ts'
import { GET as stripePaymentStatusGet } from '../../app/api/payments/stripe/status/route.ts'

const RELEVANT_ENV_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
]

function clearRelevantEnv() {
  for (const key of RELEVANT_ENV_KEYS) {
    delete process.env[key]
  }
}

// Minimal stateful fake of the estimates row + analytics_events unique external_id.
function createSettlementDb(initial) {
  const row = { user_id: 'user_1', status: 'sent', payment_completed_at: null, ...initial }
  const ledger = new Set()
  const filterValue = (query, column, op) => query.filters.find((f) => f.column === column && f.op === op)

  const resolver = async (query) => {
    if (query.table === 'estimates' && query.action === 'select' && query.mode === 'maybeSingle') {
      return { data: { ...row }, error: null }
    }
    if (query.table === 'analytics_events' && query.action === 'insert') {
      const key = query.payload.external_id
      if (ledger.has(key)) return { data: null, error: { code: '23505', message: 'duplicate key' } }
      ledger.add(key)
      return { data: [], error: null }
    }
    if (query.table === 'analytics_events' && query.action === 'delete') {
      ledger.delete(filterValue(query, 'external_id', 'eq')?.value)
      return { data: [], error: null }
    }
    if (query.table === 'estimates' && query.action === 'update' && query.mode === 'maybeSingle') {
      const isNull = filterValue(query, 'last_payment_session_id', 'is')
      const eqPrev = filterValue(query, 'last_payment_session_id', 'eq')
      const matches = isNull ? row.last_payment_session_id === null : row.last_payment_session_id === eqPrev?.value
      if (!matches) return { data: null, error: null }
      Object.assign(row, query.payload)
      return { data: { id: row.id }, error: null }
    }
    return { data: [], error: null }
  }

  return { row, ledger, resolver }
}

beforeEach(() => {
  resetTestState()
  clearRelevantEnv()
})

describe('POST /api/webhooks/stripe', () => {
  test('returns 500 and records ops alert when Stripe config is missing', async () => {
    const state = getTestState()

    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: '{}',
    })

    const res = await stripeWebhook(req)
    const text = await res.text()

    assert.equal(res.status, 500)
    assert.match(text, /Server configuration error/)
    assert.equal(state.opsAlerts.calls.length, 1)
    assert.equal(state.opsAlerts.calls[0].alertKey, 'stripe_webhook_missing_stripe_config')
  })

  test('returns 400 when signature is missing', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'

    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: '{}',
    })

    const res = await stripeWebhook(req)
    const text = await res.text()

    assert.equal(res.status, 400)
    assert.match(text, /Missing signature or secret/)
  })

  test('marks estimate as paid and emits analytics on completed checkout session', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'

    const state = getTestState()

    state.stripe.constructEvent = () => ({
      id: 'evt_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_123',
          created: 1735689600,
          payment_status: 'paid',
          amount_total: 100000,
          metadata: {
            estimateId: 'estimate_1',
            estimateNumber: 'EST-1',
            userId: 'user_1',
          },
        },
      },
    })

    state.supabase.queryResolver = async (query) => {
      if (query.table === 'estimates' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: {
            id: 'estimate_1',
            user_id: 'user_1',
            estimate_number: 'EST-1',
            status: 'sent',
            total_amount: 1000,
            amount_paid: 0,
            last_payment_session_id: null,
          },
          error: null,
        }
      }

      if (query.table === 'estimates' && query.action === 'update' && query.mode === 'maybeSingle') {
        return {
          data: { id: 'estimate_1' },
          error: null,
        }
      }

      if (query.table === 'analytics_events' && query.action === 'upsert') {
        return {
          data: [],
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify({ fake: true }),
      headers: {
        'stripe-signature': 'sig_test',
      },
    })

    const res = await stripeWebhook(req)
    const text = await res.text()

    assert.equal(res.status, 200)
    assert.equal(text, 'Received')

    const updateCall = state.supabase.queryCalls.find(
      (query) => query.table === 'estimates' && query.action === 'update'
    )
    assert.ok(updateCall)
    assert.equal(updateCall.payload.status, 'paid')
    assert.equal(updateCall.payload.payment_completed_at, '2025-01-01T00:00:00.000Z')
    assert.equal(updateCall.payload.last_payment_session_id, 'cs_123')
    assert.match(updateCall.payload.updated_at, /Z$/)
  })

  test('falls back to payment intent metadata for async payment success events', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'

    const state = getTestState()

    state.stripe.constructEvent = () => ({
      id: 'evt_async_paid',
      type: 'checkout.session.async_payment_succeeded',
      data: {
        object: {
          id: 'cs_async_paid',
          created: 1735689900,
          payment_status: 'paid',
          amount_total: 50000,
          metadata: {},
          payment_intent: 'pi_async_paid',
        },
      },
    })
    state.stripe.paymentIntentsRetrieve = async () => ({
      metadata: {
        estimateId: 'estimate_async_paid',
        estimateNumber: 'EST-ASYNC-1',
        userId: 'user_async',
      },
    })

    state.supabase.queryResolver = async (query) => {
      if (query.table === 'estimates' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: {
            id: 'estimate_async_paid',
            user_id: 'user_async',
            estimate_number: 'EST-ASYNC-1',
            status: 'sent',
            total_amount: 500,
            amount_paid: 0,
            last_payment_session_id: null,
          },
          error: null,
        }
      }

      if (query.table === 'estimates' && query.action === 'update' && query.mode === 'maybeSingle') {
        return {
          data: { id: 'estimate_async_paid' },
          error: null,
        }
      }

      if (query.table === 'analytics_events' && query.action === 'upsert') {
        return {
          data: [],
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify({ fake: true }),
      headers: {
        'stripe-signature': 'sig_test',
      },
    })

    const res = await stripeWebhook(req)
    const text = await res.text()

    assert.equal(res.status, 200)
    assert.equal(text, 'Received')
    assert.equal(
      state.supabase.queryCalls.some(
        (query) => query.table === 'estimates' && query.action === 'update'
      ),
      true
    )
    const updateCall = state.supabase.queryCalls.find(
      (query) => query.table === 'estimates' && query.action === 'update'
    )
    assert.equal(updateCall.payload.payment_completed_at, '2025-01-01T00:05:00.000Z')
    assert.equal(updateCall.payload.last_payment_session_id, 'cs_async_paid')
  })

  test('keeps existing payment timestamp and records no transition for paid-like webhook targets', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'

    const state = getTestState()
    const paidAt = '2024-12-31T23:00:00.000Z'

    state.stripe.constructEvent = () => ({
      id: 'evt_paid_like',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_paid_like',
          created: 1735689600,
          payment_status: 'paid',
          amount_total: 20000,
          metadata: {
            estimateId: 'estimate_paid_like',
            estimateNumber: 'EST-PAID-LIKE',
            userId: 'user_1',
          },
        },
      },
    })

    state.supabase.queryResolver = async (query) => {
      if (query.table === 'estimates' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: {
            id: 'estimate_paid_like',
            user_id: 'user_1',
            estimate_number: 'EST-PAID-LIKE',
            status: 'sent',
            payment_completed_at: paidAt,
            total_amount: 200,
            amount_paid: 0,
            last_payment_session_id: null,
          },
          error: null,
        }
      }

      if (query.table === 'estimates' && query.action === 'update' && query.mode === 'maybeSingle') {
        return { data: { id: 'estimate_paid_like' }, error: null }
      }

      if (query.table === 'analytics_events' && query.action === 'upsert') {
        return { data: [], error: null }
      }

      return { data: null, error: null }
    }

    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify({ fake: true }),
      headers: {
        'stripe-signature': 'sig_test',
      },
    })

    const res = await stripeWebhook(req)
    const text = await res.text()

    assert.equal(res.status, 200)
    assert.equal(text, 'Received')

    const updateCall = state.supabase.queryCalls.find(
      (query) => query.table === 'estimates' && query.action === 'update'
    )
    assert.ok(updateCall)
    assert.equal(updateCall.payload.status, 'paid')
    assert.equal(updateCall.payload.payment_completed_at, paidAt)

    const analyticsCall = state.supabase.queryCalls.find(
      (query) => query.table === 'analytics_events' && query.action === 'upsert'
    )
    assert.ok(analyticsCall)
    assert.equal(analyticsCall.payload[0].metadata.status_transitioned, false)
  })

  describe('partial payments', () => {
    function setupWebhook({ session, estimate }) {
      process.env.STRIPE_SECRET_KEY = 'sk_test'
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'

      const state = getTestState()
      state.stripe.constructEvent = () => ({
        id: 'evt_partial',
        type: 'checkout.session.completed',
        data: {
          object: {
            created: 1735689600,
            metadata: { estimateId: 'estimate_partial', estimateNumber: 'EST-P', userId: 'user_1' },
            ...session,
          },
        },
      })
      state.supabase.queryResolver = async (query) => {
        if (query.table === 'estimates' && query.action === 'select' && query.mode === 'maybeSingle') {
          return {
            data: { id: 'estimate_partial', user_id: 'user_1', estimate_number: 'EST-P', status: 'sent', ...estimate },
            error: null,
          }
        }
        if (query.table === 'estimates' && query.action === 'update' && query.mode === 'maybeSingle') {
          return { data: { id: 'estimate_partial' }, error: null }
        }
        return { data: [], error: null }
      }
      return state
    }

    const send = () => stripeWebhook(new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify({ fake: true }),
      headers: { 'stripe-signature': 'sig_test' },
    }))
    const findUpdate = (state) => state.supabase.queryCalls.find(
      (query) => query.table === 'estimates' && query.action === 'update'
    )

    test('deposit payment below total keeps estimate sent and records amount_paid', async () => {
      const state = setupWebhook({
        session: { id: 'cs_deposit', payment_status: 'paid', amount_total: 50000 },
        estimate: { total_amount: 1740, amount_paid: 0, last_payment_session_id: null },
      })

      const res = await send()
      assert.equal(res.status, 200)

      const updateCall = findUpdate(state)
      assert.ok(updateCall)
      assert.equal(updateCall.payload.amount_paid, 500)
      assert.equal(updateCall.payload.last_payment_session_id, 'cs_deposit')
      assert.equal('status' in updateCall.payload, false)
      assert.deepEqual(updateCall.filters.find((f) => f.op === 'is'), { op: 'is', column: 'last_payment_session_id', value: null })

      const analyticsCall = state.supabase.queryCalls.find((query) => query.table === 'analytics_events' && query.action === 'upsert')
      assert.equal(analyticsCall.payload[0].metadata.status_transitioned, false)
    })

    test('balance payment completing total marks estimate paid', async () => {
      const state = setupWebhook({
        session: { id: 'cs_balance', payment_status: 'paid', amount_total: 124000 },
        estimate: { total_amount: 1740, amount_paid: 500, last_payment_session_id: 'cs_deposit' },
      })

      const res = await send()
      assert.equal(res.status, 200)

      const updateCall = findUpdate(state)
      assert.equal(updateCall.payload.status, 'paid')
      assert.equal(updateCall.payload.amount_paid, 1740)
      assert.equal(updateCall.payload.payment_completed_at, '2025-01-01T00:00:00.000Z')
      assert.deepEqual(updateCall.filters.find((f) => f.op === 'eq' && f.column === 'last_payment_session_id'), {
        op: 'eq', column: 'last_payment_session_id', value: 'cs_deposit',
      })

      const analyticsCall = state.supabase.queryCalls.find((query) => query.table === 'analytics_events' && query.action === 'upsert')
      assert.equal(analyticsCall.payload[0].metadata.status_transitioned, true)
    })

    test('same session delivered twice is applied once', async () => {
      const state = setupWebhook({
        session: { id: 'cs_deposit', payment_status: 'paid', amount_total: 50000 },
        estimate: { total_amount: 1740, amount_paid: 500, last_payment_session_id: 'cs_deposit' },
      })

      const res = await send()
      assert.equal(res.status, 200)
      assert.equal(findUpdate(state), undefined)
    })

    test('older session replayed after the estimate is fully paid adds nothing', async () => {
      const state = setupWebhook({
        session: { id: 'cs_deposit_A', payment_status: 'paid', amount_total: 50000 },
        estimate: { status: 'paid', total_amount: 1740, amount_paid: 1740, last_payment_session_id: 'cs_balance_B' },
      })

      const res = await send()
      assert.equal(res.status, 200)
      assert.equal(findUpdate(state), undefined)
    })

    test('unpaid checkout completion writes no analytics or estimate rows', async () => {
      const state = setupWebhook({
        session: { id: 'cs_unpaid', payment_status: 'unpaid', amount_total: 174000 },
        estimate: { total_amount: 1740, amount_paid: 0, last_payment_session_id: null },
      })

      const res = await send()
      assert.equal(res.status, 200)
      assert.deepEqual(
        state.supabase.queryCalls.filter((query) => query.action !== 'select'),
        []
      )
    })

    test('lost race deletes ledger row and webhook returns 500', async () => {
      const state = setupWebhook({
        session: { id: 'cs_race', payment_status: 'paid', amount_total: 50000 },
        estimate: { total_amount: 1740, amount_paid: 0, last_payment_session_id: null },
      })
      const base = state.supabase.queryResolver
      state.supabase.queryResolver = async (query) => {
        if (query.table === 'estimates' && query.action === 'update') return { data: null, error: null }
        return base(query)
      }

      const res = await send()
      assert.equal(res.status, 500)

      const insertCall = state.supabase.queryCalls.find((q) => q.table === 'analytics_events' && q.action === 'insert')
      assert.equal(insertCall.payload.external_id, 'payment_settlement:cs_race')
      const deleteCall = state.supabase.queryCalls.find((q) => q.table === 'analytics_events' && q.action === 'delete')
      assert.ok(deleteCall)
      assert.deepEqual(deleteCall.filters, [{ op: 'eq', column: 'external_id', value: 'payment_settlement:cs_race' }])
      assert.equal(state.opsAlerts.calls.at(-1)?.alertKey, 'stripe_webhook_status_update_failed')
    })

    test('paid session without amount_total returns 500 and records ops alert', async () => {
      const state = setupWebhook({
        session: { id: 'cs_no_amount', payment_status: 'paid' },
        estimate: { total_amount: 1740, amount_paid: 0, last_payment_session_id: null },
      })

      const res = await send()
      assert.equal(res.status, 500)
      assert.equal(state.opsAlerts.calls.at(-1)?.alertKey, 'stripe_webhook_status_update_failed')
      assert.deepEqual(
        state.supabase.queryCalls.filter((query) => query.action !== 'select'),
        []
      )
    })

    test('missing total_amount records ops alert', async () => {
      const state = setupWebhook({
        session: { id: 'cs_no_total', payment_status: 'paid', amount_total: 50000 },
        estimate: { total_amount: null, amount_paid: 0, last_payment_session_id: null },
      })

      const res = await send()
      assert.equal(res.status, 200)

      const updateCall = findUpdate(state)
      assert.equal(updateCall.payload.amount_paid, 500)
      assert.equal('status' in updateCall.payload, false)
      assert.equal(
        state.opsAlerts.calls.some((call) => call.alertKey === 'stripe_settlement_missing_total'),
        true
      )
    })
  })

  test('skips settlement when Stripe metadata userId does not match estimate owner', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'

    const state = getTestState()

    state.stripe.constructEvent = () => ({
      id: 'evt_mismatch',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_mismatch',
          metadata: {
            estimateId: 'estimate_2',
            estimateNumber: 'EST-2',
            userId: 'user_attacker',
          },
        },
      },
    })

    state.supabase.queryResolver = async (query) => {
      if (query.table === 'estimates' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: {
            id: 'estimate_2',
            user_id: 'user_owner',
            estimate_number: 'EST-2',
            status: 'sent',
          },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify({ fake: true }),
      headers: {
        'stripe-signature': 'sig_test',
      },
    })

    const res = await stripeWebhook(req)
    const text = await res.text()

    assert.equal(res.status, 200)
    assert.equal(text, 'Received')
    assert.equal(
      state.supabase.queryCalls.some(
        (query) => query.table === 'estimates' && query.action === 'update'
      ),
      false
    )
    assert.equal(state.opsAlerts.calls.at(-1)?.alertKey, 'stripe_webhook_ownership_mismatch')
  })

  test('returns 500 and records ops alert when estimate lookup fails during settlement', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'

    const state = getTestState()

    state.stripe.constructEvent = () => ({
      id: 'evt_lookup_error',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_lookup_error',
          metadata: {
            estimateId: 'estimate_broken',
            estimateNumber: 'EST-BROKEN',
            userId: 'user_1',
          },
        },
      },
    })

    state.supabase.queryResolver = async (query) => {
      if (query.table === 'estimates' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: null,
          error: { message: 'database unavailable' },
        }
      }

      return { data: null, error: null }
    }

    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify({ fake: true }),
      headers: {
        'stripe-signature': 'sig_test',
      },
    })

    const res = await stripeWebhook(req)
    const text = await res.text()

    assert.equal(res.status, 500)
    assert.match(text, /Database Error/)
    assert.equal(state.opsAlerts.calls.at(-1)?.alertKey, 'stripe_webhook_target_estimate_fetch_failed')
  })
})

describe('GET /api/payments/stripe/status', () => {
  test('returns unauthorized when auth guard fails', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'

    const state = getTestState()
    state.routeAuth.result = {
      ok: false,
      response: new Response(
        JSON.stringify({ error: { message: 'Unauthorized', code: 401 } }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      ),
    }

    const req = new Request('http://localhost/api/payments/stripe/status?paymentLinkId=plink_auth_required', {
      method: 'GET',
    })

    const res = await stripePaymentStatusGet(req)
    assert.equal(res.status, 401)
  })

  test('returns 400 when paymentLinkId is missing', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'

    const req = new Request('http://localhost/api/payments/stripe/status', {
      method: 'GET',
    })

    const res = await stripePaymentStatusGet(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.match(data.error, /paymentLinkId is required/)
  })

  test('returns paid=false when no paid checkout sessions exist', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'

    const state = getTestState()
    state.stripe.sessionsListPages = [
      {
        data: [{ id: 'cs_1', payment_status: 'unpaid', metadata: {} }],
        has_more: false,
      },
    ]

    const req = new Request('http://localhost/api/payments/stripe/status?paymentLinkId=plink_123', {
      method: 'GET',
    })

    const res = await stripePaymentStatusGet(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.paid, false)
    assert.equal(state.stripe.checkoutSessionsListCalls[0].payment_link, 'plink_123')
  })

  test('returns paid=true for matching paid session metadata', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'

    const state = getTestState()
    state.stripe.sessionsListPages = [
      {
        data: [
          {
            id: 'cs_paid_1',
            payment_status: 'paid',
            payment_intent: 'pi_paid_1',
            metadata: {},
            created: 1735689600,
          },
        ],
        has_more: false,
      },
    ]
    state.stripe.paymentIntentsRetrieve = async () => ({
      metadata: {
        estimateId: '11111111-1111-4111-8111-111111111111',
        estimateNumber: 'EST-PAID-1',
        userId: 'user-1',
      },
    })

    const req = new Request('http://localhost/api/payments/stripe/status?paymentLinkId=plink_abc&estimateId=11111111-1111-4111-8111-111111111111&estimateNumber=EST-PAID-1', {
      method: 'GET',
    })

    const res = await stripePaymentStatusGet(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.paid, true)
    assert.equal(data.checkoutSessionId, 'cs_paid_1')
    assert.equal(data.estimateNumber, 'EST-PAID-1')
    assert.match(data.paidAt, /Z$/)
  })

  describe('server estimate verdict', () => {
    const ESTIMATE_ID = '11111111-1111-4111-8111-111111111111'
    const statusUrl = `http://localhost/api/payments/stripe/status?paymentLinkId=plink_abc&estimateId=${ESTIMATE_ID}&estimateNumber=EST-PAID-1`

    function arrangePaidSession(resolver) {
      process.env.STRIPE_SECRET_KEY = 'sk_test'
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'

      const state = getTestState()
      state.stripe.sessionsListPages = [
        {
          data: [
            {
              id: 'cs_paid_1',
              payment_status: 'paid',
              metadata: { estimateId: ESTIMATE_ID, estimateNumber: 'EST-PAID-1', userId: 'user-1' },
              created: 1735689600,
            },
          ],
          has_more: false,
        },
      ]
      state.supabase.queryResolver = resolver
      return state
    }

    test('status route reports server estimate status alongside session paid', async () => {
      const state = arrangePaidSession(async (query) => {
        if (query.table === 'estimates' && query.action === 'select' && query.mode === 'maybeSingle') {
          return { data: { status: 'sent', amount_paid: 500 }, error: null }
        }
        return { data: [], error: null }
      })

      const res = await stripePaymentStatusGet(new Request(statusUrl))
      const data = await res.json()

      assert.equal(res.status, 200)
      assert.equal(data.paid, true)
      assert.equal(data.estimateStatus, 'sent')
      assert.equal(data.amountPaid, 500)

      const lookup = state.supabase.queryCalls.find((q) => q.table === 'estimates')
      assert.deepEqual(
        lookup.filters.map((f) => [f.op, f.column, f.value]),
        [['eq', 'id', ESTIMATE_ID], ['eq', 'user_id', 'user-1']]
      )
    })

    test('status route omits verdict keys when the estimate row is missing', async () => {
      arrangePaidSession(async () => ({ data: null, error: null }))

      const res = await stripePaymentStatusGet(new Request(statusUrl))
      const data = await res.json()

      assert.equal(res.status, 200)
      assert.equal(data.paid, true)
      assert.equal('estimateStatus' in data, false)
      assert.equal('amountPaid' in data, false)
    })

    test('status route stays 200 and omits verdict keys on a DB error', async () => {
      arrangePaidSession(async () => ({ data: null, error: { message: 'db down' } }))
      const originalError = console.error
      console.error = () => {}
      try {
        const res = await stripePaymentStatusGet(new Request(statusUrl))
        const data = await res.json()

        assert.equal(res.status, 200)
        assert.equal(data.paid, true)
        assert.equal('estimateStatus' in data, false)
        assert.equal('amountPaid' in data, false)
      } finally {
        console.error = originalError
      }
    })
  })

  test('returns paid=false when a requested checkout session id does not match', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'

    const state = getTestState()
    state.stripe.sessionsListPages = [
      {
        data: [
          {
            id: 'cs_paid_other',
            payment_status: 'paid',
            metadata: {
              estimateId: '11111111-1111-4111-8111-111111111111',
              estimateNumber: 'EST-PAID-1',
              userId: 'user-1',
            },
            created: 1735689600,
          },
        ],
        has_more: false,
      },
    ]

    const req = new Request('http://localhost/api/payments/stripe/status?paymentLinkId=plink_abc&estimateId=11111111-1111-4111-8111-111111111111&estimateNumber=EST-PAID-1&sessionId=cs_requested', {
      method: 'GET',
    })

    const res = await stripePaymentStatusGet(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.paid, false)
  })

  test('returns 401 for Stripe authentication errors', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'

    const state = getTestState()
    const error = new Error('auth failed')
    error.type = 'StripeAuthenticationError'
    state.stripe.sessionsListPages = [Promise.reject(error)]

    const req = new Request('http://localhost/api/payments/stripe/status?paymentLinkId=plink_auth', {
      method: 'GET',
    })

    const res = await stripePaymentStatusGet(req)
    const data = await res.json()

    assert.equal(res.status, 401)
    assert.match(data.error, /Invalid Stripe API key/)
  })
})

describe('GET /api/webhooks/stripe/reconcile', () => {
  test('requires CRON_SECRET authorization', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'
    process.env.CRON_SECRET = 'cron_secret'

    const req = new Request('http://localhost/api/webhooks/stripe/reconcile', {
      method: 'GET',
    })

    const res = await stripeReconcileGet(req)
    const data = await res.json()

    assert.equal(res.status, 401)
    assert.equal(data.error, 'Unauthorized')
  })

  test('reconciles paid sessions and returns stats', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'
    process.env.CRON_SECRET = 'cron_secret'

    const state = getTestState()

    state.stripe.sessionsListPages = [
      {
        data: [
          {
            id: 'cs_paid_1',
            created: 1735689600,
            payment_status: 'paid',
            amount_total: 100000,
            metadata: {
              estimateId: 'estimate_paid_1',
              estimateNumber: 'EST-PAID-1',
              userId: 'user_1',
            },
          },
        ],
        has_more: false,
      },
    ]

    state.supabase.queryResolver = async (query) => {
      if (query.table === 'estimates' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: {
            id: 'estimate_paid_1',
            user_id: 'user_1',
            estimate_number: 'EST-PAID-1',
            total_amount: 1000,
            amount_paid: 0,
            last_payment_session_id: null,
          },
          error: null,
        }
      }

      if (query.table === 'estimates' && query.action === 'update' && query.mode === 'maybeSingle') {
        return {
          data: { id: 'estimate_paid_1' },
          error: null,
        }
      }

      if (query.table === 'analytics_events' && query.action === 'upsert') {
        return {
          data: [],
          error: null,
        }
      }

      return { data: [], error: null }
    }

    const req = new Request('http://localhost/api/webhooks/stripe/reconcile?lookbackHours=24', {
      method: 'GET',
      headers: {
        authorization: 'Bearer cron_secret',
      },
    })

    const res = await stripeReconcileGet(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.scanned, 1)
    assert.equal(data.paidSessions, 1)
    assert.equal(data.matched, 1)
    assert.equal(data.updated, 1)
    const updateCall = state.supabase.queryCalls.find(
      (query) => query.table === 'estimates' && query.action === 'update'
    )
    assert.equal(updateCall.payload.status, 'paid')
    assert.equal(updateCall.payload.payment_completed_at, '2025-01-01T00:00:00.000Z')
    assert.equal(updateCall.payload.last_payment_session_id, 'cs_paid_1')
    assert.match(updateCall.payload.updated_at, /Z$/)
  })

  test('reconcile treats payment-completed sent estimates as already paid', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'
    process.env.CRON_SECRET = 'cron_secret'

    const state = getTestState()
    const paidAt = '2024-12-31T23:00:00.000Z'

    state.stripe.sessionsListPages = [
      {
        data: [
          {
            id: 'cs_paid_like_reconcile',
            created: 1735689600,
            payment_status: 'paid',
            amount_total: 20000,
            metadata: {
              estimateId: 'estimate_paid_like_reconcile',
              estimateNumber: 'EST-PAID-LIKE-RECONCILE',
              userId: 'user_1',
            },
          },
        ],
        has_more: false,
      },
    ]

    state.supabase.queryResolver = async (query) => {
      if (query.table === 'estimates' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: {
            id: 'estimate_paid_like_reconcile',
            user_id: 'user_1',
            estimate_number: 'EST-PAID-LIKE-RECONCILE',
            status: 'sent',
            payment_completed_at: paidAt,
            total_amount: 200,
            amount_paid: 0,
            last_payment_session_id: null,
          },
          error: null,
        }
      }

      if (query.table === 'estimates' && query.action === 'update' && query.mode === 'maybeSingle') {
        return { data: { id: 'estimate_paid_like_reconcile' }, error: null }
      }

      if (query.table === 'analytics_events' && query.action === 'upsert') {
        return { data: [], error: null }
      }

      return { data: [], error: null }
    }

    const req = new Request('http://localhost/api/webhooks/stripe/reconcile?lookbackHours=24', {
      method: 'GET',
      headers: {
        authorization: 'Bearer cron_secret',
      },
    })

    const res = await stripeReconcileGet(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.matched, 1)
    assert.equal(data.updated, 0)
    assert.equal(data.alreadyPaid, 1)

    const updateCall = state.supabase.queryCalls.find(
      (query) => query.table === 'estimates' && query.action === 'update'
    )
    assert.ok(updateCall)
    assert.equal(updateCall.payload.status, 'paid')
    assert.equal(updateCall.payload.payment_completed_at, paidAt)

    const analyticsCall = state.supabase.queryCalls.find(
      (query) => query.table === 'analytics_events' && query.action === 'upsert'
    )
    assert.ok(analyticsCall)
    assert.equal(analyticsCall.payload[0].metadata.status_transitioned, false)
  })

  test('reconcile records a deposit below total without marking the estimate paid', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'
    process.env.CRON_SECRET = 'cron_secret'

    const state = getTestState()
    state.stripe.sessionsListPages = [{
      data: [{
        id: 'cs_deposit_reconcile',
        created: 1735689600,
        payment_status: 'paid',
        amount_total: 50000,
        metadata: { estimateId: 'estimate_dep', estimateNumber: 'EST-DEP', userId: 'user_1' },
      }],
      has_more: false,
    }]
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'estimates' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: {
            id: 'estimate_dep', user_id: 'user_1', estimate_number: 'EST-DEP', status: 'sent',
            total_amount: 1740, amount_paid: 0, last_payment_session_id: null,
          },
          error: null,
        }
      }
      if (query.table === 'estimates' && query.action === 'update' && query.mode === 'maybeSingle') {
        return { data: { id: 'estimate_dep' }, error: null }
      }
      return { data: [], error: null }
    }

    const res = await stripeReconcileGet(new Request('http://localhost/api/webhooks/stripe/reconcile?lookbackHours=24', {
      method: 'GET',
      headers: { authorization: 'Bearer cron_secret' },
    }))
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.matched, 1)
    assert.equal(data.updated, 0)
    const updateCall = state.supabase.queryCalls.find((q) => q.table === 'estimates' && q.action === 'update')
    assert.equal(updateCall.payload.amount_paid, 500)
    assert.equal('status' in updateCall.payload, false)
  })

  test('reconcile marks estimate paid when the balance payment completes the total', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'
    process.env.CRON_SECRET = 'cron_secret'

    const state = getTestState()
    state.stripe.sessionsListPages = [{
      data: [{
        id: 'cs_balance_reconcile',
        created: 1735689600,
        payment_status: 'paid',
        amount_total: 124000,
        metadata: { estimateId: 'estimate_bal', estimateNumber: 'EST-BAL', userId: 'user_1' },
      }],
      has_more: false,
    }]
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'estimates' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: {
            id: 'estimate_bal', user_id: 'user_1', estimate_number: 'EST-BAL', status: 'sent',
            total_amount: 1740, amount_paid: 500, last_payment_session_id: 'cs_deposit_reconcile',
          },
          error: null,
        }
      }
      if (query.table === 'estimates' && query.action === 'update' && query.mode === 'maybeSingle') {
        return { data: { id: 'estimate_bal' }, error: null }
      }
      return { data: [], error: null }
    }

    const res = await stripeReconcileGet(new Request('http://localhost/api/webhooks/stripe/reconcile?lookbackHours=24', {
      method: 'GET',
      headers: { authorization: 'Bearer cron_secret' },
    }))
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.matched, 1)
    assert.equal(data.updated, 1)
    const updateCall = state.supabase.queryCalls.find((q) => q.table === 'estimates' && q.action === 'update')
    assert.equal(updateCall.payload.status, 'paid')
    assert.equal(updateCall.payload.amount_paid, 1740)
  })

  test('reconcile rescan of an older session on a fully paid estimate does not update', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'
    process.env.CRON_SECRET = 'cron_secret'

    const state = getTestState()
    state.stripe.sessionsListPages = [{
      data: [{
        id: 'cs_deposit_A',
        created: 1735689600,
        payment_status: 'paid',
        amount_total: 50000,
        metadata: { estimateId: 'estimate_done', estimateNumber: 'EST-DONE', userId: 'user_1' },
      }],
      has_more: false,
    }]
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'estimates' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: {
            id: 'estimate_done', user_id: 'user_1', estimate_number: 'EST-DONE', status: 'paid',
            payment_completed_at: '2025-01-02T00:00:00.000Z',
            total_amount: 1740, amount_paid: 1740, last_payment_session_id: 'cs_balance_B',
          },
          error: null,
        }
      }
      return { data: [], error: null }
    }

    const res = await stripeReconcileGet(new Request('http://localhost/api/webhooks/stripe/reconcile?lookbackHours=24', {
      method: 'GET',
      headers: { authorization: 'Bearer cron_secret' },
    }))
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.matched, 1)
    assert.equal(data.updated, 0)
    assert.equal(
      state.supabase.queryCalls.some((q) => q.table === 'estimates' && q.action === 'update'),
      false
    )
  })

  test('reconcile rescan after two partial webhook payments does not inflate amount_paid', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'
    process.env.CRON_SECRET = 'cron_secret'

    const state = getTestState()
    const db = createSettlementDb({
      id: 'estimate_two', estimate_number: 'EST-TWO',
      total_amount: 1740, amount_paid: 0, last_payment_session_id: null,
    })
    state.supabase.queryResolver = db.resolver

    const makeSession = (id) => ({
      id,
      created: 1735689600,
      payment_status: 'paid',
      amount_total: 50000,
      metadata: { estimateId: 'estimate_two', estimateNumber: 'EST-TWO', userId: 'user_1' },
    })

    for (const id of ['cs_A1', 'cs_A2']) {
      state.stripe.constructEvent = () => ({
        id: `evt_${id}`,
        type: 'checkout.session.completed',
        data: { object: makeSession(id) },
      })
      const res = await stripeWebhook(new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: '{}',
        headers: { 'stripe-signature': 'sig_test' },
      }))
      assert.equal(res.status, 200)
    }
    assert.equal(db.row.amount_paid, 1000)
    assert.equal(db.row.last_payment_session_id, 'cs_A2')

    for (let run = 0; run < 2; run += 1) {
      state.stripe.sessionsListPages = [{ data: [makeSession('cs_A2'), makeSession('cs_A1')], has_more: false }]
      const res = await stripeReconcileGet(new Request('http://localhost/api/webhooks/stripe/reconcile?lookbackHours=24', {
        method: 'GET',
        headers: { authorization: 'Bearer cron_secret' },
      }))
      const data = await res.json()
      assert.equal(res.status, 200)
      assert.equal(data.errors, 0)
    }

    assert.equal(db.row.amount_paid, 1000)
    assert.equal(db.row.status, 'sent')
  })

  test('skips reconcile when session metadata is missing userId', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'
    process.env.CRON_SECRET = 'cron_secret'

    const state = getTestState()
    state.stripe.sessionsListPages = [
      {
        data: [
          {
            id: 'cs_paid_missing_user',
            payment_status: 'paid',
            metadata: {
              estimateId: 'estimate_paid_2',
              estimateNumber: 'EST-PAID-2',
            },
          },
        ],
        has_more: false,
      },
    ]

    const req = new Request('http://localhost/api/webhooks/stripe/reconcile?lookbackHours=24', {
      method: 'GET',
      headers: {
        authorization: 'Bearer cron_secret',
      },
    })

    const res = await stripeReconcileGet(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.scanned, 1)
    assert.equal(data.paidSessions, 1)
    assert.equal(data.matched, 0)
    assert.equal(data.missingMetadata, 1)
    assert.equal(
      state.supabase.queryCalls.some((query) => query.table === 'estimates' && query.action === 'update'),
      false
    )
    assert.equal(state.opsAlerts.calls.at(-1)?.alertKey, 'stripe_reconcile_reference_gaps')
  })

  test('accepts x-cron-secret auth and records processing errors in reconcile stats', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'
    process.env.CRON_SECRET = 'cron_secret'

    const state = getTestState()
    state.stripe.sessionsListPages = [
      {
        data: [
          {
            id: 'cs_paid_error',
            payment_status: 'paid',
            amount_total: 100000,
            metadata: {
              estimateId: 'estimate_paid_error',
              estimateNumber: 'EST-PAID-ERR',
              userId: 'user_1',
            },
          },
        ],
        has_more: false,
      },
    ]

    state.supabase.queryResolver = async (query) => {
      if (query.table === 'estimates' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: {
            id: 'estimate_paid_error',
            user_id: 'user_1',
            estimate_number: 'EST-PAID-ERR',
            total_amount: 1000,
            amount_paid: 0,
            last_payment_session_id: null,
          },
          error: null,
        }
      }

      if (query.table === 'estimates' && query.action === 'update' && query.mode === 'maybeSingle') {
        return {
          data: null,
          error: { message: 'update failed' },
        }
      }

      return { data: [], error: null }
    }

    const req = new Request('http://localhost/api/webhooks/stripe/reconcile?lookbackHours=24', {
      method: 'GET',
      headers: {
        'x-cron-secret': 'cron_secret',
      },
    })

    const res = await stripeReconcileGet(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.scanned, 1)
    assert.equal(data.paidSessions, 1)
    assert.equal(data.matched, 1)
    assert.equal(data.updated, 0)
    assert.equal(data.errors, 1)
    assert.equal(state.opsAlerts.calls.at(-1)?.alertKey, 'stripe_reconcile_errors_detected')
  })

  test('returns 500 and records ops alert when Stripe session listing fails', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'
    process.env.CRON_SECRET = 'cron_secret'

    const state = getTestState()
    state.stripe.sessionsListPages = [Promise.reject(new Error('stripe unavailable'))]

    const req = new Request('http://localhost/api/webhooks/stripe/reconcile?lookbackHours=24', {
      method: 'GET',
      headers: {
        authorization: 'Bearer cron_secret',
      },
    })

    const res = await stripeReconcileGet(req)
    const data = await res.json()

    assert.equal(res.status, 500)
    assert.equal(data.error, 'Failed to list Stripe sessions')
    assert.equal(state.opsAlerts.calls.at(-1)?.alertKey, 'stripe_reconcile_list_failed')
  })
})

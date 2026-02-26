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
          metadata: {
            estimateId: 'estimate_1',
            estimateNumber: 'EST-1',
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
  })
})

describe('GET /api/payments/stripe/status', () => {
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
            payment_status: 'paid',
            metadata: {
              estimateId: 'estimate_paid_1',
              estimateNumber: 'EST-PAID-1',
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
          },
          error: null,
        }
      }

      if (query.table === 'estimates' && query.action === 'update' && query.mode === 'execute') {
        return {
          data: [{ id: 'estimate_paid_1' }],
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
  })
})

import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { POST as finalize } from '../../app/api/estimates/[estimateId]/completion/route.ts'
import { bearerHeader, jsonRequest } from '../helpers/http.mjs'
import { getTestState, resetTestState } from '../mocks/state.mjs'

const ESTIMATE_ID = '11111111-1111-4111-8111-111111111111'

function setEnv() {
  process.env.STRIPE_SECRET_KEY = 'sk_test_123'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'
}

function mockDb(state, estimate, { accountId = 'acct_connected_1' } = {}) {
  const updates = []
  state.supabase.queryResolver = async (query) => {
    if (query.table === 'estimates' && query.action === 'select') {
      if (!estimate) return { data: null, error: null }
      const idFilter = query.filters.find((f) => f.column === 'id')
      const userFilter = query.filters.find((f) => f.column === 'user_id')
      const matches =
        (!idFilter || idFilter.value === estimate.id) && (!userFilter || userFilter.value === estimate.user_id)
      return { data: matches ? estimate : null, error: null }
    }
    if (query.table === 'estimates' && query.action === 'update') {
      updates.push({ payload: query.payload, filters: query.filters })
      return { data: { id: estimate.id }, error: null }
    }
    if (query.table === 'profiles' && query.action === 'select') {
      return {
        data: {
          stripe_account_id: accountId,
          stripe_details_submitted: true,
          stripe_charges_enabled: true,
          stripe_payouts_enabled: true,
          stripe_onboarded_at: null,
        },
        error: null,
      }
    }
    return { data: null, error: null }
  }
  return updates
}

const baseEstimate = (overrides = {}) => ({
  id: ESTIMATE_ID,
  user_id: 'user-1',
  estimate_number: 'EST-1740',
  status: 'sent',
  total_amount: 1740,
  amount_paid: 0,
  payment_link_id: null,
  payment_link_type: null,
  clients: { name: 'Jordan' },
  ...overrides,
})

const post = (body, id = ESTIMATE_ID) =>
  finalize(
    jsonRequest(`http://localhost/api/estimates/${id}/completion`, body, { headers: bearerHeader() }),
    { params: Promise.resolve({ estimateId: id }) }
  )

beforeEach(() => {
  resetTestState()
  setEnv()
})

describe('POST /api/estimates/[estimateId]/completion', () => {
  test('finalize records already received and creates balance link', async () => {
    const state = getTestState()
    const updates = mockDb(state, baseEstimate())
    let captured = null
    state.stripe.paymentLinksCreate = async (payload, options) => {
      captured = { payload, options }
      return { id: 'plink_balance', url: 'https://pay.stripe.com/balance' }
    }

    const res = await post({ alreadyReceived: 500 })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.deepEqual(data, {
      ok: true,
      totalAmount: 1740,
      amountPaid: 500,
      balanceDue: 1240,
      paymentLink: 'https://pay.stripe.com/balance',
      paymentLinkId: 'plink_balance',
    })
    assert.equal(captured.payload.line_items[0].price_data.unit_amount, 124000)
    assert.equal(captured.payload.metadata.estimateId, ESTIMATE_ID)
    assert.equal(captured.options.stripeAccount, 'acct_connected_1')
    assert.equal(updates.length, 1)
    assert.equal(updates[0].payload.amount_paid, 500)
    assert.equal(updates[0].payload.payment_link, 'https://pay.stripe.com/balance')
    assert.equal(updates[0].payload.payment_link_id, 'plink_balance')
    assert.equal(updates[0].payload.payment_link_type, 'custom')
    assert.equal('status' in updates[0].payload, false)
    assert.ok(updates[0].filters.some((f) => f.column === 'user_id' && f.value === 'user-1'))
    assert.equal(state.stripe.paymentLinksUpdateCalls.length, 0)
  })

  test('finalize deactivates previous payment link', async () => {
    const state = getTestState()
    mockDb(state, baseEstimate({ payment_link_id: 'plink_old', payment_link: 'https://pay.stripe.com/old' }))
    state.stripe.paymentLinksCreate = async () => ({ id: 'plink_new', url: 'https://pay.stripe.com/new' })

    const res = await post({ alreadyReceived: 500 })

    assert.equal(res.status, 200)
    assert.equal(state.stripe.paymentLinksUpdateCalls.length, 1)
    assert.equal(state.stripe.paymentLinksUpdateCalls[0].id, 'plink_old')
    assert.deepEqual(state.stripe.paymentLinksUpdateCalls[0].payload, { active: false })
    assert.equal(state.stripe.paymentLinksUpdateCalls[0].requestOptions.stripeAccount, 'acct_connected_1')
  })

  test('finalize does not deactivate the previous link when Stripe returns the same id', async () => {
    const state = getTestState()
    mockDb(state, baseEstimate({ payment_link_id: 'plink_same' }))
    state.stripe.paymentLinksCreate = async () => ({ id: 'plink_same', url: 'https://pay.stripe.com/same' })

    const res = await post({ alreadyReceived: 500 })

    assert.equal(res.status, 200)
    assert.equal(state.stripe.paymentLinksUpdateCalls.length, 0)
  })

  test('finalize keeps the old link and row untouched when creating the new link fails', async () => {
    const state = getTestState()
    const updates = mockDb(state, baseEstimate({ payment_link_id: 'plink_old' }))
    state.stripe.paymentLinksCreate = async () => {
      throw new Error('stripe down')
    }

    const res = await post({ alreadyReceived: 500 })

    assert.equal(res.status, 500)
    assert.equal(state.stripe.paymentLinksUpdateCalls.length, 0)
    assert.equal(updates.length, 0)
  })

  test('finalize still succeeds and raises an ops alert when deactivation fails', async () => {
    const state = getTestState()
    const updates = mockDb(state, baseEstimate({ payment_link_id: 'plink_old' }))
    state.stripe.paymentLinksUpdate = async () => {
      throw new Error('cannot update')
    }

    const res = await post({ alreadyReceived: 500 })

    assert.equal(res.status, 200)
    assert.equal(updates.length, 1)
    assert.equal(state.opsAlerts.calls.length, 1)
    assert.equal(state.opsAlerts.calls[0].severity, 'warning')
  })

  test('finalize with received >= total creates no link and returns balance 0', async () => {
    const state = getTestState()
    const updates = mockDb(state, baseEstimate({ payment_link_id: 'plink_old', payment_link: 'https://pay.stripe.com/old' }))
    let created = 0
    state.stripe.paymentLinksCreate = async () => {
      created += 1
      return { id: 'x', url: 'x' }
    }

    const res = await post({ alreadyReceived: 1800 })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.balanceDue, 0)
    assert.equal(data.amountPaid, 1800)
    assert.equal('paymentLink' in data, false)
    assert.equal(created, 0)
    assert.equal(state.stripe.paymentLinksUpdateCalls.length, 1)
    assert.equal(updates[0].payload.payment_link, null)
    assert.equal(updates[0].payload.payment_link_id, null)
  })

  test('finalize reopens deposit-paid estimate to sent', async () => {
    const state = getTestState()
    const updates = mockDb(
      state,
      baseEstimate({
        status: 'paid',
        payment_link_type: 'deposit',
        payment_link_id: 'plink_deposit',
        amount_paid: 500,
        payment_completed_at: '2026-10-20T00:00:00Z',
      })
    )

    const res = await post({ alreadyReceived: 500 })

    assert.equal(res.status, 200)
    assert.equal(updates[0].payload.status, 'sent')
    assert.equal(updates[0].payload.payment_completed_at, null)
    assert.equal(updates[0].payload.payment_link_type, 'custom')
  })

  test('finalize rejects negative alreadyReceived with 400', async () => {
    const state = getTestState()
    mockDb(state, baseEstimate())

    const res = await post({ alreadyReceived: -1 })

    assert.equal(res.status, 400)
    assert.equal(state.stripe.instances.length, 0)
  })

  test('finalize rejects non-finite, oversized and extra fields with 400', async () => {
    const state = getTestState()
    mockDb(state, baseEstimate())

    assert.equal((await post({ alreadyReceived: 1_000_001 })).status, 400)
    assert.equal((await post({ alreadyReceived: '5' })).status, 400)
    assert.equal((await post({ alreadyReceived: 5, status: 'paid' })).status, 400)
  })

  test("finalize rejects another user's estimate with 404", async () => {
    const state = getTestState()
    mockDb(state, baseEstimate({ user_id: 'user-2' }))

    const res = await post({ alreadyReceived: 500 })

    assert.equal(res.status, 404)
    assert.equal(state.stripe.instances.length, 0)
  })

  test('finalize rejects fully paid non-deposit estimate with 409', async () => {
    const state = getTestState()
    const updates = mockDb(state, baseEstimate({ status: 'paid', payment_link_type: 'full', amount_paid: 1740 }))

    const res = await post({ alreadyReceived: 500 })

    assert.equal(res.status, 409)
    assert.equal(updates.length, 0)
    assert.equal(state.stripe.instances.length, 0)
  })

  test('finalize returns unauthorized when auth guard fails', async () => {
    const state = getTestState()
    state.routeAuth.result = {
      ok: false,
      response: new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }),
    }

    const res = await post({ alreadyReceived: 500 })

    assert.equal(res.status, 401)
  })
})

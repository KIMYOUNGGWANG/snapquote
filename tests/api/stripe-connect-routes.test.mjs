import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { getTestState, resetTestState } from '../mocks/state.mjs'

import { POST as stripeConnectOnboardPost } from '../../app/api/stripe/connect/onboard/route.ts'
import { GET as stripeConnectStatusGet } from '../../app/api/stripe/connect/status/route.ts'
import { POST as stripeConnectDashboardLinkPost } from '../../app/api/stripe/connect/dashboard-link/route.ts'

const RELEVANT_ENV_KEYS = [
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
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

describe('Stripe Connect API routes', () => {
  test('GET /api/stripe/connect/status returns unauthorized when auth guard fails', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'

    const state = getTestState()
    state.routeAuth.result = {
      ok: false,
      response: new Response(
        JSON.stringify({ error: { message: 'Unauthorized', code: 401 } }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      ),
    }

    const req = new Request('http://localhost/api/stripe/connect/status', { method: 'GET' })
    const res = await stripeConnectStatusGet(req)
    assert.equal(res.status, 401)
  })

  test('POST /api/stripe/connect/onboard creates account and onboarding link', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'
    process.env.NEXT_PUBLIC_APP_URL = 'https://snapquote.app'

    const state = getTestState()
    state.stripe.accountsCreate = async () => ({
      id: 'acct_new_123',
      details_submitted: false,
      charges_enabled: false,
      payouts_enabled: false,
    })
    state.stripe.accountLinksCreate = async () => ({
      url: 'https://connect.stripe.com/setup/s/acct_new_123',
    })

    const req = new Request('http://localhost/api/stripe/connect/onboard', { method: 'POST' })
    const res = await stripeConnectOnboardPost(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.accountId, 'acct_new_123')
    assert.equal(data.url, 'https://connect.stripe.com/setup/s/acct_new_123')
    assert.equal(state.stripe.accountsCreateCalls.length, 1)
    assert.equal(state.stripe.accountLinksCreateCalls.length, 1)
  })

  test('GET /api/stripe/connect/status returns connected false when account is not linked', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'

    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'profiles' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: {
            stripe_account_id: null,
            stripe_details_submitted: false,
            stripe_charges_enabled: false,
            stripe_payouts_enabled: false,
            stripe_onboarded_at: null,
          },
          error: null,
        }
      }
      return { data: null, error: null }
    }

    const req = new Request('http://localhost/api/stripe/connect/status', { method: 'GET' })
    const res = await stripeConnectStatusGet(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.connected, false)
  })

  test('GET /api/stripe/connect/status returns Stripe flags when connected', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'

    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'profiles' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: {
            stripe_account_id: 'acct_status_1',
            stripe_details_submitted: false,
            stripe_charges_enabled: false,
            stripe_payouts_enabled: false,
            stripe_onboarded_at: null,
          },
          error: null,
        }
      }

      if (query.table === 'profiles' && query.action === 'upsert') {
        return { data: [], error: null }
      }

      return { data: null, error: null }
    }
    state.stripe.accountRetrieve = async () => ({
      id: 'acct_status_1',
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: true,
    })

    const req = new Request('http://localhost/api/stripe/connect/status', { method: 'GET' })
    const res = await stripeConnectStatusGet(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.connected, true)
    assert.equal(data.accountId, 'acct_status_1')
    assert.equal(data.detailsSubmitted, true)
    assert.equal(data.chargesEnabled, true)
    assert.equal(data.payoutsEnabled, true)
  })

  test('POST /api/stripe/connect/dashboard-link returns 403 when account is missing', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'

    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'profiles' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: { stripe_account_id: null },
          error: null,
        }
      }
      return { data: null, error: null }
    }

    const req = new Request('http://localhost/api/stripe/connect/dashboard-link', { method: 'POST' })
    const res = await stripeConnectDashboardLinkPost(req)
    const data = await res.json()

    assert.equal(res.status, 403)
    assert.match(data.error, /not linked/i)
  })

  test('POST /api/stripe/connect/dashboard-link returns login link when connected', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'

    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'profiles' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: { stripe_account_id: 'acct_dash_1' },
          error: null,
        }
      }
      return { data: null, error: null }
    }
    state.stripe.accountLoginLinkCreate = async () => ({
      url: 'https://connect.stripe.com/express/acct_dash_1',
    })

    const req = new Request('http://localhost/api/stripe/connect/dashboard-link', { method: 'POST' })
    const res = await stripeConnectDashboardLinkPost(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.url, 'https://connect.stripe.com/express/acct_dash_1')
    assert.equal(state.stripe.accountLoginLinkCreateCalls[0], 'acct_dash_1')
  })
})

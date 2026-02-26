import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { bearerHeader, jsonRequest } from '../helpers/http.mjs'
import { getTestState, resetTestState } from '../mocks/state.mjs'

import { POST as pricingEvents } from '../../app/api/pricing/events/route.ts'
import { GET as pricingOffer } from '../../app/api/pricing/offer/route.ts'
import { GET as pricingReport } from '../../app/api/pricing/report/route.ts'
import { POST as referralToken } from '../../app/api/referrals/token/route.ts'
import { POST as referralTrack } from '../../app/api/referrals/track/route.ts'
import { POST as analyticsEvents } from '../../app/api/analytics/events/route.ts'
import { GET as analyticsFunnel } from '../../app/api/analytics/funnel/route.ts'

const RELEVANT_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
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

describe('POST /api/pricing/events', () => {
  test('requires bearer token', async () => {
    const req = jsonRequest('http://localhost/api/pricing/events', {
      event: 'pricing_viewed',
    })

    const res = await pricingEvents(req)
    assert.equal(res.status, 401)
  })

  test('returns dedupe response for duplicate external ids', async () => {
    const state = getTestState()

    state.supabase.rpcResolver = async () => ({
      data: [{ experiment_id: 'exp_1', variant: 'control' }],
      error: null,
    })

    state.supabase.queryResolver = async (query) => {
      if (query.table === 'pricing_conversions' && query.action === 'insert') {
        return {
          data: null,
          error: { code: '23505' },
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest('http://localhost/api/pricing/events', {
      event: 'upgrade_clicked',
      metadata: { button: 'hero' },
    }, {
      headers: bearerHeader(),
    })

    const res = await pricingEvents(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.deduped, true)
  })

  test('tracks pricing conversion with experiment assignment', async () => {
    const state = getTestState()

    state.supabase.rpcResolver = async () => ({
      data: [{ experiment_id: 'exp_live', variant: 'variant_b' }],
      error: null,
    })

    state.supabase.queryResolver = async (query) => {
      if (query.table === 'pricing_conversions' && query.action === 'insert' && query.mode === 'single') {
        return { data: { id: 'conv_123' }, error: null }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest('http://localhost/api/pricing/events', {
      event: 'waitlist_joined',
      experiment: 'pricing_v2',
      metadata: { source: 'modal' },
    }, {
      headers: bearerHeader(),
    })

    const res = await pricingEvents(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.eventId, 'conv_123')
    assert.equal(state.supabase.rpcCalls.length, 1)
  })
})

describe('GET /api/pricing/offer', () => {
  test('returns null offer when assignment is unavailable', async () => {
    const state = getTestState()
    state.supabase.rpcResolver = async () => ({
      data: [],
      error: null,
    })

    const req = new Request('http://localhost/api/pricing/offer', {
      method: 'GET',
      headers: bearerHeader(),
    })

    const res = await pricingOffer(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.experiment, null)
    assert.equal(data.variant, null)
  })

  test('resolves variant config from experiment payload', async () => {
    const state = getTestState()
    state.supabase.rpcResolver = async () => ({
      data: [{ experiment_id: 'exp_42', variant: 'pro_19' }],
      error: null,
    })

    state.supabase.queryResolver = async (query) => {
      if (query.table === 'pricing_experiments' && query.mode === 'maybeSingle') {
        return {
          data: {
            id: 'exp_42',
            name: 'pricing_v1',
            config: {
              currency: 'CAD',
              variants: [
                { name: 'control', priceMonthly: 0 },
                { name: 'pro_19', priceMonthly: 19, ctaLabel: 'Start Pro' },
              ],
            },
          },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = new Request('http://localhost/api/pricing/offer?experiment=pricing_v1', {
      method: 'GET',
      headers: bearerHeader(),
    })

    const res = await pricingOffer(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.experiment.id, 'exp_42')
    assert.equal(data.variant.name, 'pro_19')
    assert.equal(data.variant.priceMonthly, 19)
  })
})

describe('GET /api/pricing/report', () => {
  test('rejects unauthorized cron requests', async () => {
    process.env.CRON_SECRET = 'cron_secret'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'

    const req = new Request('http://localhost/api/pricing/report', {
      method: 'GET',
    })

    const res = await pricingReport(req)
    assert.equal(res.status, 401)
  })

  test('returns aggregated conversion counts', async () => {
    process.env.CRON_SECRET = 'cron_secret'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'

    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'pricing_conversions' && query.mode === 'execute') {
        return {
          data: [
            { experiment_id: 'exp_1', variant: 'control', event_name: 'pricing_viewed' },
            { experiment_id: 'exp_1', variant: 'control', event_name: 'pricing_viewed' },
            { experiment_id: 'exp_1', variant: 'control', event_name: 'upgrade_clicked' },
          ],
          error: null,
        }
      }

      return { data: [], error: null }
    }

    const req = new Request('http://localhost/api/pricing/report?from=2026-02-01&to=2026-02-15', {
      method: 'GET',
      headers: {
        authorization: 'Bearer cron_secret',
      },
    })

    const res = await pricingReport(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.totalEvents, 3)
    assert.equal(data.rows[0].count, 2)
    assert.equal(data.rows[0].eventName, 'pricing_viewed')
  })
})

describe('POST /api/referrals/token', () => {
  test('returns existing token when available', async () => {
    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'referral_tokens' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: { token: 'abc123def456' },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest('http://localhost/api/referrals/token', {}, {
      headers: bearerHeader(),
    })

    const res = await referralToken(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.token, 'abc123def456')
  })

  test('creates a token when none exists', async () => {
    const state = getTestState()
    let selectCount = 0

    state.supabase.queryResolver = async (query) => {
      if (query.table === 'referral_tokens' && query.action === 'select' && query.mode === 'maybeSingle') {
        selectCount += 1
        return { data: null, error: null }
      }

      if (query.table === 'referral_tokens' && query.action === 'insert' && query.mode === 'single') {
        return {
          data: { token: 'newtoken12345' },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest('http://localhost/api/referrals/token', {}, {
      headers: bearerHeader(),
    })

    const res = await referralToken(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.token, 'newtoken12345')
    assert.equal(selectCount >= 1, true)
  })
})

describe('POST /api/referrals/track', () => {
  test('rejects invalid token format', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key'

    const req = jsonRequest('http://localhost/api/referrals/track', {
      token: 'INVALID-TOKEN',
      event: 'landing_visit',
    })

    const res = await referralTrack(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.equal(data.error.message, 'Invalid token')
  })

  test('returns ok when insert fails with foreign-key error', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key'

    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'referral_events' && query.action === 'insert') {
        return {
          data: null,
          error: { code: '23503' },
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest('http://localhost/api/referrals/track', {
      token: 'abc12345',
      event: 'signup_start',
      source: 'landing',
      metadata: { campaign: 'winter' },
    })

    const res = await referralTrack(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
  })
})

describe('POST /api/analytics/events', () => {
  test('rejects unknown analytics event names', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key'

    const req = jsonRequest('http://localhost/api/analytics/events', {
      event: 'unknown_event',
    }, {
      headers: bearerHeader(),
    })

    const res = await analyticsEvents(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.equal(data.error.message, 'Invalid event name')
  })

  test('persists analytics event when payload is valid', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key'

    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'analytics_events' && query.action === 'insert' && query.mode === 'single') {
        return {
          data: { id: 'event_analytics_1' },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest('http://localhost/api/analytics/events', {
      event: 'quote_sent',
      estimateId: '11111111-1111-4111-8111-111111111111',
      channel: 'email',
      metadata: { from: 'new_estimate' },
    }, {
      headers: bearerHeader(),
    })

    const res = await analyticsEvents(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.eventId, 'event_analytics_1')
  })
})

describe('GET /api/analytics/funnel', () => {
  test('returns conversion rates from event counts', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key'

    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'analytics_events' && query.mode === 'execute') {
        return {
          data: [
            { event_name: 'draft_saved' },
            { event_name: 'draft_saved' },
            { event_name: 'quote_sent' },
            { event_name: 'payment_completed' },
          ],
          error: null,
        }
      }

      return { data: [], error: null }
    }

    const req = new Request('http://localhost/api/analytics/funnel?from=2026-02-01&to=2026-02-17', {
      method: 'GET',
      headers: bearerHeader(),
    })

    const res = await analyticsFunnel(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.draft_saved, 2)
    assert.equal(data.quote_sent, 1)
    assert.equal(data.payment_completed, 1)
    assert.equal(data.send_rate, 50)
    assert.equal(data.payment_rate, 100)
  })

  test('rejects invalid date range', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key'

    const req = new Request('http://localhost/api/analytics/funnel?from=invalid-date', {
      method: 'GET',
      headers: bearerHeader(),
    })

    const res = await analyticsFunnel(req)
    assert.equal(res.status, 400)
  })
})

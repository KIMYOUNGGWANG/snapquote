import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { bearerHeader, jsonRequest } from '../helpers/http.mjs'
import { getTestState, resetTestState } from '../mocks/state.mjs'

import { POST as pricingEvents } from '../../app/api/pricing/events/route.ts'
import { GET as pricingOffer } from '../../app/api/pricing/offer/route.ts'
import { GET as pricingReport } from '../../app/api/pricing/report/route.ts'
import { POST as referralToken } from '../../app/api/referrals/token/route.ts'
import { POST as referralTrack } from '../../app/api/referrals/track/route.ts'
import { POST as referralClaim } from '../../app/api/referrals/claim/route.ts'
import { GET as referralStatus } from '../../app/api/referrals/status/route.ts'
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

  test('accepts RPC payloads that use out_ column names', async () => {
    const state = getTestState()

    state.supabase.rpcResolver = async () => ({
      data: [{ out_experiment_id: 'exp_out', out_variant: 'variant_out' }],
      error: null,
    })

    state.supabase.queryResolver = async (query) => {
      if (query.table === 'pricing_conversions' && query.action === 'insert' && query.mode === 'single') {
        return { data: { id: 'conv_out' }, error: null }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest('http://localhost/api/pricing/events', {
      event: 'upgrade_clicked',
    }, {
      headers: bearerHeader(),
    })

    const res = await pricingEvents(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.eventId, 'conv_out')
  })

  test('skips tracking when pricing experiment schema is unavailable', async () => {
    const state = getTestState()

    state.supabase.rpcResolver = async () => ({
      data: null,
      error: {
        code: 'PGRST204',
        message: "Could not find the function public.get_or_create_pricing_assignment(experiment_name) in the schema cache",
      },
    })

    const req = jsonRequest('http://localhost/api/pricing/events', {
      event: 'pricing_viewed',
    }, {
      headers: bearerHeader(),
    })

    const res = await pricingEvents(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.skipped, true)
    assert.equal(data.reason, 'pricing_schema_unavailable')
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

  test('returns null offer when pricing schema is unavailable', async () => {
    const state = getTestState()
    state.supabase.rpcResolver = async () => ({
      data: null,
      error: {
        code: 'PGRST204',
        message: "Could not find the function public.get_or_create_pricing_assignment(experiment_name) in the schema cache",
      },
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

  test('accepts RPC payloads that use out_ column names', async () => {
    const state = getTestState()
    state.supabase.rpcResolver = async () => ({
      data: [{ out_experiment_id: 'exp_out_42', out_variant: 'pro_29' }],
      error: null,
    })

    state.supabase.queryResolver = async (query) => {
      if (query.table === 'pricing_experiments' && query.mode === 'maybeSingle') {
        return {
          data: {
            id: 'exp_out_42',
            name: 'pricing_v1',
            config: {
              currency: 'USD',
              variants: [
                { name: 'pro_29', priceMonthly: 29, ctaLabel: 'Go Pro' },
              ],
            },
          },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = new Request('http://localhost/api/pricing/offer', {
      method: 'GET',
      headers: bearerHeader(),
    })

    const res = await pricingOffer(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.experiment.id, 'exp_out_42')
    assert.equal(data.variant.name, 'pro_29')
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

describe('POST /api/referrals/claim', () => {
  test('prevents self-referrals from granting rewards', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key'

    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'referral_claims' && query.action === 'select' && query.mode === 'maybeSingle') {
        return { data: null, error: null }
      }

      if (query.table === 'referral_tokens' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: { token: 'selftoken1234', user_id: 'user-1' },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest('http://localhost/api/referrals/claim', {
      token: 'selftoken1234',
      source: 'test',
    }, {
      headers: bearerHeader(),
    })

    const res = await referralClaim(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.claimed, false)
    assert.equal(data.reason, 'self_referral')
  })

  test('grants a referred Pro trial and referrer pending credit for paid referrers', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key'

    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'referral_claims' && query.action === 'select' && query.mode === 'maybeSingle') {
        return { data: null, error: null }
      }

      if (query.table === 'referral_tokens' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: { token: 'friendtoken12', user_id: 'user-referrer' },
          error: null,
        }
      }

      if (query.table === 'referral_claims' && query.action === 'insert' && query.mode === 'single') {
        return {
          data: { id: 'claim_1' },
          error: null,
        }
      }

      if (query.table === 'profiles' && query.action === 'select' && query.mode === 'maybeSingle') {
        const idFilter = query.filters.find((filter) => filter.column === 'id')
        if (idFilter?.value === 'user-1') {
          return {
            data: {
              plan_tier: 'free',
              stripe_subscription_status: null,
              stripe_subscription_current_period_end: null,
              stripe_subscription_id: null,
              referral_trial_ends_at: null,
            },
            error: null,
          }
        }

        if (idFilter?.value === 'user-referrer') {
          return {
            data: {
              plan_tier: 'pro',
              stripe_subscription_status: 'active',
              stripe_subscription_current_period_end: '2026-04-30T00:00:00.000Z',
              stripe_subscription_id: 'sub_live_1',
              referral_bonus_ends_at: null,
              referral_credit_balance_months: 0,
            },
            error: null,
          }
        }
      }

      if (query.table === 'profiles' && query.action === 'upsert') {
        return { data: null, error: null }
      }

      if (query.table === 'referral_claims' && query.action === 'update') {
        return { data: { id: 'claim_1' }, error: null }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest('http://localhost/api/referrals/claim', {
      token: 'friendtoken12',
      source: 'test',
    }, {
      headers: bearerHeader(),
    })

    const res = await referralClaim(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.claimed, true)
    assert.equal(data.referredReward.applied, true)
    assert.equal(data.referredReward.planTier, 'pro')
    assert.equal(data.referrerReward.mode, 'pending_credit')
    assert.equal(data.referrerReward.creditMonths, 1)
  })
})

describe('GET /api/referrals/status', () => {
  test('returns referral metrics, share copy, and reward state', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key'
    process.env.NEXT_PUBLIC_APP_URL = 'https://snapquote.test'

    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'referral_tokens' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: { token: 'statusref1234' },
          error: null,
        }
      }

      if (query.table === 'profiles' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: {
            plan_tier: 'pro',
            stripe_subscription_status: null,
            stripe_subscription_current_period_end: null,
            stripe_subscription_id: null,
            stripe_customer_id: null,
            referral_trial_ends_at: null,
            referral_bonus_ends_at: '2099-01-31T00:00:00.000Z',
            referral_credit_balance_months: 2,
          },
          error: null,
        }
      }

      if (query.table === 'referral_events' && query.action === 'select' && query.mode === 'execute') {
        return {
          data: [
            { event_name: 'landing_visit' },
            { event_name: 'landing_visit' },
            { event_name: 'quote_share_click' },
            { event_name: 'signup_start' },
          ],
          error: null,
        }
      }

      if (query.table === 'referral_claims' && query.action === 'select' && query.mode === 'execute') {
        return {
          data: [
            {
              id: 'claim_1',
              created_at: '2026-03-20T10:00:00.000Z',
              referrer_reward_mode: 'pending_credit',
              referrer_reward_ends_at: null,
              referred_reward_ends_at: '2026-04-03T00:00:00.000Z',
            },
          ],
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = new Request('http://localhost/api/referrals/status', {
      method: 'GET',
      headers: bearerHeader(),
    })

    const res = await referralStatus(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.token, 'statusref1234')
    assert.equal(data.metrics.visits, 2)
    assert.equal(data.metrics.shareClicks, 1)
    assert.equal(data.metrics.signupStarts, 1)
    assert.equal(data.metrics.successfulClaims, 1)
    assert.equal(data.rewards.pendingCreditMonths, 2)
    assert.equal(data.rewards.activeReward.kind, 'referrer_bonus')
    assert.match(data.shareMessages.es, /cotizaciones/i)
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

import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { bearerHeader, jsonRequest } from '../helpers/http.mjs'
import { getTestState, resetTestState } from '../mocks/state.mjs'

import { POST as generateEstimate } from '../../app/api/generate/route.ts'
import { POST as transcribeAudio } from '../../app/api/transcribe/route.ts'
import { POST as sendEmail } from '../../app/api/send-email/route.ts'
import { POST as createPaymentLink } from '../../app/api/create-payment-link/route.ts'
import { GET as getBillingUsage } from '../../app/api/billing/usage/route.ts'

const RELEVANT_ENV_KEYS = [
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
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

describe('POST /api/generate', () => {
  test('returns paywall payload when usage quota is exhausted', async () => {
    const state = getTestState()
    state.usageQuota.enforceResult = {
      ok: false,
      error: 'Free plan limit reached',
      status: 402,
      context: null,
      used: 50,
      limit: 50,
    }

    const req = jsonRequest('http://localhost/api/generate', {
      notes: 'replace valve',
      images: [],
    }, {
      headers: bearerHeader(),
    })

    const res = await generateEstimate(req)
    const data = await res.json()

    assert.equal(res.status, 402)
    assert.equal(data.code, 'FREE_PLAN_LIMIT_REACHED')
    assert.equal(data.metric, 'generate')
  })

  test('rejects malformed image payloads before OpenAI call', async () => {
    const state = getTestState()

    const req = jsonRequest('http://localhost/api/generate', {
      notes: 'replace valve',
      images: ['x'.repeat(2_000_001)],
    }, {
      headers: bearerHeader(),
    })

    const res = await generateEstimate(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.equal(data.error, 'Invalid image payload')
    assert.equal(state.openai.chatCalls.length, 0)
  })

  test('normalizes generated items and records token usage', async () => {
    const state = getTestState()
    state.openai.chatCompletionsCreate = async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                { description: '   ', quantity: 1, unit_price: 200 },
                { description: 'Labor - faucet install', quantity: 2, unit_price: 75 },
              ],
              summary_note: 'Looks good',
            }),
          },
        },
      ],
      usage: {
        prompt_tokens: 123,
        completion_tokens: 45,
      },
    })

    const req = jsonRequest('http://localhost/api/generate', {
      notes: 'install faucet and test',
      images: [],
      userProfile: {
        country: 'Canada',
      },
    }, {
      headers: bearerHeader(),
    })

    const res = await generateEstimate(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.items.length, 1)
    assert.equal(data.items[0].total, 150)
    assert.deepEqual(data.warnings, [])
    assert.equal(state.usageQuota.recordCalls.length, 1)
    assert.equal(state.usageQuota.recordCalls[0].input.promptTokens, 123)
    assert.equal(state.usageQuota.recordCalls[0].input.completionTokens, 45)
  })
})

describe('POST /api/transcribe', () => {
  test('rejects missing file payloads', async () => {
    const req = new Request('http://localhost/api/transcribe', {
      method: 'POST',
      body: new FormData(),
      headers: bearerHeader(),
    })

    const res = await transcribeAudio(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.equal(data.error, 'No file provided')
  })

  test('rejects too-large audio files', async () => {
    const formData = new FormData()
    const largeBytes = new Uint8Array(20 * 1024 * 1024 + 10)
    formData.append('file', new File([largeBytes], 'large.wav', { type: 'audio/wav' }))

    const req = new Request('http://localhost/api/transcribe', {
      method: 'POST',
      body: formData,
      headers: bearerHeader(),
    })

    const res = await transcribeAudio(req)
    const data = await res.json()

    assert.equal(res.status, 413)
    assert.equal(data.error, 'Audio file too large')
  })

  test('post-processes whisper transcription and records usage', async () => {
    const state = getTestState()
    state.openai.audioTranscriptionsCreate = async () => ({
      text: 'to 2x4 and pee trap with g f c i plus for feet run',
    })

    const formData = new FormData()
    formData.append('file', new File([new Uint8Array([1, 2, 3])], 'clip.wav', { type: 'audio/wav' }))

    const req = new Request('http://localhost/api/transcribe', {
      method: 'POST',
      body: formData,
      headers: bearerHeader(),
    })

    const res = await transcribeAudio(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.match(data.text, /two 2x4/i)
    assert.match(data.text, /P-trap/)
    assert.match(data.text, /GFCI/)
    assert.match(data.text, /4 feet/)
    assert.equal(state.usageQuota.recordCalls.length, 1)
    assert.equal(state.usageQuota.recordCalls[0].metric, 'transcribe')
  })
})

describe('POST /api/send-email', () => {
  test('falls back to mailto when RESEND_API_KEY is missing (guest allowed)', async () => {
    const req = jsonRequest('http://localhost/api/send-email', {
      to: 'customer@example.com',
      subject: 'Estimate',
      message: 'Please review',
    })

    const res = await sendEmail(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.method, 'mailto')
    assert.match(data.mailtoUrl, /^mailto:/)
  })

  test('returns quota payload when send_email quota is exceeded without auth header', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    const state = getTestState()
    state.usageQuota.enforceResult = {
      ok: false,
      error: 'Free plan limit reached',
      status: 402,
      context: null,
      used: 40,
      limit: 40,
    }

    const req = jsonRequest('http://localhost/api/send-email', {
      to: 'customer@example.com',
      subject: 'Estimate',
      message: 'Please review',
    })

    const res = await sendEmail(req)
    const data = await res.json()

    assert.equal(res.status, 402)
    assert.equal(data.code, 'FREE_PLAN_LIMIT_REACHED')
    assert.equal(data.metric, 'send_email')
  })

  test('sends email through Resend with sanitized content and attachment', async () => {
    process.env.RESEND_API_KEY = 're_test_key'

    const state = getTestState()
    state.resend.send = async () => ({
      id: 'email_123',
      error: null,
    })

    const pdfContent = Buffer.from('fake-pdf-data').toString('base64')

    const req = jsonRequest('http://localhost/api/send-email', {
      to: 'customer@example.com',
      subject: 'Your estimate',
      message: '<script>alert(1)</script>',
      clientName: 'Alex',
      businessName: 'SnapQuote Pro',
      filename: 'estimate.pdf',
      pdfBase64: pdfContent,
      referralUrl: 'https://snapquote.app?ref=test',
    })

    const res = await sendEmail(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.success, true)
    assert.equal(state.resend.sendCalls.length, 1)
    assert.equal(state.usageQuota.recordCalls.length, 1)
    assert.equal(state.usageQuota.enforceCalls.length, 1)

    const sendPayload = state.resend.sendCalls[0]
    assert.equal(sendPayload.to[0], 'customer@example.com')
    assert.equal(sendPayload.attachments.length, 1)
    assert.ok(sendPayload.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  })
})

describe('POST /api/create-payment-link', () => {
  function setCreatePaymentLinkEnv() {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'
  }

  function mockConnectedStripeProfile(state, options = {}) {
    const {
      accountId = 'acct_connected_1',
      detailsSubmitted = true,
      chargesEnabled = true,
      payoutsEnabled = true,
    } = options

    state.supabase.queryResolver = async (query) => {
      if (query.table === 'profiles' && query.action === 'select' && query.mode === 'maybeSingle') {
        return {
          data: {
            stripe_account_id: accountId,
            stripe_details_submitted: detailsSubmitted,
            stripe_charges_enabled: chargesEnabled,
            stripe_payouts_enabled: payoutsEnabled,
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
  }

  test('rejects malformed amount payloads', async () => {
    setCreatePaymentLinkEnv()

    const req = jsonRequest('http://localhost/api/create-payment-link', {
      amount: -5,
      estimateNumber: 'EST-1',
    }, {
      headers: bearerHeader(),
    })

    const res = await createPaymentLink(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.equal(data.error, 'Invalid amount')
  })

  test('returns unauthorized when auth guard fails', async () => {
    const state = getTestState()
    state.routeAuth.result = {
      ok: false,
      response: new Response(
        JSON.stringify({ error: { message: 'Unauthorized', code: 401 } }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      ),
    }

    const req = jsonRequest('http://localhost/api/create-payment-link', { amount: 89.5 })

    const res = await createPaymentLink(req)
    const data = await res.json()

    assert.equal(res.status, 401)
    assert.equal(data.error.code, 401)
  })

  test('creates payment link with estimate metadata', async () => {
    setCreatePaymentLinkEnv()

    const state = getTestState()
    mockConnectedStripeProfile(state)
    state.stripe.paymentLinksCreate = async (payload) => ({
      id: 'plink_001',
      url: 'https://pay.stripe.com/test-link',
      payload,
    })
    state.stripe.accountRetrieve = async () => ({
      id: 'acct_connected_1',
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: true,
    })

    const req = jsonRequest('http://localhost/api/create-payment-link', {
      amount: 249.99,
      customerName: 'Jordan',
      estimateNumber: 'EST-249',
      estimateId: '11111111-1111-4111-8111-111111111111',
    }, {
      headers: bearerHeader(),
    })

    const res = await createPaymentLink(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.id, 'plink_001')
    assert.equal(data.url, 'https://pay.stripe.com/test-link')
    assert.equal(state.stripe.instances.length, 1)
    assert.equal(state.stripe.accountRetrieveCalls[0], 'acct_connected_1')
  })

  test('uses deterministic idempotency key by default', async () => {
    setCreatePaymentLinkEnv()

    const state = getTestState()
    mockConnectedStripeProfile(state, { accountId: 'acct_connected_2' })
    let capturedRequestOptions = null
    state.stripe.paymentLinksCreate = async (payload, requestOptions) => {
      capturedRequestOptions = requestOptions
      return {
        id: 'plink_002',
        url: 'https://pay.stripe.com/test-link-2',
        payload,
      }
    }
    state.stripe.accountRetrieve = async () => ({
      id: 'acct_connected_2',
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: true,
    })

    const req = jsonRequest('http://localhost/api/create-payment-link', {
      amount: 100,
      estimateNumber: 'EST-100',
      estimateId: '22222222-2222-4222-8222-222222222222',
    }, {
      headers: bearerHeader(),
    })

    const res = await createPaymentLink(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.id, 'plink_002')
    assert.ok(capturedRequestOptions)
    assert.equal(typeof capturedRequestOptions.idempotencyKey, 'string')
    assert.match(capturedRequestOptions.idempotencyKey, /^payment_link:[a-f0-9]{64}$/)
    assert.equal(capturedRequestOptions.stripeAccount, 'acct_connected_2')
  })

  test('uses client-provided idempotency key header when present', async () => {
    setCreatePaymentLinkEnv()

    const state = getTestState()
    mockConnectedStripeProfile(state, { accountId: 'acct_connected_3' })
    let capturedRequestOptions = null
    state.stripe.paymentLinksCreate = async (payload, requestOptions) => {
      capturedRequestOptions = requestOptions
      return {
        id: 'plink_003',
        url: 'https://pay.stripe.com/test-link-3',
        payload,
      }
    }
    state.stripe.accountRetrieve = async () => ({
      id: 'acct_connected_3',
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: true,
    })

    const req = jsonRequest('http://localhost/api/create-payment-link', {
      amount: 100,
      estimateNumber: 'EST-100',
      estimateId: '33333333-3333-4333-8333-333333333333',
    }, {
      headers: {
        ...bearerHeader(),
        'idempotency-key': 'client-key-001',
      },
    })

    const res = await createPaymentLink(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.id, 'plink_003')
    assert.ok(capturedRequestOptions)
    assert.equal(capturedRequestOptions.idempotencyKey, 'client-key-001')
    assert.equal(capturedRequestOptions.stripeAccount, 'acct_connected_3')
  })

  test('returns 403 when Stripe Connect is not linked', async () => {
    setCreatePaymentLinkEnv()

    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'profiles' && query.action === 'select' && query.mode === 'maybeSingle') {
        return { data: { stripe_account_id: null }, error: null }
      }
      return { data: null, error: null }
    }

    const req = jsonRequest('http://localhost/api/create-payment-link', {
      amount: 100,
    }, {
      headers: bearerHeader(),
    })

    const res = await createPaymentLink(req)
    const data = await res.json()

    assert.equal(res.status, 403)
    assert.equal(data.code, 'STRIPE_CONNECT_REQUIRED')
  })

  test('returns 403 when Stripe Connect onboarding is incomplete', async () => {
    setCreatePaymentLinkEnv()

    const state = getTestState()
    mockConnectedStripeProfile(state, { accountId: 'acct_connected_4' })
    state.stripe.accountRetrieve = async () => ({
      id: 'acct_connected_4',
      details_submitted: false,
      charges_enabled: false,
      payouts_enabled: false,
    })

    const req = jsonRequest('http://localhost/api/create-payment-link', {
      amount: 100,
    }, {
      headers: bearerHeader(),
    })

    const res = await createPaymentLink(req)
    const data = await res.json()

    assert.equal(res.status, 403)
    assert.equal(data.code, 'STRIPE_CONNECT_INCOMPLETE')
  })

  test('returns 401 for Stripe authentication errors', async () => {
    setCreatePaymentLinkEnv()

    const state = getTestState()
    mockConnectedStripeProfile(state, { accountId: 'acct_connected_5' })
    state.stripe.accountRetrieve = async () => ({
      id: 'acct_connected_5',
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: true,
    })
    state.stripe.paymentLinksCreate = async () => {
      const error = new Error('auth failed')
      error.type = 'StripeAuthenticationError'
      throw error
    }

    const req = jsonRequest('http://localhost/api/create-payment-link', {
      amount: 100,
    }, {
      headers: bearerHeader(),
    })

    const res = await createPaymentLink(req)
    const data = await res.json()

    assert.equal(res.status, 401)
    assert.match(data.error, /Invalid Stripe API key/)
  })
})

describe('GET /api/billing/usage', () => {
  test('returns throttling error when rate limit fails', async () => {
    const state = getTestState()
    state.rateLimit.result = {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 1000,
    }

    const req = new Request('http://localhost/api/billing/usage', {
      method: 'GET',
    })

    const res = await getBillingUsage(req)
    const data = await res.json()

    assert.equal(res.status, 429)
    assert.equal(data.error.code, 429)
  })

  test('returns usage snapshot payload', async () => {
    const state = getTestState()
    state.usageQuota.snapshotResult = {
      ok: true,
      data: {
        planTier: 'pro',
        periodStart: '2026-02-01',
        usage: { generate: 10, transcribe: 20, send_email: 5 },
        limits: { generate: 2000, transcribe: 4000, send_email: 1500 },
        remaining: { generate: 1990, transcribe: 3980, send_email: 1495 },
        usageRatePct: { generate: 0.5, transcribe: 0.5, send_email: 0.3 },
        openaiPromptTokens: 1000,
        openaiCompletionTokens: 600,
        estimatedCosts: { openai: 0.02, resend: 0.01, total: 0.03 },
      },
    }

    const req = new Request('http://localhost/api/billing/usage', {
      method: 'GET',
      headers: bearerHeader(),
    })

    const res = await getBillingUsage(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.planTier, 'pro')
    assert.equal(data.usage.generate, 10)
  })
})

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
  'GEMINI_API_KEY',
  'GEMINI_GENERATE_MODEL',
  'GENERATE_AI_PROVIDER',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
]

function clearRelevantEnv() {
  for (const key of RELEVANT_ENV_KEYS) {
    delete process.env[key]
  }
}

function setServiceEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role'
}

function mockPlanTier(state, planTier) {
  state.supabase.queryResolver = async (query) => {
    if (query.table === 'profiles' && query.action === 'select') {
      return { data: { plan_tier: planTier }, error: null }
    }

    return { data: null, error: null }
  }
}

beforeEach(() => {
  resetTestState()
  clearRelevantEnv()
})

describe('POST /api/generate', () => {
  test('blocks anonymous callers after the monthly trial quota is exhausted', async () => {
    const state = getTestState()
    state.usageQuota.enforceResult = {
      ok: true,
      context: null,
      isAnonymous: true,
    }
    state.rateLimit.result = (options) => {
      if (options.key === 'generate:anonymous:127.0.0.1') {
        return {
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + 60_000,
        }
      }

      return {
        allowed: true,
        remaining: 999,
        resetAt: Date.now() + 60_000,
      }
    }

    const req = jsonRequest('http://localhost/api/generate', {
      notes: 'replace valve',
      images: [],
    })

    const res = await generateEstimate(req)
    const data = await res.json()

    assert.equal(res.status, 402)
    assert.equal(data.code, 'FREE_PLAN_LIMIT_REACHED')
    assert.equal(data.metric, 'generate')
    assert.equal(data.limit, 3)
    assert.match(data.error, /sign in to continue/i)
    assert.equal(state.usageQuota.recordCalls.length, 0)
    assert.equal(
      state.rateLimit.calls.some((call) => call.key === 'generate:anonymous:127.0.0.1'),
      true
    )
  })

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

  test('rejects unexpected keys in the generate payload', async () => {
    const state = getTestState()

    const req = jsonRequest('http://localhost/api/generate', {
      notes: 'replace valve',
      images: [],
      injected: true,
    }, {
      headers: bearerHeader(),
    })

    const res = await generateEstimate(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.equal(data.error, 'Invalid request payload')
    assert.equal(state.openai.chatCalls.length, 0)
  })

  test('rejects unsupported source language hints', async () => {
    const state = getTestState()

    const req = jsonRequest('http://localhost/api/generate', {
      notes: 'replace valve',
      images: [],
      sourceLanguage: 'fr',
    }, {
      headers: bearerHeader(),
    })

    const res = await generateEstimate(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.equal(data.error, 'Invalid source language')
    assert.equal(state.openai.chatCalls.length, 0)
  })

  test('requires authentication for photo estimate workflow', async () => {
    const state = getTestState()
    state.routeAuth.result = {
      ok: false,
      response: new Response(
        JSON.stringify({ error: { message: 'Unauthorized', code: 401 } }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      ),
    }

    const req = jsonRequest('http://localhost/api/generate', {
      images: ['data:image/png;base64,AAAA'],
      workflow: 'photo_estimate',
    })

    const res = await generateEstimate(req)
    const data = await res.json()

    assert.equal(res.status, 401)
    assert.match(data.error, /log in required/i)
    assert.equal(state.openai.chatCalls.length, 0)
  })

  test('requires Pro or Team for photo estimate workflow', async () => {
    setServiceEnv()
    const state = getTestState()
    state.routeAuth.result = { ok: true, userId: 'user-free' }
    mockPlanTier(state, 'starter')

    const req = jsonRequest('http://localhost/api/generate', {
      images: ['data:image/png;base64,AAAA'],
      workflow: 'photo_estimate',
    }, {
      headers: bearerHeader(),
    })

    const res = await generateEstimate(req)
    const data = await res.json()

    assert.equal(res.status, 402)
    assert.match(data.error, /pro|team/i)
    assert.equal(state.openai.chatCalls.length, 0)
  })

  test('returns normalized photo analysis for Pro photo estimate workflow', async () => {
    setServiceEnv()
    const state = getTestState()
    state.routeAuth.result = { ok: true, userId: 'user-pro' }
    mockPlanTier(state, 'pro')
    state.openai.chatCompletionsCreate = async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                { description: 'Drywall replacement area', quantity: 24, unit: 'SF', unit_price: 4.25 },
              ],
              summary_note: 'Replace the damaged drywall section and repaint the repair area.',
              warnings: ['Wall cavity moisture still needs confirmation.'],
              photoAnalysis: {
                observations: ['Visible drywall staining below the window trim'],
                suggestedScope: ['Open the affected wall section and check insulation for moisture'],
                materialSuggestions: [
                  {
                    label: 'Mold-resistant drywall',
                    quantity: 24,
                    unit: 'SF',
                    reason: 'Repair area appears to be a small cut-and-patch section.',
                  },
                ],
                pricingConfidence: 'high',
              },
            }),
          },
        },
      ],
      usage: {
        prompt_tokens: 111,
        completion_tokens: 37,
      },
    })

    const req = jsonRequest('http://localhost/api/generate', {
      images: ['data:image/png;base64,AAAA'],
      notes: 'bathroom wall under window',
      workflow: 'photo_estimate',
      photoContext: 'Customer wants finish-ready repair.',
    }, {
      headers: bearerHeader(),
    })

    const res = await generateEstimate(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.items.length, 1)
    assert.equal(data.photoAnalysis.pricingConfidence, 'high')
    assert.equal(data.photoAnalysis.observations.length, 1)
    assert.equal(data.photoAnalysis.materialSuggestions[0].label, 'Mold-resistant drywall')
    assert.match(state.openai.chatCalls[0].messages[0].content, /PHOTO ESTIMATE MODE/)
    assert.match(state.openai.chatCalls[0].messages[0].content, /Customer wants finish-ready repair/)
  })

  test('uses Gemini provider when GEMINI_API_KEY is configured', async () => {
    const state = getTestState()
    process.env.GEMINI_API_KEY = 'gm_test_key'
    process.env.GENERATE_AI_PROVIDER = 'auto'

    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url, init) => {
      assert.match(String(url), /generativelanguage\.googleapis\.com/)
      assert.equal(init.method, 'POST')

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      items: [
                        { description: 'Pressure test and diagnostics', quantity: 1, unit_price: 95 },
                      ],
                      summary_note: 'Generated by Gemini',
                    }),
                  },
                ],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 77,
            candidatesTokenCount: 21,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }

    try {
      const req = jsonRequest('http://localhost/api/generate', {
        notes: 'diagnose low pressure',
        images: [],
      }, {
        headers: bearerHeader(),
      })

      const res = await generateEstimate(req)
      const data = await res.json()

      assert.equal(res.status, 200)
      assert.equal(data.items.length, 1)
      assert.equal(data.items[0].description, 'Pressure test and diagnostics')
      assert.equal(state.openai.chatCalls.length, 0)
      assert.equal(state.usageQuota.recordCalls.length, 1)
      assert.equal(state.usageQuota.recordCalls[0].input.promptTokens, 77)
      assert.equal(state.usageQuota.recordCalls[0].input.completionTokens, 21)
    } finally {
      globalThis.fetch = originalFetch
    }
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
              upsellOptions: [
                {
                  tier: 'premium',
                  title: 'Premium Protection Plan',
                  description: 'Includes premium shutoff valve and extended support.',
                  addedItems: [
                    {
                      description: 'Premium shutoff valve',
                      quantity: 1,
                      unit_price: 120,
                    },
                  ],
                },
                {
                  tier: 'best',
                  title: 'Should be removed',
                  addedItems: [
                    {
                      description: '   ',
                      quantity: 1,
                      unit_price: 400,
                    },
                  ],
                },
              ],
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
    assert.equal(data.upsellOptions.length, 1)
    assert.equal(data.upsellOptions[0].tier, 'better')
    assert.equal(data.upsellOptions[0].addedItems[0].description, 'Premium shutoff valve')
    assert.equal(data.upsellOptions[0].addedItems[0].total, 120)
    assert.deepEqual(data.warnings, [])
    assert.equal(state.usageQuota.recordCalls.length, 1)
    assert.equal(state.usageQuota.recordCalls[0].input.promptTokens, 123)
    assert.equal(state.usageQuota.recordCalls[0].input.completionTokens, 45)
  })

  test('adds multilingual source language guidance for Spanish beta input', async () => {
    const state = getTestState()
    state.openai.chatCompletionsCreate = async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                { description: 'Angle stop replacement', quantity: 1, unit_price: 125 },
              ],
              summary_note: 'English output from Spanish notes',
            }),
          },
        },
      ],
      usage: {
        prompt_tokens: 88,
        completion_tokens: 19,
      },
    })

    const req = jsonRequest('http://localhost/api/generate', {
      notes: 'Cambio la llave angular debajo del lavamanos y reviso la fuga del desague',
      images: [],
      sourceLanguage: 'es',
    }, {
      headers: bearerHeader(),
    })

    const res = await generateEstimate(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.summary_note, 'English output from Spanish notes')
    assert.equal(state.openai.chatCalls.length, 1)
    assert.match(state.openai.chatCalls[0].messages[0].content, /Source language hint: es/)
    assert.match(state.openai.chatCalls[0].messages[0].content, /Source notes are primarily Spanish/i)
    assert.match(state.openai.chatCalls[0].messages[0].content, /customer-facing output in English/i)
  })

  test('adds multilingual source language guidance for Korean beta input', async () => {
    const state = getTestState()
    state.openai.chatCompletionsCreate = async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                { description: 'Breaker inspection and receptacle reset', quantity: 1, unit_price: 180 },
              ],
              summary_note: 'English output from Korean notes',
              warnings: ['High-value estimate - please verify'],
            }),
          },
        },
      ],
      usage: {
        prompt_tokens: 91,
        completion_tokens: 22,
      },
    })

    const req = jsonRequest('http://localhost/api/generate', {
      notes: '차단기 점검하고 콘센트 교체, 누수 확인 필요',
      images: [],
      sourceLanguage: 'ko',
    }, {
      headers: bearerHeader(),
    })

    const res = await generateEstimate(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.summary_note, 'English output from Korean notes')
    assert.deepEqual(data.warnings, ['High-value estimate - please verify'])
    assert.equal(state.openai.chatCalls.length, 1)
    assert.match(state.openai.chatCalls[0].messages[0].content, /Source language hint: ko/)
    assert.match(state.openai.chatCalls[0].messages[0].content, /Source notes are primarily Korean/i)
    assert.match(state.openai.chatCalls[0].messages[0].content, /Common Korean field terms may include/i)
    assert.match(state.openai.chatCalls[0].messages[0].content, /customer-facing output in English/i)
  })

  test('uses mixed-language auto guidance and trims warning noise from generated output', async () => {
    const state = getTestState()
    state.openai.chatCompletionsCreate = async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                { description: 'Angle stop replacement', quantity: 1, unit_price: 0 },
              ],
              summary_note: 'Mixed-language notes normalized into English',
              warnings: ['  Price TBD for specialty part  ', '', 'High-value estimate - please verify'],
            }),
          },
        },
      ],
      usage: {
        prompt_tokens: 94,
        completion_tokens: 24,
      },
    })

    const req = jsonRequest('http://localhost/api/generate', {
      notes: 'Cambio la llave angular, 누수 체크하고 breaker reset',
      images: [],
      sourceLanguage: 'auto',
    }, {
      headers: bearerHeader(),
    })

    const res = await generateEstimate(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.summary_note, 'Mixed-language notes normalized into English')
    assert.deepEqual(data.warnings, [
      'Price TBD for specialty part',
      'High-value estimate - please verify',
    ])
    assert.equal(state.openai.chatCalls.length, 1)
    assert.match(state.openai.chatCalls[0].messages[0].content, /Source language hint: auto/)
    assert.match(state.openai.chatCalls[0].messages[0].content, /may mix English, Spanish, and Korean/i)
    assert.match(state.openai.chatCalls[0].messages[0].content, /Do NOT perform currency exchange calculations/i)
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

  test('passes Spanish language hints through to Whisper', async () => {
    const state = getTestState()
    state.openai.audioTranscriptionsCreate = async () => ({
      text: 'Cambio la llave angular y reviso el desague',
    })

    const formData = new FormData()
    formData.append('file', new File([new Uint8Array([1, 2, 3])], 'clip.wav', { type: 'audio/wav' }))
    formData.append('languageHint', 'es')

    const req = new Request('http://localhost/api/transcribe', {
      method: 'POST',
      body: formData,
      headers: bearerHeader(),
    })

    const res = await transcribeAudio(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.text, 'Cambio la llave angular y reviso el desague')
    assert.equal(state.openai.audioCalls.length, 1)
    assert.equal(state.openai.audioCalls[0].language, 'es')
    assert.match(state.openai.audioCalls[0].prompt, /llave angular/i)
    assert.match(state.openai.audioCalls[0].prompt, /desague/i)
  })

  test('passes Korean language hints through to Whisper with trade-specific prompt terms', async () => {
    const state = getTestState()
    state.openai.audioTranscriptionsCreate = async () => ({
      text: '배관 누수 확인하고 차단기 점검했습니다',
    })

    const formData = new FormData()
    formData.append('file', new File([new Uint8Array([1, 2, 3])], 'clip.wav', { type: 'audio/wav' }))
    formData.append('languageHint', 'ko')

    const req = new Request('http://localhost/api/transcribe', {
      method: 'POST',
      body: formData,
      headers: bearerHeader(),
    })

    const res = await transcribeAudio(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.text, '배관 누수 확인하고 차단기 점검했습니다')
    assert.equal(state.openai.audioCalls.length, 1)
    assert.equal(state.openai.audioCalls[0].language, 'ko')
    assert.match(state.openai.audioCalls[0].prompt, /누수/)
    assert.match(state.openai.audioCalls[0].prompt, /차단기/)
  })

  test('keeps language unset in auto mode while still using multilingual trade prompt coverage', async () => {
    const state = getTestState()
    state.openai.audioTranscriptionsCreate = async () => ({
      text: 'mixed field note',
    })

    const formData = new FormData()
    formData.append('file', new File([new Uint8Array([1, 2, 3])], 'clip.wav', { type: 'audio/wav' }))
    formData.append('languageHint', 'auto')

    const req = new Request('http://localhost/api/transcribe', {
      method: 'POST',
      body: formData,
      headers: bearerHeader(),
    })

    const res = await transcribeAudio(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.text, 'mixed field note')
    assert.equal(state.openai.audioCalls.length, 1)
    assert.equal('language' in state.openai.audioCalls[0], false)
    assert.match(state.openai.audioCalls[0].prompt, /llave angular/i)
    assert.match(state.openai.audioCalls[0].prompt, /누수/)
  })

  test('rejects unsupported language hints', async () => {
    const formData = new FormData()
    formData.append('file', new File([new Uint8Array([1, 2, 3])], 'clip.wav', { type: 'audio/wav' }))
    formData.append('languageHint', 'fr')

    const req = new Request('http://localhost/api/transcribe', {
      method: 'POST',
      body: formData,
      headers: bearerHeader(),
    })

    const res = await transcribeAudio(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.equal(data.error, 'Invalid language hint')
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
    state.usageQuota.enforceResult = {
      ok: true,
      context: {
        id: 'usage-context',
        planTier: 'free',
      },
    }
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
    assert.match(sendPayload.html, /Made with/i)
    assert.match(sendPayload.html, /Try it free/i)
    assert.match(sendPayload.html, /https:\/\/snapquote\.app\/\?ref=test|https:\/\/snapquote\.app\?ref=test/i)
    assert.match(sendPayload.html, /SnapQuote AI Estimator/i)
  })

  test('uses paid watermark treatment without free referral CTA for paid plans', async () => {
    process.env.RESEND_API_KEY = 're_test_key'

    const state = getTestState()
    state.usageQuota.enforceResult = {
      ok: true,
      context: {
        id: 'usage-context',
        planTier: 'pro',
      },
    }
    state.resend.send = async () => ({
      id: 'email_456',
      error: null,
    })

    const req = jsonRequest('http://localhost/api/send-email', {
      to: 'customer@example.com',
      subject: 'Your estimate',
      message: 'Attached is your estimate.',
      clientName: 'Alex',
      businessName: 'SnapQuote Pro',
      referralUrl: 'https://snapquote.app?ref=test',
    })

    const res = await sendEmail(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.success, true)
    assert.equal(state.resend.sendCalls.length, 1)

    const sendPayload = state.resend.sendCalls[0]
    assert.match(sendPayload.html, /Powered by/i)
    assert.doesNotMatch(sendPayload.html, /Try it free/i)
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
      estimate = null,
    } = options

    state.supabase.queryResolver = async (query) => {
      if (query.table === 'estimates' && query.action === 'select' && query.mode === 'maybeSingle') {
        if (!estimate) {
          return { data: null, error: null }
        }

        const idFilter = query.filters.find((filter) => filter.column === 'id')
        const numberFilter = query.filters.find((filter) => filter.column === 'estimate_number')
        const userFilter = query.filters.find((filter) => filter.column === 'user_id')

        const matchesId = !idFilter || idFilter.value === estimate.id
        const matchesNumber = !numberFilter || numberFilter.value === estimate.estimate_number
        const matchesUser = !userFilter || userFilter.value === estimate.user_id

        return matchesId && matchesNumber && matchesUser
          ? { data: estimate, error: null }
          : { data: null, error: null }
      }

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
    mockConnectedStripeProfile(state, {
      estimate: {
        id: '11111111-1111-4111-8111-111111111111',
        user_id: 'user-1',
        estimate_number: 'EST-249',
        status: 'sent',
      },
    })
    let capturedPayload = null
    state.stripe.paymentLinksCreate = async (payload) => {
      capturedPayload = payload
      return {
        id: 'plink_001',
        url: 'https://pay.stripe.com/test-link',
        payload,
      }
    }
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
    assert.equal(capturedPayload.metadata.userId, 'user-1')
    assert.equal(capturedPayload.metadata.estimateId, '11111111-1111-4111-8111-111111111111')
    assert.equal(capturedPayload.metadata.estimateNumber, 'EST-249')
  })

  test('uses deterministic idempotency key by default', async () => {
    setCreatePaymentLinkEnv()

    const state = getTestState()
    mockConnectedStripeProfile(state, {
      accountId: 'acct_connected_2',
      estimate: {
        id: '22222222-2222-4222-8222-222222222222',
        user_id: 'user-1',
        estimate_number: 'EST-100',
        status: 'sent',
      },
    })
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
    mockConnectedStripeProfile(state, {
      accountId: 'acct_connected_3',
      estimate: {
        id: '33333333-3333-4333-8333-333333333333',
        user_id: 'user-1',
        estimate_number: 'EST-100',
        status: 'sent',
      },
    })
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

  test('returns 404 when referenced estimate is not owned by caller tenant', async () => {
    setCreatePaymentLinkEnv()

    const state = getTestState()
    mockConnectedStripeProfile(state)

    const req = jsonRequest('http://localhost/api/create-payment-link', {
      amount: 100,
      estimateId: '44444444-4444-4444-8444-444444444444',
      estimateNumber: 'EST-404',
    }, {
      headers: bearerHeader(),
    })

    const res = await createPaymentLink(req)
    const data = await res.json()

    assert.equal(res.status, 404)
    assert.equal(data.error, 'Estimate not found.')
    assert.equal(state.stripe.accountRetrieveCalls.length, 0)
  })

  test('returns 400 when estimateId and estimateNumber do not refer to the same record', async () => {
    setCreatePaymentLinkEnv()

    const state = getTestState()
    mockConnectedStripeProfile(state, {
      estimate: {
        id: '55555555-5555-4555-8555-555555555555',
        user_id: 'user-1',
        estimate_number: 'EST-REAL',
        status: 'sent',
      },
    })

    const req = jsonRequest('http://localhost/api/create-payment-link', {
      amount: 100,
      estimateId: '55555555-5555-4555-8555-555555555555',
      estimateNumber: 'EST-WRONG',
    }, {
      headers: bearerHeader(),
    })

    const res = await createPaymentLink(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.equal(data.error, 'Estimate reference mismatch.')
    assert.equal(state.stripe.accountRetrieveCalls.length, 0)
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

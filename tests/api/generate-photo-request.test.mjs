import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { POST as generateEstimate } from '../../app/api/generate/route.ts'
import { bearerHeader, jsonRequest } from '../helpers/http.mjs'
import { getTestState, resetTestState } from '../mocks/state.mjs'

const RELEVANT_ENV_KEYS = [
  'GEMINI_API_KEY',
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

describe('POST /api/generate photo estimate request', () => {
  test('preserves photo estimate prompt context and image payload shape', async () => {
    setServiceEnv()
    const state = getTestState()
    process.env.GENERATE_AI_PROVIDER = 'openai'
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
              summary_note: 'Replace damaged drywall and repaint the repair area.',
              warnings: [],
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
    const imageUrl = 'data:image/png;base64,AAAA'

    const request = jsonRequest('http://localhost/api/generate', {
      images: [imageUrl],
      notes: 'bathroom wall under window',
      workflow: 'photo_estimate',
      photoContext: 'Customer wants finish-ready repair.',
    }, {
      headers: bearerHeader(),
    })

    const response = await generateEstimate(request)
    const data = await response.json()

    assert.equal(response.status, 200)
    assert.equal(data.photoAnalysis.pricingConfidence, 'high')
    assert.equal(data.photoAnalysis.materialSuggestions[0].label, 'Mold-resistant drywall')
    assert.equal(state.openai.chatCalls.length, 1)

    const openaiPayload = state.openai.chatCalls[0]
    assert.match(openaiPayload.messages[0].content, /PHOTO ESTIMATE MODE/)
    assert.match(openaiPayload.messages[0].content, /Customer wants finish-ready repair/)
    assert.match(openaiPayload.messages[0].content, /photoAnalysis/)
    assert.match(openaiPayload.messages[0].content, /pricingConfidence/)
    assert.match(openaiPayload.messages[0].content, /do not state it as fact/i)

    const userContent = openaiPayload.messages[1].content
    assert.equal(userContent[0].type, 'text')
    assert.match(userContent[0].text, /^Field Notes:\n/)
    assert.equal(userContent[1].type, 'image_url')
    assert.equal(userContent[1].image_url.url, imageUrl)
  })

  test('requires at least one photo for photo estimate mode', async () => {
    const state = getTestState()

    const request = jsonRequest('http://localhost/api/generate', {
      images: [],
      workflow: 'photo_estimate',
    }, {
      headers: bearerHeader(),
    })

    const response = await generateEstimate(request)
    const data = await response.json()

    assert.equal(response.status, 400)
    assert.match(data.error, /jobsite photo is required/i)
    assert.equal(state.openai.chatCalls.length, 0)
  })
})

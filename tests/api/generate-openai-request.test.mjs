import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { POST as generateEstimate } from '../../app/api/generate/route.ts'
import { bearerHeader, jsonRequest } from '../helpers/http.mjs'
import { getTestState, resetTestState } from '../mocks/state.mjs'

const RELEVANT_ENV_KEYS = [
  'GEMINI_API_KEY',
  'GENERATE_AI_PROVIDER',
  'OPENAI_GENERATE_MODEL',
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

describe('POST /api/generate OpenAI request', () => {
  test('preserves OpenAI prompt guidance and user content for Spanish field notes', async () => {
    const state = getTestState()
    process.env.GENERATE_AI_PROVIDER = 'openai'
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
        prompt_tokens: 42,
        completion_tokens: 15,
      },
    })

    const request = jsonRequest('http://localhost/api/generate', {
      notes: 'Cambio la llave angular debajo del lavamanos',
      images: [],
      sourceLanguage: 'es',
      userProfile: {
        country: 'Canada',
      },
    }, {
      headers: bearerHeader(),
    })

    const response = await generateEstimate(request)
    const data = await response.json()

    assert.equal(response.status, 200)
    assert.equal(data.summary_note, 'English output from Spanish notes')
    assert.equal(state.openai.chatCalls.length, 1)

    const openaiPayload = state.openai.chatCalls[0]
    assert.equal(openaiPayload.messages[0].role, 'system')
    assert.match(openaiPayload.messages[0].content, /Source language hint: es/)
    assert.match(openaiPayload.messages[0].content, /Source notes are primarily Spanish/)
    assert.match(openaiPayload.messages[0].content, /ASSUME ALL CURRENCY IS LOCAL/)
    assert.match(openaiPayload.messages[0].content, /customer-facing output in English/)

    assert.equal(openaiPayload.messages[1].role, 'user')
    assert.equal(Array.isArray(openaiPayload.messages[1].content), true)
    assert.equal(openaiPayload.messages[1].content[0].type, 'text')
    assert.match(openaiPayload.messages[1].content[0].text, /^Field Notes:\n/)
    assert.match(openaiPayload.messages[1].content[0].text, /Cambio la llave angular/)

    assert.equal(openaiPayload.response_format.type, 'json_object')
    assert.equal(openaiPayload.temperature, 0.3)
    assert.equal(openaiPayload.max_tokens, 1500)
  })
})

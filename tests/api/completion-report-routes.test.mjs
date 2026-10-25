import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { POST as completionReport } from '../../app/api/completion-report/route.ts'
import { sanitizeCompletionMatches } from '../../lib/job-completion.ts'
import { bearerHeader, jsonRequest } from '../helpers/http.mjs'
import { getTestState, resetTestState } from '../mocks/state.mjs'
import { NextResponse } from '../mocks/next-server.mjs'

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

function mockSupabase(state, { planTier, completionsThisMonth = 0 }) {
  state.supabase.queryResolver = async (query) => {
    if (query.table === 'profiles' && query.action === 'select') {
      return { data: { plan_tier: planTier }, error: null }
    }
    if (query.table === 'estimate_attachments' && query.action === 'select') {
      return { data: Array.from({ length: completionsThisMonth }, (_, i) => ({ id: `att-${i}` })), error: null }
    }
    return { data: null, error: null }
  }
}

function mockOpenAiMatches(state, content) {
  process.env.GENERATE_AI_PROVIDER = 'openai'
  state.openai.chatCompletionsCreate = async () => ({
    choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }],
    usage: { prompt_tokens: 50, completion_tokens: 20 },
  })
}

const validBody = () => ({
  items: [
    { itemId: 'item-1', description: 'Replace P-trap' },
    { itemId: 'item-2', description: 'Install new faucet' },
  ],
  photos: ['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB'],
})

const post = (body) =>
  completionReport(jsonRequest('http://localhost/api/completion-report', body, { headers: bearerHeader() }))

beforeEach(() => {
  resetTestState()
  clearRelevantEnv()
  setServiceEnv()
})

describe('sanitizeCompletionMatches', () => {
  test('drops unknown item ids and out-of-range photo indexes', () => {
    const result = sanitizeCompletionMatches(
      {
        summary: '  Replaced the trap and faucet.  ',
        items: [
          { itemId: 'item-1', photoIndexes: [0, 0, 5, -1, 1.5, 1], confidence: 'high' },
          { itemId: 'ghost', photoIndexes: [0], confidence: 'high' },
          { itemId: 'item-2', photoIndexes: [1], confidence: 'maybe' },
          { itemId: 'item-1', photoIndexes: [1], confidence: 'high' },
        ],
      },
      ['item-1', 'item-2'],
      2
    )

    assert.deepEqual(result, {
      summary: 'Replaced the trap and faucet.',
      items: [
        { itemId: 'item-1', photoIndexes: [0, 1], confidence: 'high' },
        { itemId: 'item-2', photoIndexes: [1], confidence: 'low' },
      ],
    })
  })

  test('returns empty result for malformed output', () => {
    for (const raw of [null, 'text', 42, [], { summary: 1, items: 'x' }]) {
      assert.deepEqual(sanitizeCompletionMatches(raw, ['item-1'], 1), { summary: '', items: [] })
    }
  })
})

describe('POST /api/completion-report', () => {
  test('rejects unauthenticated request with 401', async () => {
    const state = getTestState()
    state.routeAuth.result = {
      ok: false,
      response: NextResponse.json({ error: { message: 'Unauthorized', code: 401 } }, { status: 401 }),
    }

    const response = await post(validBody())

    assert.equal(response.status, 401)
    assert.equal(state.openai.chatCalls.length, 0)
  })

  test('rejects free user with 2 completions this month with 402', async () => {
    const state = getTestState()
    mockSupabase(state, { planTier: 'free', completionsThisMonth: 2 })
    mockOpenAiMatches(state, { summary: 'x', items: [] })

    const response = await post(validBody())
    const data = await response.json()

    assert.equal(response.status, 402)
    assert.equal(data.error, 'Free plan includes 2 completion reports per month.')
    assert.equal(state.openai.chatCalls.length, 0)
    assert.equal(state.usageQuota.recordCalls.length, 0)

    const countQuery = state.supabase.queryCalls.find((q) => q.table === 'estimate_attachments')
    assert.ok(countQuery.filters.some((f) => f.op === 'eq' && f.column === 'estimates.user_id' && f.value === 'user-1'))
    const monthFilter = countQuery.filters.find((f) => f.op === 'gte' && f.column === 'completion->>completedAt')
    assert.match(monthFilter.value, /^\d{4}-\d{2}-01T00:00:00\.000Z$/)
  })

  test('allows free user with 1 completion this month', async () => {
    const state = getTestState()
    mockSupabase(state, { planTier: 'free', completionsThisMonth: 1 })
    mockOpenAiMatches(state, { summary: 'Done.', items: [] })

    const response = await post(validBody())

    assert.equal(response.status, 200)
  })

  test('treats plan tier lookup failure as free', async () => {
    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === 'profiles') return { data: null, error: { message: 'boom' } }
      return { data: [{ id: 'a' }, { id: 'b' }], error: null }
    }
    mockOpenAiMatches(state, { summary: 'x', items: [] })

    const response = await post(validBody())

    assert.equal(response.status, 402)
  })

  test('allows starter user and returns sanitized matches', async () => {
    const state = getTestState()
    mockSupabase(state, { planTier: 'starter', completionsThisMonth: 9 })
    mockOpenAiMatches(state, {
      summary: 'Replaced the trap and installed a faucet.',
      items: [
        { itemId: 'item-1', photoIndexes: [0, 7], confidence: 'high' },
        { itemId: 'ghost', photoIndexes: [1], confidence: 'high' },
      ],
    })

    const response = await post({ ...validBody(), note: 'Customer was home' })
    const data = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(data, {
      ok: true,
      summary: 'Replaced the trap and installed a faucet.',
      items: [{ itemId: 'item-1', photoIndexes: [0], confidence: 'high' }],
    })
    assert.equal(state.usageQuota.enforceCalls[0].metric, 'generate')
    assert.equal(state.usageQuota.recordCalls.length, 1)
    assert.equal(state.usageQuota.recordCalls[0].input.promptTokens, 50)

    const userContent = state.openai.chatCalls[0].messages[1].content
    assert.match(userContent[0].text, /item-1/)
    assert.match(userContent[0].text, /Customer was home/)
    assert.equal(userContent.filter((part) => part.type === 'image_url').length, 2)
  })

  test('responds 502 and records no usage when the AI output cannot be parsed', async () => {
    const state = getTestState()
    mockSupabase(state, { planTier: 'pro' })
    mockOpenAiMatches(state, 'not json at all')

    const response = await post(validBody())
    const data = await response.json()

    assert.equal(response.status, 502)
    assert.deepEqual(data, { ok: false, error: 'AI matching failed' })
    assert.equal(state.usageQuota.recordCalls.length, 0)
  })

  test('rejects non-image data URL with 400', async () => {
    const state = getTestState()
    mockSupabase(state, { planTier: 'pro' })

    const response = await post({ ...validBody(), photos: ['https://example.test/a.jpg'] })

    assert.equal(response.status, 400)
    assert.equal(state.openai.chatCalls.length, 0)
  })
})

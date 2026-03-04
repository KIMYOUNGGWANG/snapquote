import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"
import { bearerHeader } from "../helpers/http.mjs"
import { getTestState, resetTestState } from "../mocks/state.mjs"

import { POST as parseReceipt } from "../../app/api/parse-receipt/route.ts"

const RELEVANT_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_RECEIPT_MODEL",
]

function clearRelevantEnv() {
  for (const key of RELEVANT_ENV_KEYS) {
    delete process.env[key]
  }
}

function setServiceEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role"
}

function mockPlanTier(state, planTier) {
  state.supabase.queryResolver = async (query) => {
    if (query.table === "profiles" && query.action === "select") {
      return { data: { plan_tier: planTier }, error: null }
    }
    return { data: null, error: null }
  }
}

function buildMultipartRequest(formData, headers = {}) {
  return new Request("http://localhost/api/parse-receipt", {
    method: "POST",
    body: formData,
    headers,
  })
}

beforeEach(() => {
  resetTestState()
  clearRelevantEnv()
})

describe("POST /api/parse-receipt", () => {
  test("returns 401 when auth guard fails", async () => {
    const state = getTestState()
    state.routeAuth.result = {
      ok: false,
      response: new Response(
        JSON.stringify({ error: { message: "Unauthorized", code: 401 } }),
        { status: 401, headers: { "content-type": "application/json" } }
      ),
    }

    const req = buildMultipartRequest(new FormData())
    const res = await parseReceipt(req)

    assert.equal(res.status, 401)
  })

  test("returns 402 when caller is not on Pro/Team tier", async () => {
    setServiceEnv()
    const state = getTestState()
    state.routeAuth.result = { ok: true, userId: "user-free" }
    mockPlanTier(state, "free")

    const req = buildMultipartRequest(new FormData(), bearerHeader())
    const res = await parseReceipt(req)
    const data = await res.json()

    assert.equal(res.status, 402)
    assert.match(data.error, /pro|team/i)
  })

  test("returns 400 when file is missing", async () => {
    setServiceEnv()
    const state = getTestState()
    state.routeAuth.result = { ok: true, userId: "user-pro" }
    mockPlanTier(state, "pro")

    const req = buildMultipartRequest(new FormData(), bearerHeader())
    const res = await parseReceipt(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.equal(data.error, "No file provided")
  })

  test("returns 400 for non-image file payload", async () => {
    setServiceEnv()
    const state = getTestState()
    state.routeAuth.result = { ok: true, userId: "user-pro" }
    mockPlanTier(state, "team")

    const formData = new FormData()
    formData.append("file", new File([Buffer.from("hello")], "note.txt", { type: "text/plain" }))

    const req = buildMultipartRequest(formData, bearerHeader())
    const res = await parseReceipt(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.equal(data.error, "Invalid file type")
  })

  test("returns 413 when image exceeds 10MB", async () => {
    setServiceEnv()
    const state = getTestState()
    state.routeAuth.result = { ok: true, userId: "user-pro" }
    mockPlanTier(state, "pro")

    const overLimit = new Uint8Array(10 * 1024 * 1024 + 1)
    const formData = new FormData()
    formData.append("file", new File([overLimit], "large.png", { type: "image/png" }))

    const req = buildMultipartRequest(formData, bearerHeader())
    const res = await parseReceipt(req)
    const data = await res.json()

    assert.equal(res.status, 413)
    assert.equal(data.error, "Image file too large")
  })

  test("returns 422 when parsed result has zero usable items", async () => {
    setServiceEnv()
    const state = getTestState()
    state.routeAuth.result = { ok: true, userId: "user-pro" }
    mockPlanTier(state, "pro")
    state.openai.chatCompletionsCreate = async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              vendorName: "Home Depot",
              subtotal: 120,
              tax: 12,
              total: 132,
              items: [],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    })

    const formData = new FormData()
    formData.append("file", new File([new Uint8Array([1, 2, 3])], "receipt.png", { type: "image/png" }))

    const req = buildMultipartRequest(formData, bearerHeader())
    const res = await parseReceipt(req)
    const data = await res.json()

    assert.equal(res.status, 422)
    assert.equal(data.error, "No parsable line items found")
  })

  test("returns 200 and normalizes parsed receipt payload", async () => {
    setServiceEnv()
    const state = getTestState()
    state.routeAuth.result = { ok: true, userId: "user-pro" }
    mockPlanTier(state, "team")
    state.openai.chatCompletionsCreate = async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              vendorName: "  Home Depot  ",
              date: "2026-03-04",
              subtotal: "120.50",
              tax: "not-a-number",
              items: [
                {
                  description: "   ",
                  quantity: 1,
                  unit_price: 5,
                  total: 5,
                },
                {
                  description: "2x4 Stud",
                  quantity: "2",
                  unit_price: "4.5",
                  confidence_score: 0.72,
                  original_text: "2x4 stud x2",
                },
                {
                  id: "item-custom-3",
                  description: "Copper Elbow",
                  quantity: 0,
                  unit_price: -3,
                  total: -10,
                  confidence_score: 1.4,
                },
              ],
              warnings: [" blurry image ", "blurry image", ""],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    })

    const formData = new FormData()
    formData.append("file", new File([new Uint8Array([3, 4, 5])], "receipt.png", { type: "image/png" }))
    formData.append("context", "Bathroom repair materials")

    const req = buildMultipartRequest(formData, bearerHeader())
    const res = await parseReceipt(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.vendorName, "Home Depot")
    assert.equal(data.date, "2026-03-04")
    assert.equal(data.subtotal, 120.5)
    assert.equal(data.tax, 0)
    assert.equal(data.total, 120.5)

    assert.equal(data.items.length, 2)
    assert.equal(data.items[0].description, "2x4 Stud")
    assert.equal(data.items[0].quantity, 2)
    assert.equal(data.items[0].unit_price, 4.5)
    assert.equal(data.items[0].total, 9)
    assert.equal(data.items[0].confidence_score, 0.72)
    assert.equal(data.items[0].original_text, "2x4 stud x2")

    assert.equal(data.items[1].id, "item-custom-3")
    assert.equal(data.items[1].description, "Copper Elbow")
    assert.equal(data.items[1].quantity, 1)
    assert.equal(data.items[1].unit_price, 0)
    assert.equal(data.items[1].total, 0)
    assert.equal(data.items[1].confidence_score, 1)

    assert.ok(Array.isArray(data.warnings))
    assert.ok(data.warnings.includes("blurry image"))
    assert.ok(data.warnings.some((warning) => /Low confidence parse/i.test(warning)))
    assert.equal(state.openai.chatCalls.length, 1)
  })

  test("returns 429 when rate limit blocks request", async () => {
    const state = getTestState()
    state.routeAuth.result = { ok: true, userId: "user-pro" }
    state.rateLimit.result = {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    }

    const req = buildMultipartRequest(new FormData(), bearerHeader())
    const res = await parseReceipt(req)
    const data = await res.json()

    assert.equal(res.status, 429)
    assert.match(data.error, /too many requests/i)
  })
})

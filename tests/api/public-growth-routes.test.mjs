import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"
import { getTestState, resetTestState } from "../mocks/state.mjs"

import { POST as publicParseReceipt } from "../../app/api/public/parse-receipt/route.ts"
import { POST as captureLead } from "../../app/api/public/capture-lead/route.ts"

const RELEVANT_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
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

function buildMultipartRequest(url, formData) {
  return new Request(url, {
    method: "POST",
    body: formData,
  })
}

beforeEach(() => {
  resetTestState()
  clearRelevantEnv()
})

describe("POST /api/public/parse-receipt", () => {
  test("returns 429 when the daily teaser limit is reached", async () => {
    const state = getTestState()
    state.rateLimit.result = {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    }

    const formData = new FormData()
    formData.append("file", new File([new Uint8Array([1, 2, 3])], "receipt.png", { type: "image/png" }))

    const req = buildMultipartRequest("http://localhost/api/public/parse-receipt", formData)
    const res = await publicParseReceipt(req)
    const data = await res.json()

    assert.equal(res.status, 429)
    assert.match(data.error, /daily limit/i)
  })

  test("returns totals-only teaser response with remaining scans", async () => {
    const state = getTestState()
    state.rateLimit.result = {
      allowed: true,
      remaining: 1,
      resetAt: Date.now() + 60_000,
    }
    state.openai.chatCompletionsCreate = async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              subtotal: 48.5,
              tax: 6.3,
              total: 54.8,
              itemCount: 4,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    })

    const formData = new FormData()
    formData.append("file", new File([new Uint8Array([7, 8, 9])], "receipt.png", { type: "image/png" }))

    const req = buildMultipartRequest("http://localhost/api/public/parse-receipt", formData)
    const res = await publicParseReceipt(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.subtotal, 48.5)
    assert.equal(data.tax, 6.3)
    assert.equal(data.total, 54.8)
    assert.equal(data.itemCount, 4)
    assert.equal(data.remaining, 1)
  })
})

describe("POST /api/public/capture-lead", () => {
  test("returns 400 for invalid email payloads", async () => {
    setServiceEnv()

    const req = new Request("http://localhost/api/public/capture-lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    })

    const res = await captureLead(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.match(data.error, /valid email/i)
  })

  test("upserts the lead email and source for teaser conversion tracking", async () => {
    setServiceEnv()
    const state = getTestState()

    const req = new Request("http://localhost/api/public/capture-lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "owner@example.com",
        source: "public_receipt_teaser",
      }),
    })

    const res = await captureLead(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.match(data.message, /inbox/i)

    const upsertCall = state.supabase.queryCalls.find(
      (call) => call.table === "leads" && call.action === "upsert"
    )
    assert.ok(upsertCall)
    assert.equal(upsertCall.payload.email, "owner@example.com")
    assert.equal(upsertCall.payload.source, "public_receipt_teaser")
    assert.equal(upsertCall.upsertOptions.onConflict, "email")
  })
})

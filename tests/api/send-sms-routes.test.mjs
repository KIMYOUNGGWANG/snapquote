import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"
import { bearerHeader, jsonRequest } from "../helpers/http.mjs"
import { getTestState, resetTestState } from "../mocks/state.mjs"

import { POST as sendSmsPost } from "../../app/api/send-sms/route.ts"

const RELEVANT_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
]

function clearRelevantEnv() {
  for (const key of RELEVANT_ENV_KEYS) {
    delete process.env[key]
  }
}

function setSmsEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role"
  process.env.TWILIO_ACCOUNT_SID = "AC123456789"
  process.env.TWILIO_AUTH_TOKEN = "twilio_secret"
  process.env.TWILIO_FROM_NUMBER = "+15550001111"
}

beforeEach(() => {
  resetTestState()
  clearRelevantEnv()
})

describe("POST /api/send-sms", () => {
  test("returns unauthorized when auth guard fails", async () => {
    setSmsEnv()
    const state = getTestState()
    state.routeAuth.result = {
      ok: false,
      response: new Response(
        JSON.stringify({ error: { message: "Unauthorized", code: 401 } }),
        { status: 401, headers: { "content-type": "application/json" } }
      ),
    }

    const req = jsonRequest("http://localhost/api/send-sms", {
      toPhoneNumber: "+14165550123",
      message: "Quote follow-up",
      estimateId: "estimate-1",
    })

    const res = await sendSmsPost(req)
    assert.equal(res.status, 401)
  })

  test("returns 400 for invalid payload", async () => {
    setSmsEnv()

    const req = jsonRequest("http://localhost/api/send-sms", {
      toPhoneNumber: "4165550123",
      message: "Quote follow-up",
      estimateId: "estimate-1",
    }, {
      headers: bearerHeader(),
    })

    const res = await sendSmsPost(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.match(data.error, /invalid/i)
  })

  test("returns 402 when SMS credits are insufficient", async () => {
    setSmsEnv()
    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === "sms_credit_ledger" && query.action === "select") {
        return { data: [{ delta_credits: 0 }], error: null }
      }
      return { data: null, error: null }
    }

    const req = jsonRequest("http://localhost/api/send-sms", {
      toPhoneNumber: "+14165550123",
      message: "Quote follow-up",
      estimateId: "estimate-1",
    }, {
      headers: bearerHeader(),
    })

    const res = await sendSmsPost(req)
    const data = await res.json()

    assert.equal(res.status, 402)
    assert.match(data.error, /insufficient sms credits/i)
  })

  test("returns 429 when rate limit blocks request", async () => {
    setSmsEnv()
    const state = getTestState()
    state.rateLimit.result = {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 1000,
    }

    const req = jsonRequest("http://localhost/api/send-sms", {
      toPhoneNumber: "+14165550123",
      message: "Quote follow-up",
      estimateId: "estimate-1",
    }, {
      headers: bearerHeader(),
    })

    const res = await sendSmsPost(req)
    assert.equal(res.status, 429)
  })

  test("sends SMS and decrements credits on success", async () => {
    setSmsEnv()
    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === "sms_credit_ledger" && query.action === "select") {
        return { data: [{ delta_credits: 3 }], error: null }
      }

      if (query.table === "sms_messages" && query.action === "insert") {
        return { data: [{ id: "sms-message-row" }], error: null }
      }

      if (query.table === "sms_credit_ledger" && query.action === "insert") {
        return { data: [{ id: "sms-ledger-row" }], error: null }
      }

      return { data: null, error: null }
    }

    const originalFetch = globalThis.fetch
    const fetchCalls = []
    globalThis.fetch = async (url, init) => {
      fetchCalls.push({ url: String(url), init })
      return new Response(
        JSON.stringify({
          sid: "SM123456789",
          status: "queued",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    try {
      const req = jsonRequest("http://localhost/api/send-sms", {
        toPhoneNumber: "+14165550123",
        message: "Your estimate is ready for review.",
        estimateId: "estimate-1",
      }, {
        headers: bearerHeader(),
      })

      const res = await sendSmsPost(req)
      const data = await res.json()

      assert.equal(res.status, 200)
      assert.equal(data.ok, true)
      assert.equal(data.messageId, "SM123456789")
      assert.equal(data.creditsRemaining, 2)
      assert.equal(fetchCalls.length, 1)

      const ledgerInsert = state.supabase.queryCalls.find(
        (call) => call.table === "sms_credit_ledger" && call.action === "insert"
      )
      assert.ok(ledgerInsert)
      assert.equal(ledgerInsert.payload.delta_credits, -1)
      assert.equal(ledgerInsert.payload.reason, "send_sms")
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

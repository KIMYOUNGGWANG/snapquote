import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"
import { bearerHeader, jsonRequest } from "../helpers/http.mjs"
import { getTestState, resetTestState } from "../mocks/state.mjs"

import { POST as recoveryPost } from "../../app/api/quotes/recovery/trigger/route.ts"

const RELEVANT_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "RESEND_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "GEMINI_API_KEY",
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

function staleSentAt() {
  return new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString()
}

beforeEach(() => {
  resetTestState()
  clearRelevantEnv()
})

describe("POST /api/quotes/recovery/trigger", () => {
  test("returns unauthorized when bearer/cron auth is missing", async () => {
    setServiceEnv()
    const state = getTestState()
    state.routeAuth.result = {
      ok: false,
      response: new Response(
        JSON.stringify({ error: { message: "Unauthorized", code: 401 } }),
        { status: 401, headers: { "content-type": "application/json" } }
      ),
    }

    const req = jsonRequest("http://localhost/api/quotes/recovery/trigger", {})
    const res = await recoveryPost(req)

    assert.equal(res.status, 401)
  })

  test("returns 402 when caller is not on Pro/Team tier", async () => {
    setServiceEnv()
    const state = getTestState()
    state.routeAuth.result = {
      ok: true,
      userId: "user-free",
    }
    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select") {
        return {
          data: { plan_tier: "free" },
          error: null,
        }
      }
      return { data: null, error: null }
    }

    const req = jsonRequest(
      "http://localhost/api/quotes/recovery/trigger",
      {},
      { headers: bearerHeader("token-free") }
    )

    const res = await recoveryPost(req)
    const data = await res.json()

    assert.equal(res.status, 402)
    assert.match(data.error, /pro|team/i)
  })

  test("supports dryRun and returns planned follow-up actions", async () => {
    setServiceEnv()
    const state = getTestState()
    state.routeAuth.result = {
      ok: true,
      userId: "user-pro",
    }
    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select") {
        return { data: { plan_tier: "pro" }, error: null }
      }

      if (query.table === "estimates" && query.action === "select") {
        return {
          data: [
            {
              id: "estimate-1",
              user_id: "user-pro",
              estimate_number: "SQ-1001",
              total_amount: 4500,
              sent_at: staleSentAt(),
              created_at: staleSentAt(),
              first_followup_queued_at: null,
              first_followed_up_at: null,
              last_followed_up_at: null,
              clients: { name: "Alex", email: "alex@example.com" },
              profiles: { business_name: "SnapQuote Plumbing" },
            },
          ],
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest(
      "http://localhost/api/quotes/recovery/trigger",
      { dryRun: true },
      { headers: bearerHeader("token-pro") }
    )

    const res = await recoveryPost(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.processedCount, 1)
    assert.equal(data.results[0].estimateId, "estimate-1")
    assert.equal(data.results[0].estimateNumber, "SQ-1001")
    assert.equal(data.results[0].action, "sent_email")
    assert.equal(typeof data.results[0].messagePreview, "string")
    assert.equal(state.resend.sendCalls.length, 0)
  })

  test("sends follow-up email when email contact exists", async () => {
    setServiceEnv()
    process.env.RESEND_API_KEY = "resend_test_key"

    const state = getTestState()
    state.routeAuth.result = {
      ok: true,
      userId: "user-pro",
    }

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select") {
        return { data: { plan_tier: "pro" }, error: null }
      }

      if (query.table === "estimates" && query.action === "select") {
        return {
          data: [
            {
              id: "estimate-2",
              user_id: "user-pro",
              estimate_number: "SQ-1002",
              total_amount: 3200,
              sent_at: staleSentAt(),
              created_at: staleSentAt(),
              first_followup_queued_at: null,
              first_followed_up_at: null,
              last_followed_up_at: null,
              clients: { name: "Kim", email: "kim@example.com" },
              profiles: { business_name: "SnapQuote HVAC" },
            },
          ],
          error: null,
        }
      }

      if (query.table === "estimates" && query.action === "update" && query.mode === "maybeSingle") {
        return { data: { id: "estimate-2" }, error: null }
      }

      if (query.table === "estimates" && query.action === "update") {
        return { data: [{ id: "estimate-2" }], error: null }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest(
      "http://localhost/api/quotes/recovery/trigger",
      {},
      { headers: bearerHeader("token-pro") }
    )

    const res = await recoveryPost(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.processedCount, 1)
    assert.equal(data.results[0].action, "sent_email")
    assert.equal(state.resend.sendCalls.length, 1)
    assert.match(state.resend.sendCalls[0].subject, /SQ-1002/)
  })

  test("sends follow-up SMS and deducts one credit when phone exists", async () => {
    setServiceEnv()
    process.env.TWILIO_ACCOUNT_SID = "AC123456789"
    process.env.TWILIO_AUTH_TOKEN = "twilio_secret"
    process.env.TWILIO_FROM_NUMBER = "+15550001111"

    const state = getTestState()
    state.routeAuth.result = {
      ok: true,
      userId: "user-team",
    }

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select") {
        return { data: { plan_tier: "team" }, error: null }
      }

      if (query.table === "estimates" && query.action === "select") {
        return {
          data: [
            {
              id: "estimate-3",
              user_id: "user-team",
              estimate_number: "SQ-1003",
              total_amount: 5100,
              sent_at: staleSentAt(),
              created_at: staleSentAt(),
              first_followup_queued_at: null,
              first_followed_up_at: null,
              last_followed_up_at: null,
              clients: { name: "Taylor", phone: "+14165550123" },
              profiles: { business_name: "SnapQuote Electric" },
            },
          ],
          error: null,
        }
      }

      if (query.table === "sms_credit_ledger" && query.action === "select") {
        return {
          data: [{ delta_credits: 2 }],
          error: null,
        }
      }

      if (query.table === "estimates" && query.action === "update" && query.mode === "maybeSingle") {
        return { data: { id: "estimate-3" }, error: null }
      }

      if (query.table === "sms_messages" && query.action === "insert") {
        return { data: [{ id: "sms-row-1" }], error: null }
      }

      if (query.table === "sms_credit_ledger" && query.action === "insert") {
        return { data: [{ id: "ledger-row-1" }], error: null }
      }

      if (query.table === "estimates" && query.action === "update") {
        return { data: [{ id: "estimate-3" }], error: null }
      }

      return { data: null, error: null }
    }

    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          sid: "SM_RECOVERY_1",
          status: "queued",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )

    try {
      const req = jsonRequest(
        "http://localhost/api/quotes/recovery/trigger",
        {},
        { headers: bearerHeader("token-team") }
      )

      const res = await recoveryPost(req)
      const data = await res.json()

      assert.equal(res.status, 200)
      assert.equal(data.ok, true)
      assert.equal(data.processedCount, 1)
      assert.equal(data.results[0].action, "sent_sms")

      const ledgerInsert = state.supabase.queryCalls.find(
        (call) => call.table === "sms_credit_ledger" && call.action === "insert"
      )
      assert.ok(ledgerInsert)
      assert.equal(ledgerInsert.payload.delta_credits, -1)
      assert.equal(ledgerInsert.payload.reason, "quote_recovery_sms")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("returns skipped_no_contact when client has no reachable channel", async () => {
    setServiceEnv()
    const state = getTestState()
    state.routeAuth.result = {
      ok: true,
      userId: "user-pro",
    }
    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select") {
        return { data: { plan_tier: "pro" }, error: null }
      }

      if (query.table === "estimates" && query.action === "select") {
        return {
          data: [
            {
              id: "estimate-4",
              user_id: "user-pro",
              estimate_number: "SQ-1004",
              total_amount: 700,
              sent_at: staleSentAt(),
              created_at: staleSentAt(),
              first_followup_queued_at: null,
              first_followed_up_at: null,
              last_followed_up_at: null,
              clients: { name: "Jordan" },
              profiles: { business_name: "SnapQuote Co" },
            },
          ],
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest(
      "http://localhost/api/quotes/recovery/trigger",
      {},
      { headers: bearerHeader("token-pro") }
    )

    const res = await recoveryPost(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.processedCount, 1)
    assert.equal(data.results[0].action, "skipped_no_contact")
  })

  test("accepts CRON_SECRET auth without bearer token", async () => {
    setServiceEnv()
    process.env.CRON_SECRET = "cron_secret_123"
    const state = getTestState()
    state.routeAuth.result = {
      ok: false,
      response: new Response(
        JSON.stringify({ error: { message: "Unauthorized", code: 401 } }),
        { status: 401, headers: { "content-type": "application/json" } }
      ),
    }
    state.supabase.queryResolver = async (query) => {
      if (query.table === "estimates" && query.action === "select") {
        return {
          data: [
            {
              id: "estimate-5",
              user_id: "user-ops",
              estimate_number: "SQ-1005",
              total_amount: 999,
              sent_at: staleSentAt(),
              created_at: staleSentAt(),
              first_followup_queued_at: null,
              first_followed_up_at: null,
              last_followed_up_at: null,
              clients: { name: "No Contact" },
              profiles: { business_name: "Ops Team" },
            },
          ],
          error: null,
        }
      }
      return { data: null, error: null }
    }

    const req = jsonRequest(
      "http://localhost/api/quotes/recovery/trigger",
      { dryRun: true },
      { headers: { "x-cron-secret": "cron_secret_123" } }
    )

    const res = await recoveryPost(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.processedCount, 1)
    assert.equal(state.routeAuth.calls.length, 0)
  })

  test("returns 429 when rate limit blocks request", async () => {
    setServiceEnv()
    const state = getTestState()
    state.rateLimit.result = {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 1000,
    }

    const req = jsonRequest(
      "http://localhost/api/quotes/recovery/trigger",
      {},
      { headers: bearerHeader("token-any") }
    )

    const res = await recoveryPost(req)
    assert.equal(res.status, 429)
  })
})

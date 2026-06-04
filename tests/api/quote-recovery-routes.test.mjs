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

  test("returns 400 for malformed JSON before candidate lookup", async () => {
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

      return { data: null, error: null }
    }

    const req = new Request("http://localhost/api/quotes/recovery/trigger", {
      method: "POST",
      headers: {
        ...bearerHeader("token-pro"),
        "content-type": "application/json",
      },
      body: "{not-json",
    })

    const res = await recoveryPost(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.equal(data.error, "Invalid JSON body")
    assert.equal(
      state.supabase.queryCalls.some((call) => call.table === "estimates" && call.action === "select"),
      false
    )
  })

  test("returns 400 for invalid estimateId payload before candidate lookup", async () => {
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

      return { data: null, error: null }
    }

    const req = jsonRequest(
      "http://localhost/api/quotes/recovery/trigger",
      { estimateId: "../estimate-1" },
      { headers: bearerHeader("token-pro") }
    )

    const res = await recoveryPost(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.equal(data.error, "Invalid recovery payload")
    assert.equal(
      state.supabase.queryCalls.some((call) => call.table === "estimates" && call.action === "select"),
      false
    )
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

      if (query.table === "estimate_share_links" && query.action === "select") {
        return {
          data: [
            {
              user_id: "user-pro",
              estimate_id: "estimate-1",
              status: "viewed",
              share_url: "https://snapquote.test/q/review-1001",
              customer_note: null,
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
    assert.equal(data.actionableCount, 1)
    assert.equal(data.skippedCount, 0)
    assert.equal(data.results[0].estimateId, "estimate-1")
    assert.equal(data.results[0].estimateNumber, "SQ-1001")
    assert.equal(data.results[0].action, "sent_email")
    assert.equal(data.results[0].customerPortalStatus, "viewed")
    assert.equal(typeof data.results[0].messagePreview, "string")
    assert.match(data.results[0].messagePreview, /approve it or request changes/i)
    assert.match(data.results[0].messagePreview, /snapquote\.test\/q\/review-1001/)
    assert.equal(state.resend.sendCalls.length, 0)

    const candidateQuery = state.supabase.queryCalls.find((call) => (
      call.table === "estimates" &&
      call.action === "select" &&
      typeof call.selectColumns === "string" &&
      call.selectColumns.includes("first_followup_queued_at")
    ))
    assert.ok(candidateQuery)
    assert.deepEqual(
      candidateQuery.filters
        .filter((filter) => filter.op === "is" && [
          "first_followup_queued_at",
          "first_followed_up_at",
          "last_followed_up_at",
        ].includes(filter.column))
        .map((filter) => [filter.column, filter.value]),
      [
        ["first_followup_queued_at", null],
        ["first_followed_up_at", null],
        ["last_followed_up_at", null],
      ]
    )
  })

  test("skips paid sent quotes before automated recovery dispatch", async () => {
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
              id: "estimate-paid-stale-sent",
              user_id: "user-pro",
              estimate_number: "SQ-PAID-STALE",
              total_amount: 1250,
              sent_at: staleSentAt(),
              created_at: staleSentAt(),
              first_followup_queued_at: null,
              first_followed_up_at: null,
              last_followed_up_at: null,
              payment_completed_at: "2026-05-29T12:00:00.000Z",
              clients: { name: "Paid Client", email: "paid@example.com" },
              profiles: { business_name: "SnapQuote Plumbing" },
            },
          ],
          error: null,
        }
      }

      if (query.table === "estimate_share_links" && query.action === "select") {
        return {
          data: [
            {
              user_id: "user-pro",
              estimate_id: "estimate-paid-stale-sent",
              status: "viewed",
              share_url: "https://snapquote.test/q/paid-stale-sent",
              customer_note: null,
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
    assert.equal(data.actionableCount, 0)
    assert.equal(data.skippedCount, 1)
    assert.equal(data.results[0].estimateId, "estimate-paid-stale-sent")
    assert.equal(data.results[0].action, "skipped_customer_paid")
    assert.equal(data.results[0].customerPortalStatus, "viewed")
    assert.match(data.results[0].messagePreview, /already marked paid/i)
    assert.equal(state.resend.sendCalls.length, 0)
  })

  test("skips quotes with completed customer portal decisions", async () => {
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
              id: "estimate-approved",
              user_id: "user-pro",
              estimate_number: "SQ-APPROVED",
              total_amount: 900,
              sent_at: staleSentAt(),
              created_at: staleSentAt(),
              first_followup_queued_at: null,
              first_followed_up_at: null,
              last_followed_up_at: null,
              clients: { name: "Approved Client", email: "approved@example.com" },
              profiles: { business_name: "SnapQuote Plumbing" },
            },
            {
              id: "estimate-change-request",
              user_id: "user-pro",
              estimate_number: "SQ-CHANGE",
              total_amount: 1200,
              sent_at: staleSentAt(),
              created_at: staleSentAt(),
              first_followup_queued_at: null,
              first_followed_up_at: null,
              last_followed_up_at: null,
              clients: { name: "Change Client", email: "change@example.com" },
              profiles: { business_name: "SnapQuote Plumbing" },
            },
          ],
          error: null,
        }
      }

      if (query.table === "estimate_share_links" && query.action === "select") {
        return {
          data: [
            {
              user_id: "user-pro",
              estimate_id: "estimate-approved",
              status: "approved",
              share_url: "https://snapquote.test/q/approved-token",
              customer_note: null,
            },
            {
              user_id: "user-pro",
              estimate_id: "estimate-change-request",
              status: "change_requested",
              share_url: "https://snapquote.test/q/change-token",
              customer_note: "Please add disposal.",
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
    assert.equal(data.processedCount, 2)
    assert.equal(data.actionableCount, 0)
    assert.equal(data.skippedCount, 2)
    assert.equal(data.results[0].estimateId, "estimate-approved")
    assert.equal(data.results[0].action, "skipped_customer_approved")
    assert.equal(data.results[0].customerPortalStatus, "approved")
    assert.match(data.results[0].messagePreview, /already approved/i)
    assert.equal(data.results[1].estimateId, "estimate-change-request")
    assert.equal(data.results[1].action, "skipped_customer_change_requested")
    assert.equal(data.results[1].customerPortalStatus, "change_requested")
    assert.match(data.results[1].messagePreview, /Please add disposal/)
    assert.equal(state.resend.sendCalls.length, 0)
  })

  test("skips quotes that need scope review before recovery follow-up", async () => {
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
              id: "estimate-thin-scope",
              user_id: "user-pro",
              estimate_number: "SQ-THIN",
              total_amount: 850,
              sent_at: staleSentAt(),
              created_at: staleSentAt(),
              first_followup_queued_at: null,
              first_followed_up_at: null,
              last_followed_up_at: null,
              clients: { name: "Thin Scope Client", email: "thin@example.com" },
              profiles: { business_name: "SnapQuote Plumbing" },
              estimate_attachments: [
                {
                  photos: [],
                  original_transcript: "Fix sink",
                },
              ],
            },
          ],
          error: null,
        }
      }

      if (query.table === "estimate_share_links" && query.action === "select") {
        return {
          data: [
            {
              user_id: "user-pro",
              estimate_id: "estimate-thin-scope",
              status: "viewed",
              share_url: "https://snapquote.test/q/thin-scope",
              customer_note: null,
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
    assert.equal(data.actionableCount, 0)
    assert.equal(data.skippedCount, 1)
    assert.equal(data.results[0].estimateId, "estimate-thin-scope")
    assert.equal(data.results[0].action, "skipped_scope_review_needed")
    assert.equal(data.results[0].customerPortalStatus, "viewed")
    assert.match(data.results[0].messagePreview, /scope notes/i)
    assert.match(data.results[0].messagePreview, /confirm the scope/i)
    assert.equal(state.resend.sendCalls.length, 0)
    assert.equal(
      state.supabase.queryCalls.some((call) => call.table === "estimates" && call.action === "update"),
      false
    )

    const candidateQuery = state.supabase.queryCalls.find((call) => (
      call.table === "estimates" &&
      call.action === "select" &&
      typeof call.selectColumns === "string"
    ))
    assert.match(candidateQuery.selectColumns, /estimate_attachments\(photos, original_transcript, scope_assumptions_confirmed_at\)/)
  })

  test("does not skip cloud-confirmed thin scope quotes", async () => {
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
              id: "estimate-confirmed-thin-scope",
              user_id: "user-pro",
              estimate_number: "SQ-CONFIRMED-THIN",
              total_amount: 850,
              sent_at: staleSentAt(),
              created_at: staleSentAt(),
              first_followup_queued_at: null,
              first_followed_up_at: null,
              last_followed_up_at: null,
              clients: { name: "Confirmed Scope Client", email: "confirmed@example.com" },
              profiles: { business_name: "SnapQuote Plumbing" },
              estimate_attachments: [
                {
                  photos: [],
                  original_transcript: "Fix sink",
                  scope_assumptions_confirmed_at: "2026-05-24T09:45:00.000Z",
                },
              ],
            },
          ],
          error: null,
        }
      }

      if (query.table === "estimate_share_links" && query.action === "select") {
        return {
          data: [
            {
              user_id: "user-pro",
              estimate_id: "estimate-confirmed-thin-scope",
              status: "viewed",
              share_url: "https://snapquote.test/q/confirmed-thin-scope",
              customer_note: null,
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
    assert.equal(data.actionableCount, 1)
    assert.equal(data.skippedCount, 0)
    assert.equal(data.results[0].estimateId, "estimate-confirmed-thin-scope")
    assert.equal(data.results[0].action, "sent_email")
    assert.equal(data.results[0].customerPortalStatus, "viewed")
    assert.match(data.results[0].messagePreview, /confirmed-thin-scope/)
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

      if (query.table === "estimate_share_links" && query.action === "select") {
        return {
          data: [
            {
              user_id: "user-pro",
              estimate_id: "estimate-2",
              status: "shared",
              share_url: "https://snapquote.test/q/review-1002",
              customer_note: null,
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
    assert.equal(data.actionableCount, 1)
    assert.equal(data.skippedCount, 0)
    assert.equal(data.results[0].action, "sent_email")
    assert.equal(state.resend.sendCalls.length, 1)
    assert.match(state.resend.sendCalls[0].subject, /SQ-1002/)
    assert.match(state.resend.sendCalls[0].html, /review link is ready/i)
    assert.match(state.resend.sendCalls[0].html, /snapquote\.test\/q\/review-1002/)

    const claimUpdate = state.supabase.queryCalls.find(
      (call) => call.table === "estimates" && call.action === "update" && call.mode === "maybeSingle"
    )
    assert.ok(claimUpdate)
    assert.equal(typeof claimUpdate.payload.first_followup_queued_at, "string")

    const sentUpdate = state.supabase.queryCalls.find(
      (call) =>
        call.table === "estimates" &&
        call.action === "update" &&
        call.mode === "execute" &&
        typeof call.payload.first_followed_up_at === "string"
    )
    assert.ok(sentUpdate)
    assert.equal(sentUpdate.payload.first_followed_up_at, sentUpdate.payload.last_followed_up_at)

    const releaseUpdate = state.supabase.queryCalls.find(
      (call) =>
        call.table === "estimates" &&
        call.action === "update" &&
        call.payload.first_followup_queued_at === null
    )
    assert.equal(releaseUpdate, undefined)
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
    assert.equal(data.actionableCount, 1)
    assert.equal(data.skippedCount, 0)
    assert.equal(data.results[0].action, "sent_sms")

      const ledgerInsert = state.supabase.queryCalls.find(
        (call) => call.table === "sms_credit_ledger" && call.action === "insert"
      )
      assert.ok(ledgerInsert)
      assert.equal(ledgerInsert.payload.delta_credits, -1)
      assert.equal(ledgerInsert.payload.reason, "quote_recovery_sms")

      const claimUpdate = state.supabase.queryCalls.find(
        (call) => call.table === "estimates" && call.action === "update" && call.mode === "maybeSingle"
      )
      assert.ok(claimUpdate)
      assert.equal(typeof claimUpdate.payload.first_followup_queued_at, "string")

      const sentUpdate = state.supabase.queryCalls.find(
        (call) =>
          call.table === "estimates" &&
          call.action === "update" &&
          call.mode === "execute" &&
          typeof call.payload.first_followed_up_at === "string"
      )
      assert.ok(sentUpdate)
      assert.equal(sentUpdate.payload.first_followed_up_at, sentUpdate.payload.last_followed_up_at)

      const releaseUpdate = state.supabase.queryCalls.find(
        (call) =>
          call.table === "estimates" &&
          call.action === "update" &&
          call.payload.first_followup_queued_at === null
      )
      assert.equal(releaseUpdate, undefined)
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
    assert.equal(data.actionableCount, 0)
    assert.equal(data.skippedCount, 1)
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

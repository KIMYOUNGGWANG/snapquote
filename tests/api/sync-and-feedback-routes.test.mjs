import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"
import { bearerHeader, jsonRequest } from "../helpers/http.mjs"
import { getTestState, resetTestState } from "../mocks/state.mjs"

import { POST as feedbackPost } from "../../app/api/feedback/route.ts"
import { GET as feedbackReportGet } from "../../app/api/feedback/report/route.ts"

const RELEVANT_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
]

function clearRelevantEnv() {
  for (const key of RELEVANT_ENV_KEYS) {
    delete process.env[key]
  }
}

function setSupabaseServiceEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role"
}

beforeEach(() => {
  resetTestState()
  clearRelevantEnv()
})

describe("POST /api/feedback", () => {
  test("returns 400 for invalid payload", async () => {
    setSupabaseServiceEnv()

    const req = jsonRequest("http://localhost/api/feedback", {
      type: "invalid",
      message: "hello",
    })

    const res = await feedbackPost(req)
    const data = await res.json()
    assert.equal(res.status, 400)
    assert.match(data.error, /invalid/i)
  })

  test("stores guest feedback with null user_id", async () => {
    setSupabaseServiceEnv()
    const state = getTestState()

    const req = jsonRequest("http://localhost/api/feedback", {
      type: "feature",
      message: "Please add quick copy for line items.",
      metadata: { source: "floating_widget" },
    })

    const res = await feedbackPost(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.id, "feedback-id")

    const insertCall = state.supabase.queryCalls.find(
      (call) => call.table === "feedback" && call.action === "insert"
    )
    assert.ok(insertCall)
    assert.equal(insertCall.payload.user_id, null)
    assert.equal(insertCall.payload.category, "feature")
    assert.equal(insertCall.payload.description, "Please add quick copy for line items.")
    assert.equal(insertCall.payload.metadata.source, "floating_widget")
  })

  test("stores authenticated feedback with user_id", async () => {
    setSupabaseServiceEnv()
    const state = getTestState()
    state.supabase.user = {
      id: "user-feedback-1",
      email: "owner@example.com",
    }

    const req = jsonRequest("http://localhost/api/feedback", {
      type: "bug",
      message: "Save button becomes disabled unexpectedly.",
    }, {
      headers: bearerHeader("token-abc"),
    })

    const res = await feedbackPost(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)

    const insertCall = state.supabase.queryCalls.find(
      (call) => call.table === "feedback" && call.action === "insert"
    )
    assert.ok(insertCall)
    assert.equal(insertCall.payload.user_id, "user-feedback-1")
  })

  test("returns 429 when rate limit blocks request", async () => {
    setSupabaseServiceEnv()
    const state = getTestState()
    state.rateLimit.result = {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 1000,
    }

    const req = jsonRequest("http://localhost/api/feedback", {
      type: "general",
      message: "Great app.",
    })

    const res = await feedbackPost(req)
    assert.equal(res.status, 429)
  })
})

describe("GET /api/feedback/report", () => {
  test("returns 401 when cron auth is missing", async () => {
    setSupabaseServiceEnv()
    process.env.CRON_SECRET = "cron_secret"

    const req = new Request("http://localhost/api/feedback/report")
    const res = await feedbackReportGet(req)

    assert.equal(res.status, 401)
  })

  test("returns a weekly triage summary for authorized cron requests", async () => {
    setSupabaseServiceEnv()
    process.env.CRON_SECRET = "cron_secret"
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "feedback" && query.action === "select") {
        return {
          data: [
            {
              id: "fb-1",
              user_id: "user-1",
              category: "bug",
              description: "Send button freezes after retry.",
              metadata: { path: "/new-estimate", rating: 2 },
              created_at: "2026-03-18T10:00:00.000Z",
            },
            {
              id: "fb-2",
              user_id: "user-2",
              category: "feature",
              description: "Need a reusable materials library.",
              metadata: { path: "/profile", rating: 5 },
              created_at: "2026-03-18T09:00:00.000Z",
            },
            {
              id: "fb-3",
              user_id: null,
              category: "bug",
              description: "SMS modal should keep the typed number.",
              metadata: { path: "/history" },
              created_at: "2026-03-17T15:30:00.000Z",
            },
          ],
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = new Request(
      "http://localhost/api/feedback/report?lookbackDays=7&limit=25",
      { headers: { authorization: "Bearer cron_secret" } }
    )

    const res = await feedbackReportGet(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.lookbackDays, 7)
    assert.equal(data.counts.total, 3)
    assert.equal(data.counts.bug, 2)
    assert.equal(data.counts.feature, 1)
    assert.equal(data.counts.general, 0)
    assert.equal(data.topPaths[0].path, "/history")
    assert.equal(data.latest[0].id, "fb-1")

    const selectCall = state.supabase.queryCalls.find(
      (call) => call.table === "feedback" && call.action === "select"
    )
    assert.ok(selectCall)
    assert.equal(selectCall.limitValue, 25)
    assert.equal(
      selectCall.filters.some((filter) => filter.op === "gte" && filter.column === "created_at"),
      true
    )
  })
})

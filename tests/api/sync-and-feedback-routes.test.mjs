import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"
import { bearerHeader, jsonRequest } from "../helpers/http.mjs"
import { getTestState, resetTestState } from "../mocks/state.mjs"

import { POST as feedbackPost } from "../../app/api/feedback/route.ts"

const RELEVANT_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
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

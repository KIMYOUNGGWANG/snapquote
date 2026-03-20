import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"

import { jsonRequest } from "../helpers/http.mjs"
import { getTestState, resetTestState } from "../mocks/state.mjs"

import { POST as triggerLifecycle } from "../../app/api/onboarding/lifecycle/trigger/route.ts"
import {
  buildLifecycleActivitySummary,
  resolveLifecycleStageForAgeHours,
  shouldSkipLifecycleStage,
} from "../../lib/server/onboarding-lifecycle.ts"

const RELEVANT_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "RESEND_API_KEY",
  "NEXT_PUBLIC_APP_URL",
]

function clearRelevantEnv() {
  for (const key of RELEVANT_ENV_KEYS) {
    delete process.env[key]
  }
}

function setServiceEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role"
  process.env.CRON_SECRET = "cron_secret"
  process.env.NEXT_PUBLIC_APP_URL = "https://app.snapquote.test"
}

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

beforeEach(() => {
  resetTestState()
  clearRelevantEnv()
})

describe("onboarding lifecycle helpers", () => {
  test("resolves the correct lifecycle stage window", () => {
    assert.equal(resolveLifecycleStageForAgeHours(6), "day_0")
    assert.equal(resolveLifecycleStageForAgeHours(80), "day_3")
    assert.equal(resolveLifecycleStageForAgeHours(172), "day_7")
    assert.equal(resolveLifecycleStageForAgeHours(40), null)
  })

  test("marks later stages as activated once a quote has been sent", () => {
    const activity = buildLifecycleActivitySummary([
      { event_name: "draft_saved" },
      { event_name: "quote_sent" },
    ])

    assert.equal(shouldSkipLifecycleStage("day_0", activity), false)
    assert.equal(shouldSkipLifecycleStage("day_3", activity), true)
    assert.equal(shouldSkipLifecycleStage("day_7", activity), true)
  })
})

describe("POST /api/onboarding/lifecycle/trigger", () => {
  test("returns unauthorized when cron auth is missing", async () => {
    setServiceEnv()

    const req = jsonRequest("http://localhost/api/onboarding/lifecycle/trigger", {})
    const res = await triggerLifecycle(req)

    assert.equal(res.status, 401)
  })

  test("supports dryRun and previews a day 0 send", async () => {
    setServiceEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select") {
        return {
          data: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              email: "owner@example.com",
              business_name: "Rivera Plumbing",
              created_at: isoHoursAgo(8),
            },
          ],
          error: null,
        }
      }

      if (query.table === "onboarding_lifecycle_sends" && query.action === "select") {
        return { data: [], error: null }
      }

      if (query.table === "analytics_events" && query.action === "select") {
        return { data: [], error: null }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest(
      "http://localhost/api/onboarding/lifecycle/trigger",
      { dryRun: true },
      { headers: { authorization: "Bearer cron_secret" } },
    )

    const res = await triggerLifecycle(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.dryRun, true)
    assert.equal(data.processedCount, 1)
    assert.equal(data.results[0].stage, "day_0")
    assert.equal(data.results[0].action, "would_send")
    assert.match(data.results[0].subject, /welcome/i)
    assert.equal(state.resend.sendCalls.length, 0)
  })

  test("skips candidates already sent for the same stage", async () => {
    setServiceEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select") {
        return {
          data: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              email: "owner2@example.com",
              business_name: "Kim Electric",
              created_at: isoHoursAgo(78),
            },
          ],
          error: null,
        }
      }

      if (query.table === "onboarding_lifecycle_sends" && query.action === "select") {
        return {
          data: [
            {
              user_id: "22222222-2222-4222-8222-222222222222",
              stage: "day_3",
            },
          ],
          error: null,
        }
      }

      if (query.table === "analytics_events" && query.action === "select") {
        return { data: [], error: null }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest(
      "http://localhost/api/onboarding/lifecycle/trigger",
      { dryRun: true, stage: "day_3" },
      { headers: { "x-cron-secret": "cron_secret" } },
    )

    const res = await triggerLifecycle(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.processedCount, 0)
    assert.equal(data.results[0].action, "skipped_already_sent")
  })

  test("skips later lifecycle emails for already activated users", async () => {
    setServiceEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select") {
        return {
          data: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              email: "owner3@example.com",
              business_name: "Lopez HVAC",
              created_at: isoHoursAgo(170),
            },
          ],
          error: null,
        }
      }

      if (query.table === "onboarding_lifecycle_sends" && query.action === "select") {
        return { data: [], error: null }
      }

      if (query.table === "analytics_events" && query.action === "select") {
        return {
          data: [
            {
              user_id: "33333333-3333-4333-8333-333333333333",
              event_name: "quote_sent",
            },
          ],
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest(
      "http://localhost/api/onboarding/lifecycle/trigger",
      { dryRun: true, stage: "day_7" },
      { headers: { authorization: "Bearer cron_secret" } },
    )

    const res = await triggerLifecycle(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.processedCount, 0)
    assert.equal(data.results[0].action, "skipped_already_activated")
  })

  test("sends the lifecycle email and records the send log", async () => {
    setServiceEnv()
    process.env.RESEND_API_KEY = "resend_test_key"
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select") {
        return {
          data: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              email: "owner4@example.com",
              business_name: "North Star Roofing",
              created_at: isoHoursAgo(80),
            },
          ],
          error: null,
        }
      }

      if (query.table === "onboarding_lifecycle_sends" && query.action === "select") {
        return { data: [], error: null }
      }

      if (query.table === "analytics_events" && query.action === "select") {
        return {
          data: [
            {
              user_id: "44444444-4444-4444-8444-444444444444",
              event_name: "draft_saved",
            },
          ],
          error: null,
        }
      }

      if (query.table === "onboarding_lifecycle_sends" && query.action === "insert" && query.mode === "single") {
        return { data: { id: "send-row-1" }, error: null }
      }

      if (query.table === "onboarding_lifecycle_sends" && query.action === "update") {
        return { data: [{ id: "send-row-1" }], error: null }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest(
      "http://localhost/api/onboarding/lifecycle/trigger",
      { stage: "day_3" },
      { headers: { authorization: "Bearer cron_secret" } },
    )

    const res = await triggerLifecycle(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.processedCount, 1)
    assert.equal(data.results[0].action, "sent")
    assert.equal(state.resend.sendCalls.length, 1)
    assert.match(state.resend.sendCalls[0].subject, /first/i)
    assert.equal(
      state.supabase.queryCalls.some((call) =>
        call.table === "onboarding_lifecycle_sends"
        && call.action === "insert"
        && call.mode === "single"),
      true,
    )
  })
})

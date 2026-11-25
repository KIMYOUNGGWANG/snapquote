import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"
import { bearerHeader } from "../helpers/http.mjs"
import { getTestState, resetTestState } from "../mocks/state.mjs"

// Relative import on purpose: tests/loader.mjs swaps "@/lib/server/usage-quota" for a mock everywhere else.
import { enforceUsageQuota, getUsageSnapshot, recordUsage } from "../../lib/server/usage-quota.ts"
import { FREE_PLAN_GENERATE_LIMIT } from "../../lib/free-tier.ts"

const USER_ID = "user-1"

function usageRow(overrides = {}) {
  return {
    id: "usage-row-1",
    user_id: USER_ID,
    period_start: "2026-11-01",
    plan_tier: "free",
    generate_count: 0,
    transcribe_count: 0,
    send_email_count: 0,
    openai_prompt_tokens: 0,
    openai_completion_tokens: 0,
    openai_estimated_cost: 0,
    resend_estimated_cost: 0,
    updated_at: "2026-11-21T00:00:00Z",
    ...overrides,
  }
}

function setServiceEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role"
}

function mockDb(state, { profile = { plan_tier: "free" }, row = usageRow() } = {}) {
  state.supabase.queryResolver = async (query) => {
    if (query.table === "profiles" && query.action === "select") return { data: profile, error: null }
    if (query.table === "usage_counters_monthly" && query.action === "select") return { data: row, error: null }
    if (query.table === "usage_counters_monthly" && query.action === "update") {
      return { data: { ...row, ...query.payload }, error: null }
    }
    return { data: null, error: null }
  }
}

function request(headers = bearerHeader()) {
  return new Request("http://localhost/api/generate", { method: "POST", headers })
}

beforeEach(() => {
  resetTestState()
  setServiceEnv()
})

describe("usage quota (real module)", () => {
  test("verified users are counted with the service role, pinned to their own id", async () => {
    const state = getTestState()
    mockDb(state)

    const result = await enforceUsageQuota(request(), "generate")
    assert.equal(result.ok, true)
    await recordUsage(result.context, "generate", { promptTokens: 1000, completionTokens: 100 })

    const dbQueries = state.supabase.queryCalls
    assert.ok(dbQueries.length > 0)
    for (const query of dbQueries) {
      assert.equal(query.client, "service", `${query.table} ${query.action} must use the service role`)
    }

    const profileQueries = dbQueries.filter((query) => query.table === "profiles")
    assert.ok(profileQueries.every((query) => query.action === "upsert"
      ? query.payload.id === USER_ID
      : query.filters.some((filter) => filter.column === "id" && filter.value === USER_ID)))

    const usageSelect = dbQueries.find((query) => query.table === "usage_counters_monthly" && query.action === "select")
    assert.ok(usageSelect.filters.some((filter) => filter.column === "user_id" && filter.value === USER_ID))

    const update = dbQueries.find((query) => query.table === "usage_counters_monthly" && query.action === "update")
    assert.ok(update.filters.some((filter) => filter.column === "id" && filter.value === "usage-row-1"))
    assert.ok(update.filters.some((filter) => filter.column === "user_id" && filter.value === USER_ID))
    assert.equal(update.payload.generate_count, 1)
    assert.equal(update.payload.openai_prompt_tokens, 1000)
    assert.equal(update.payload.openai_estimated_cost, 0.0065)
  })

  test("a new month's row is created for the verified user only", async () => {
    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select") return { data: { plan_tier: "free" }, error: null }
      if (query.table === "usage_counters_monthly" && query.action === "select") return { data: null, error: null }
      if (query.table === "usage_counters_monthly" && query.action === "insert") return { data: usageRow(query.payload), error: null }
      return { data: null, error: null }
    }

    const result = await enforceUsageQuota(request(), "transcribe")

    assert.equal(result.ok, true)
    const insert = state.supabase.queryCalls.find((query) => query.table === "usage_counters_monthly" && query.action === "insert")
    assert.equal(insert.client, "service")
    assert.equal(insert.payload.user_id, USER_ID)
  })

  test("recordUsage rounds units up and adds them to the counter", async () => {
    const state = getTestState()
    mockDb(state, { row: usageRow({ transcribe_count: 3 }) })

    const result = await enforceUsageQuota(request(), "transcribe")
    await recordUsage(result.context, "transcribe", { units: 2.2 })

    const update = state.supabase.queryCalls.find((query) => query.table === "usage_counters_monthly" && query.action === "update")
    assert.equal(update.payload.transcribe_count, 6)
  })

  test("a verified user without the service role fails closed instead of skipping the quota", async () => {
    const state = getTestState()
    mockDb(state)
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    for (const options of [{}, { requireAuth: false }, { requireAuth: true }]) {
      const result = await enforceUsageQuota(request(), "transcribe", options)
      assert.equal(result.ok, false, JSON.stringify(options))
      assert.equal(result.status, 500)
      assert.notEqual(result.isAnonymous, true)
    }
    assert.equal(state.supabase.queryCalls.length, 0)
  })

  test("a counter read error fails closed for a signed-in user", async () => {
    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select") return { data: { plan_tier: "free" }, error: null }
      if (query.table === "usage_counters_monthly") return { data: null, error: { message: "connection reset" } }
      return { data: null, error: null }
    }

    const result = await enforceUsageQuota(request(), "transcribe", { requireAuth: false })

    assert.equal(result.ok, false)
    assert.equal(result.status, 500)
  })

  test("no token or a bad token never creates a service-role client", async () => {
    const state = getTestState()
    mockDb(state)

    const anonymous = await enforceUsageQuota(request({}), "generate")
    assert.deepEqual({ ok: anonymous.ok, isAnonymous: anonymous.isAnonymous }, { ok: true, isAnonymous: true })

    state.supabase.userError = { message: "invalid JWT" }
    const badToken = await enforceUsageQuota(request(), "generate", { requireAuth: true })
    assert.equal(badToken.status, 401)

    assert.equal(state.supabase.createClientCalls.length, 0)
    assert.equal(state.supabase.queryCalls.length, 0)
  })

  test("free users at the limit are blocked and the limit milestone is recorded for them", async () => {
    const state = getTestState()
    mockDb(state, { row: usageRow({ generate_count: FREE_PLAN_GENERATE_LIMIT }) })

    const result = await enforceUsageQuota(request(), "generate")

    assert.equal(result.ok, false)
    assert.equal(result.status, 402)
    const milestone = state.supabase.queryCalls.find((query) => query.table === "analytics_events")
    assert.equal(milestone.client, "service")
    assert.equal(milestone.payload.user_id, USER_ID)
    assert.equal(milestone.payload.event_name, "free_quota_limit_hit")
    assert.equal(milestone.payload.external_id, `quota:${USER_ID}:${result.context.periodStart}:generate:limit`)
  })

  test("paid users are not blocked and emit no free-quota milestones", async () => {
    const state = getTestState()
    mockDb(state, {
      profile: { plan_tier: "pro", stripe_subscription_status: "active" },
      row: usageRow({ plan_tier: "pro", generate_count: FREE_PLAN_GENERATE_LIMIT }),
    })

    const result = await enforceUsageQuota(request(), "generate")

    assert.equal(result.ok, true)
    assert.equal(result.planTier, "pro")
    assert.equal(state.supabase.queryCalls.some((query) => query.table === "analytics_events"), false)
  })

  test("the usage snapshot reads through the service role", async () => {
    const state = getTestState()
    mockDb(state, { row: usageRow({ generate_count: 2 }) })

    const snapshot = await getUsageSnapshot(request())

    assert.equal(snapshot.ok, true)
    assert.equal(snapshot.data.usage.generate, 2)
    assert.ok(state.supabase.queryCalls.every((query) => query.client === "service"))
  })
})

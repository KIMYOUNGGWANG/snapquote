import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"

import { bearerHeader, jsonRequest } from "../helpers/http.mjs"
import { getTestState, resetTestState } from "../mocks/state.mjs"

import { POST as walkthroughPost } from "../../app/api/estimates/[estimateId]/walkthrough/route.ts"
import { POST as opsWalkthroughPost } from "../../app/api/ops/walkthrough/route.ts"
import { buildWalkthroughScope, pickWalkthroughPhotos } from "../../lib/walkthrough-client.ts"

const USER_ID = "11111111-1111-4111-8111-111111111111"
const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
const params = (estimateId = "estimate_1") => ({ params: Promise.resolve({ estimateId }) })

function setEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role"
  process.env.RESEND_API_KEY = "re_test"
  process.env.WALKTHROUGH_OPERATOR_EMAIL = "ops@example.test"
  process.env.CRON_SECRET = "cron_test"
}

/** existing: the estimate_walkthroughs row returned by the lookup (null = none) */
function useWalkthroughTable(existing = null) {
  const state = getTestState()
  state.supabase.queryResolver = (query) => {
    if (query.table !== "estimate_walkthroughs") return { data: null, error: null }
    if (query.action === "select") return { data: existing, error: null }
    if (query.action === "upsert") return { data: existing ? [] : [{ estimate_id: "estimate_1" }], error: null }
    if (query.action === "update") return { data: existing ? { estimate_id: "estimate_1" } : null, error: null }
    return { data: null, error: null }
  }
  return state
}

const walkthroughCalls = (state) => state.supabase.queryCalls.filter((query) => query.table === "estimate_walkthroughs")

describe("contractor walkthrough request", () => {
  beforeEach(() => {
    resetTestState()
    setEnv()
  })

  test("records the request and emails the operator with scope and before photos", async () => {
    const state = useWalkthroughTable(null)
    const response = await walkthroughPost(
      jsonRequest("http://localhost/api/estimates/estimate_1/walkthrough", { estimateNumber: "EST-1", scope: "- White shaker cabinets", photos: [PHOTO] }, { headers: bearerHeader() }),
      params()
    )
    assert.equal(response.status, 200)
    assert.equal((await response.json()).status, "requested")

    const claim = walkthroughCalls(state).find((query) => query.action === "upsert")
    assert.deepEqual(claim.payload, { user_id: "user-1", estimate_id: "estimate_1", status: "requested" })
    assert.deepEqual(claim.upsertOptions, { onConflict: "user_id,estimate_id", ignoreDuplicates: true })

    assert.equal(state.resend.sendCalls.length, 1)
    const email = state.resend.sendCalls[0]
    assert.deepEqual(email.to, ["ops@example.test"])
    assert.match(email.html, /White shaker cabinets/)
    assert.equal(email.attachments.length, 1)
    assert.equal(email.attachments[0].filename, "before-1.jpg")
  })

  test("a concurrent duplicate request does not email twice", async () => {
    const state = useWalkthroughTable(null)
    state.supabase.queryResolver = (query) =>
      query.action === "upsert" ? { data: [], error: null } : { data: null, error: null }
    const response = await walkthroughPost(
      jsonRequest("http://localhost/api/estimates/estimate_1/walkthrough", { scope: "x" }, { headers: bearerHeader() }),
      params()
    )
    assert.equal((await response.json()).status, "requested")
    assert.equal(state.resend.sendCalls.length, 0)
  })

  test("a recent pending request is not re-sent, a stale one is", async () => {
    const recent = useWalkthroughTable({ status: "requested", requested_at: new Date().toISOString() })
    await walkthroughPost(jsonRequest("http://localhost/api/estimates/estimate_1/walkthrough", { scope: "x" }, { headers: bearerHeader() }), params())
    assert.equal(recent.resend.sendCalls.length, 0)

    resetTestState()
    setEnv()
    const stale = useWalkthroughTable({ status: "requested", requested_at: "2020-01-01T00:00:00Z" })
    const response = await walkthroughPost(jsonRequest("http://localhost/api/estimates/estimate_1/walkthrough", { scope: "x" }, { headers: bearerHeader() }), params())
    assert.equal(response.status, 200)
    assert.equal(stale.resend.sendCalls.length, 1)
    assert.match(stale.resend.sendCalls[0].subject, /resent/)
    assert.ok(walkthroughCalls(stale).some((query) => query.action === "update" && query.payload.requested_at))
  })

  test("does not email again when the preview is ready", async () => {
    const state = useWalkthroughTable({ status: "ready", url: "https://walk.example/abc" })
    const response = await walkthroughPost(
      jsonRequest("http://localhost/api/estimates/estimate_1/walkthrough", { scope: "x", photos: [] }, { headers: bearerHeader() }),
      params()
    )
    assert.deepEqual(await response.json(), { ok: true, status: "ready", url: "https://walk.example/abc" })
    assert.equal(state.resend.sendCalls.length, 0)
    assert.equal(walkthroughCalls(state).some((query) => query.action === "upsert"), false)
  })

  for (const [label, send] of [
    ["returns an error", async () => ({ data: null, error: { message: "boom" } })],
    ["throws", async () => { throw new Error("network") }],
  ]) {
    test(`releases the claim when the email ${label} so the contractor can retry`, async () => {
      const state = useWalkthroughTable(null)
      state.resend.send = send
      const response = await walkthroughPost(
        jsonRequest("http://localhost/api/estimates/estimate_1/walkthrough", { scope: "x" }, { headers: bearerHeader() }),
        params()
      )
      assert.equal(response.status, 502)
      assert.ok(walkthroughCalls(state).some((query) => query.action === "delete"))
    })
  }

  test("rejects non-image or malformed photos and oversized bodies", async () => {
    useWalkthroughTable(null)
    for (const photo of ["data:text/html;base64,PGgxPg==", "data:image/png;base64,ab cd"]) {
      const bad = await walkthroughPost(
        jsonRequest("http://localhost/api/estimates/estimate_1/walkthrough", { scope: "x", photos: [photo] }, { headers: bearerHeader() }),
        params()
      )
      assert.equal(bad.status, 400)
    }
    const huge = await walkthroughPost(
      jsonRequest("http://localhost/api/estimates/estimate_1/walkthrough", { scope: "x" }, { headers: { ...bearerHeader(), "content-length": "9000000" } }),
      params()
    )
    assert.equal(huge.status, 413)
  })
})

describe("operator attaches a walkthrough link", () => {
  beforeEach(() => {
    resetTestState()
    setEnv()
  })

  const attach = (body, secret = "cron_test") =>
    opsWalkthroughPost(jsonRequest("http://localhost/api/ops/walkthrough", body, { headers: { authorization: `Bearer ${secret}` } }))

  test("requires the cron secret", async () => {
    useWalkthroughTable({ status: "requested" })
    const response = await attach({ userId: USER_ID, estimateId: "estimate_1", url: "https://walk.example/abc" }, "wrong")
    assert.equal(response.status, 401)
  })

  test("only accepts https links and normalizes the scheme", async () => {
    useWalkthroughTable({ status: "requested" })
    const response = await attach({ userId: USER_ID, estimateId: "estimate_1", url: "http://walk.example/abc" })
    assert.equal(response.status, 400)

    const state = useWalkthroughTable({ status: "requested" })
    await attach({ userId: USER_ID, estimateId: "estimate_1", url: "HTTPS://walk.example/abc" })
    assert.equal(walkthroughCalls(state).find((query) => query.action === "update").payload.url, "https://walk.example/abc")
  })

  test("marks the requested row ready", async () => {
    const state = useWalkthroughTable({ status: "requested" })
    const response = await attach({ userId: USER_ID, estimateId: "estimate_1", url: "https://walk.example/abc" })
    assert.equal(response.status, 200)
    const update = walkthroughCalls(state).find((query) => query.action === "update")
    assert.equal(update.payload.status, "ready")
    assert.equal(update.payload.url, "https://walk.example/abc")
    assert.ok(update.filters.some((filter) => filter.column === "user_id" && filter.value === USER_ID))
  })

  test("404s when nothing was requested for that estimate", async () => {
    useWalkthroughTable(null)
    const response = await attach({ userId: USER_ID, estimateId: "estimate_1", url: "https://walk.example/abc" })
    assert.equal(response.status, 404)
  })
})

describe("walkthrough client helpers", () => {
  test("scope lists the summary and each line item", () => {
    const scope = buildWalkthroughScope({
      summary_note: "Kitchen refresh",
      items: [{ id: "1", description: "Quartz countertops", quantity: 30, unit: "ea", unit_price: 80 }],
    })
    assert.equal(scope, "Kitchen refresh\n- Quartz countertops (30 ea)")
  })

  test("photos stay under the request size cap and skip non-images", () => {
    const big = `data:image/jpeg;base64,${"a".repeat(2_500_000)}`
    assert.deepEqual(pickWalkthroughPhotos(["data:text/plain;base64,aGk=", big, big, PHOTO]), [big, PHOTO])
  })
})

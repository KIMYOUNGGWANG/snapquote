import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"
import { bearerHeader, jsonRequest } from "../helpers/http.mjs"
import { getTestState, resetTestState } from "../mocks/state.mjs"

import { POST as diagnose } from "../../app/api/public/diagnose/route.ts"
import { POST as submitRequest } from "../../app/api/public/requests/route.ts"
import { GET as listRequests } from "../../app/api/customer-requests/route.ts"
import { GET as getRequest, PATCH as updateRequest } from "../../app/api/customer-requests/[requestId]/route.ts"
import { buildRequestEstimateNotes, normalizePublicSlugInput } from "../../lib/customer-requests.ts"
import { signDiagnosis, verifyDiagnosisToken } from "../../lib/server/customer-requests.ts"

const PHOTO = "data:image/jpeg;base64,/9j/AAAA"
const CONTRACTOR = {
  id: "user-1",
  business_name: "Joe's Plumbing",
  logo_url: "",
  email: "joe@example.com",
  address: "123 Main St, Austin, TX",
  request_hide_price_range: false,
}
const DIAGNOSIS = {
  cause: "Slow leak at the P-trap slip nut",
  urgency: "medium",
  priceRange: { min: 150, max: 300, currency: "USD" },
  beforeVisit: ["Put a bucket under the trap"],
  confidence: "medium",
}

function setServiceEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role"
  process.env.RESEND_API_KEY = "re_test"
}

function mockContractor(state, contractor = CONTRACTOR, extra = () => undefined) {
  state.supabase.queryResolver = async (query) => {
    if (query.table === "profiles" && query.action === "select") {
      const slugFilter = query.filters.find((filter) => filter.column === "public_slug")
      return { data: slugFilter?.value === "joes-plumbing" ? contractor : null, error: null }
    }
    const handled = await extra(query)
    if (handled !== undefined) return handled
    return { data: null, error: null }
  }
}

function aiReply(content) {
  return async () => ({
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  })
}

beforeEach(() => {
  resetTestState()
  setServiceEnv()
})

describe("POST /api/public/diagnose", () => {
  test("returns 429 when the IP limit is hit", async () => {
    const state = getTestState()
    state.rateLimit.result = { allowed: false, remaining: 0, resetAt: Date.now() }

    const res = await diagnose(jsonRequest("http://localhost/api/public/diagnose", { slug: "joes-plumbing", space: "bathroom", photos: [PHOTO] }))

    assert.equal(res.status, 429)
  })

  test("rejects payloads without a valid image", async () => {
    const res = await diagnose(jsonRequest("http://localhost/api/public/diagnose", { slug: "joes-plumbing", space: "bathroom", photos: ["data:text/html;base64,PHA+"] }))
    assert.equal(res.status, 400)

    const empty = await diagnose(jsonRequest("http://localhost/api/public/diagnose", { slug: "joes-plumbing", space: "bathroom", photos: [] }))
    assert.equal(empty.status, 400)

    const tooMany = await diagnose(jsonRequest("http://localhost/api/public/diagnose", { slug: "joes-plumbing", space: "bathroom", photos: [PHOTO, PHOTO, PHOTO, PHOTO] }))
    assert.equal(tooMany.status, 400)
  })

  test("returns 404 for an unknown contractor link", async () => {
    const state = getTestState()
    mockContractor(state)

    const res = await diagnose(jsonRequest("http://localhost/api/public/diagnose", { slug: "nobody-here", space: "bathroom", photos: [PHOTO] }))

    assert.equal(res.status, 404)
    assert.equal(state.openai.chatCalls.length, 0)
  })

  test("returns a normalized diagnosis with the photo-based disclaimer", async () => {
    const state = getTestState()
    mockContractor(state)
    state.openai.chatCompletionsCreate = aiReply({
      cause: "Slow leak at the P-trap slip nut",
      urgency: "MEDIUM",
      priceMin: 300,
      priceMax: 150,
      currency: "USD",
      beforeVisit: ["Put a bucket under the trap", "", 42],
      confidence: "high",
    })

    const res = await diagnose(jsonRequest("http://localhost/api/public/diagnose", { slug: "Joes-Plumbing", space: "bathroom", note: "drip under sink", photos: [PHOTO] }))
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.diagnosis.cause, "Slow leak at the P-trap slip nut")
    assert.equal(data.diagnosis.urgency, "medium")
    assert.deepEqual(data.diagnosis.priceRange, { min: 150, max: 300, currency: "USD" })
    assert.deepEqual(data.diagnosis.beforeVisit, ["Put a bucket under the trap"])
    assert.match(data.disclaimer, /photo/i)
    assert.ok(verifyDiagnosisToken(data.diagnosisToken, { slug: "joes-plumbing", diagnosis: data.diagnosis, photos: [PHOTO] }))
    assert.ok(!verifyDiagnosisToken(data.diagnosisToken, { slug: "joes-plumbing", diagnosis: { ...data.diagnosis, cause: "Anything" }, photos: [PHOTO] }))

    const ipLimit = state.rateLimit.calls.find((call) => call.key.startsWith("public-diagnose:ip:"))
    const slugLimit = state.rateLimit.calls.find((call) => call.key === "public-diagnose:slug:joes-plumbing")
    assert.equal(ipLimit?.limit, 10)
    assert.ok(slugLimit)

    const userMessage = state.openai.chatCalls[0].messages.find((message) => message.role === "user")
    assert.ok(userMessage.content.some((part) => part.type === "image_url" && part.image_url.url === PHOTO))
    assert.ok(userMessage.content.some((part) => part.type === "text" && part.text.includes("drip under sink")))
  })

  test("drops the price range when the contractor hides it", async () => {
    const state = getTestState()
    mockContractor(state, { ...CONTRACTOR, request_hide_price_range: true })
    state.openai.chatCompletionsCreate = aiReply({ cause: "Worn flapper", urgency: "low", priceMin: 80, priceMax: 120, currency: "USD", beforeVisit: [], confidence: "medium" })

    const res = await diagnose(jsonRequest("http://localhost/api/public/diagnose", { slug: "joes-plumbing", space: "bathroom", photos: [PHOTO] }))
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.diagnosis.priceRange, undefined)
    assert.equal(data.priceRangeHidden, true)
    assert.ok(verifyDiagnosisToken(data.diagnosisToken, { slug: "joes-plumbing", diagnosis: data.diagnosis, photos: [PHOTO] }))
  })

  test("returns 502 when the AI cannot read the photo", async () => {
    const state = getTestState()
    mockContractor(state)
    state.openai.chatCompletionsCreate = aiReply({ cause: "", urgency: "low" })

    const res = await diagnose(jsonRequest("http://localhost/api/public/diagnose", { slug: "joes-plumbing", space: "other", photos: [PHOTO] }))

    assert.equal(res.status, 502)
  })
})

describe("POST /api/public/requests", () => {
  const validRequest = {
    slug: "joes-plumbing",
    space: "bathroom",
    diagnosis: DIAGNOSIS,
    photos: [PHOTO, PHOTO],
    name: "Dana Lee",
    email: "dana@example.com",
    phone: "",
    areaLabel: "Hyde Park",
  }
  // Signed at call time: the signing key comes from the env set in beforeEach.
  const signed = (overrides = {}) => {
    const body = { ...validRequest, ...overrides }
    return { ...body, diagnosisToken: signDiagnosis(body) }
  }

  test("requires an email or a phone number", async () => {
    const res = await submitRequest(jsonRequest("http://localhost/api/public/requests", signed({ email: "", phone: "" })))
    assert.equal(res.status, 400)
  })

  test("returns 404 for an unknown contractor link", async () => {
    const state = getTestState()
    mockContractor(state)

    const res = await submitRequest(jsonRequest("http://localhost/api/public/requests", signed({ slug: "nobody-here" })))

    assert.equal(res.status, 404)
    assert.equal(state.storage.uploadCalls.length, 0)
  })

  test("rejects a diagnosis the server did not produce for these photos", async () => {
    const state = getTestState()
    mockContractor(state)
    const body = signed()
    const forged = [
      { ...body, diagnosis: { ...DIAGNOSIS, cause: "Call 555-0100 for a cheaper fix" } },
      { ...body, diagnosis: { ...DIAGNOSIS, priceRange: { min: 10, max: 20, currency: "USD" } } },
      { ...body, photos: [PHOTO] },
      { ...body, diagnosisToken: "" },
      { ...validRequest, diagnosisToken: signDiagnosis(validRequest, Date.now() - 3 * 60 * 60 * 1000) },
    ]

    for (const payload of forged) {
      const res = await submitRequest(jsonRequest("http://localhost/api/public/requests", payload))
      assert.equal(res.status, 400)
    }
    assert.equal(state.storage.uploadCalls.length, 0)
    assert.ok(!state.supabase.queryCalls.some((query) => query.table === "customer_requests"))
  })

  test("stores photos privately, saves the request, and emails the contractor", async () => {
    const state = getTestState()
    mockContractor(state)

    const res = await submitRequest(jsonRequest("http://localhost/api/public/requests", signed()))
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)

    assert.equal(state.storage.uploadCalls.length, 2)
    for (const [index, call] of state.storage.uploadCalls.entries()) {
      assert.equal(call.bucket, "request-photos")
      assert.match(call.path, new RegExp(`^user-1/[0-9a-f-]{36}/${index + 1}\\.jpg$`))
      assert.equal(call.options.contentType, "image/jpeg")
      assert.equal(call.options.upsert, false)
    }

    const insert = state.supabase.queryCalls.find((query) => query.table === "customer_requests" && query.action === "insert")
    assert.equal(insert.payload.user_id, "user-1")
    assert.equal(insert.payload.customer_name, "Dana Lee")
    assert.equal(insert.payload.customer_email, "dana@example.com")
    assert.equal(insert.payload.customer_phone, null)
    assert.equal(insert.payload.area_label, "Hyde Park")
    assert.equal(insert.payload.diagnosis.cause, DIAGNOSIS.cause)
    assert.equal(insert.payload.diagnosis.space, "bathroom")
    assert.deepEqual(insert.payload.photo_paths, state.storage.uploadCalls.map((call) => call.path))
    assert.ok(insert.payload.photo_paths[0].includes(insert.payload.id))

    assert.equal(state.resend.sendCalls.length, 1)
    assert.deepEqual(state.resend.sendCalls[0].to, ["joe@example.com"])
    assert.ok(!state.resend.sendCalls[0].html.includes("dana@example.com"), "email should not carry customer contact details")
  })

  test("keeps the price range out of storage when the contractor hides it", async () => {
    const state = getTestState()
    mockContractor(state, { ...CONTRACTOR, request_hide_price_range: true })

    const res = await submitRequest(jsonRequest("http://localhost/api/public/requests", signed()))
    assert.equal(res.status, 200)

    const insert = state.supabase.queryCalls.find((query) => query.table === "customer_requests" && query.action === "insert")
    assert.equal(insert.payload.diagnosis.priceRange, undefined)
  })

  test("removes uploaded photos when saving the row fails", async () => {
    const state = getTestState()
    mockContractor(state, CONTRACTOR, (query) => {
      if (query.table === "customer_requests" && query.action === "insert") return { data: null, error: { message: "boom" } }
      return undefined
    })

    const res = await submitRequest(jsonRequest("http://localhost/api/public/requests", signed()))

    assert.equal(res.status, 500)
    assert.equal(state.storage.removeCalls.length, 1)
    assert.deepEqual(state.storage.removeCalls[0].paths, state.storage.uploadCalls.map((call) => call.path))
    assert.equal(state.resend.sendCalls.length, 0)
  })

  test("saves the request without emailing when the contractor was notified recently", async () => {
    const state = getTestState()
    mockContractor(state)
    state.rateLimit.result = (options) => ({
      allowed: !options.key.startsWith("customer-request-notify:"),
      remaining: 0,
      resetAt: Date.now(),
    })

    const res = await submitRequest(jsonRequest("http://localhost/api/public/requests", signed()))

    assert.equal(res.status, 200)
    assert.equal(state.resend.sendCalls.length, 0)
    assert.ok(state.rateLimit.calls.some((call) => call.key === "public-requests:slug:joes-plumbing"))
  })
})

describe("contractor customer request routes", () => {
  test("list requires auth", async () => {
    const state = getTestState()
    state.routeAuth.result = {
      ok: false,
      response: new Response(JSON.stringify({ error: { message: "Unauthorized", code: 401 } }), { status: 401 }),
    }

    const res = await listRequests(new Request("http://localhost/api/customer-requests"))
    assert.equal(res.status, 401)
  })

  test("list returns only the caller's requests", async () => {
    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === "customer_requests") {
        return {
          data: [{
            id: "req-1",
            status: "new",
            customer_name: "Dana Lee",
            customer_email: "dana@example.com",
            customer_phone: null,
            area_label: "Hyde Park",
            diagnosis: DIAGNOSIS,
            photo_paths: ["user-1/req-1/1.jpg"],
            estimate_id: null,
            created_at: "2026-11-21T00:00:00Z",
          }],
          error: null,
        }
      }
      return { data: null, error: null }
    }

    const res = await listRequests(new Request("http://localhost/api/customer-requests", { headers: bearerHeader() }))
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.requests.length, 1)
    assert.equal(data.requests[0].customerName, "Dana Lee")
    assert.equal(data.requests[0].photoCount, 1)
    assert.equal(data.requests[0].photoPaths, undefined, "storage paths stay on the server")
    const query = state.supabase.queryCalls.find((call) => call.table === "customer_requests")
    assert.ok(query.filters.some((filter) => filter.column === "user_id" && filter.value === "user-1"))
  })

  test("detail returns 404 for someone else's request and photos as data URLs for your own", async () => {
    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table !== "customer_requests") return { data: null, error: null }
      const ownerFilter = query.filters.find((filter) => filter.column === "user_id")
      const idFilter = query.filters.find((filter) => filter.column === "id")
      if (ownerFilter?.value !== "user-1" || idFilter?.value !== "req-1") return { data: null, error: null }
      return {
        data: {
          id: "req-1",
          status: "new",
          customer_name: "Dana Lee",
          customer_email: null,
          customer_phone: "+15125550100",
          area_label: null,
          diagnosis: DIAGNOSIS,
          photo_paths: ["user-1/req-1/1.jpg"],
          estimate_id: null,
          created_at: "2026-11-21T00:00:00Z",
        },
        error: null,
      }
    }

    const missing = await getRequest(new Request("http://localhost/api/customer-requests/req-2", { headers: bearerHeader() }), { params: Promise.resolve({ requestId: "req-2" }) })
    assert.equal(missing.status, 404)

    const res = await getRequest(new Request("http://localhost/api/customer-requests/req-1", { headers: bearerHeader() }), { params: Promise.resolve({ requestId: "req-1" }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.request.customerPhone, "+15125550100")
    assert.equal(data.request.photos.length, 1)
    assert.match(data.request.photos[0], /^data:image\/jpeg;base64,/)
    assert.deepEqual(state.storage.downloadCalls, [{ bucket: "request-photos", path: "user-1/req-1/1.jpg" }])
  })

  test("marking drafted needs an estimate id and is scoped to the owner", async () => {
    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === "customer_requests" && query.action === "update") return { data: [{ id: "req-1" }], error: null }
      return { data: null, error: null }
    }
    const params = { params: Promise.resolve({ requestId: "req-1" }) }

    const bad = await updateRequest(jsonRequest("http://localhost/api/customer-requests/req-1", { status: "drafted" }, { method: "PATCH", headers: bearerHeader() }), params)
    assert.equal(bad.status, 400)

    const res = await updateRequest(jsonRequest("http://localhost/api/customer-requests/req-1", { status: "drafted", estimateId: "est-local-1" }, { method: "PATCH", headers: bearerHeader() }), params)
    assert.equal(res.status, 200)

    const update = state.supabase.queryCalls.find((query) => query.table === "customer_requests" && query.action === "update")
    assert.equal(update.payload.status, "drafted")
    assert.equal(update.payload.estimate_id, "est-local-1")
    assert.ok(update.filters.some((filter) => filter.column === "user_id" && filter.value === "user-1"))
    assert.ok(update.filters.some((filter) => filter.column === "id" && filter.value === "req-1"))
  })

  test("updating a request you do not own returns 404", async () => {
    const state = getTestState()
    state.supabase.queryResolver = async () => ({ data: [], error: null })

    const res = await updateRequest(
      jsonRequest("http://localhost/api/customer-requests/req-9", { status: "dismissed" }, { method: "PATCH", headers: bearerHeader() }),
      { params: Promise.resolve({ requestId: "req-9" }) },
    )
    assert.equal(res.status, 404)
  })
})

describe("customer request helpers", () => {
  test("public slug input is lowercased, empty clears it, bad shapes are rejected", () => {
    assert.deepEqual(normalizePublicSlugInput("  Joes-Plumbing "), { ok: true, slug: "joes-plumbing" })
    assert.deepEqual(normalizePublicSlugInput("   "), { ok: true, slug: null })
    for (const slug of ["ab", "-joe", "joe-", "joe plumbing", "joe_plumbing", "a".repeat(41)]) {
      assert.equal(normalizePublicSlugInput(slug).ok, false, slug)
    }
  })

  test("estimate notes carry the customer, area and AI read", () => {
    const notes = buildRequestEstimateNotes({
      id: "req-1",
      status: "new",
      customerName: "Dana Lee",
      areaLabel: "Hyde Park",
      diagnosis: { ...DIAGNOSIS, space: "bathroom", note: "drip" },
      photoCount: 1,
      createdAt: "2026-11-21T00:00:00Z",
    })
    assert.match(notes, /Dana Lee \(Hyde Park\)/)
    assert.match(notes, /Area: bathroom/)
    assert.match(notes, /Slow leak at the P-trap/)
    assert.match(notes, /\$150 – \$300/)
  })
})

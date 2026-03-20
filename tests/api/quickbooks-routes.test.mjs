import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"

import { bearerHeader, jsonRequest } from "../helpers/http.mjs"
import { getTestState, resetTestState } from "../mocks/state.mjs"

import { POST as connectStartPost } from "../../app/api/quickbooks/connect/start/route.ts"
import { POST as connectTokenPost } from "../../app/api/quickbooks/connect/token/route.ts"
import { GET as quickBooksStatusGet } from "../../app/api/quickbooks/status/route.ts"
import { POST as quickBooksSyncPost } from "../../app/api/quickbooks/invoices/sync/route.ts"

const RELEVANT_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "QUICKBOOKS_CLIENT_ID",
  "QUICKBOOKS_CLIENT_SECRET",
  "QUICKBOOKS_REDIRECT_URI",
]

function clearRelevantEnv() {
  for (const key of RELEVANT_ENV_KEYS) {
    delete process.env[key]
  }
}

function setQuickBooksEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role"
  process.env.NEXT_PUBLIC_APP_URL = "https://app.snapquote.test"
  process.env.QUICKBOOKS_CLIENT_ID = "quickbooks_client"
  process.env.QUICKBOOKS_CLIENT_SECRET = "quickbooks_secret"
  process.env.QUICKBOOKS_REDIRECT_URI = "https://app.snapquote.test/quickbooks/callback"
}

function futureIso(hours = 24) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

beforeEach(() => {
  resetTestState()
  clearRelevantEnv()
})

describe("QuickBooks routes", () => {
  test("POST /api/quickbooks/connect/start returns 402 for free plan", async () => {
    setQuickBooksEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select") {
        return {
          data: {
            plan_tier: "free",
            stripe_subscription_status: null,
            referral_trial_ends_at: null,
            referral_bonus_ends_at: null,
          },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest("http://localhost/api/quickbooks/connect/start", {
      returnPath: "/history",
    }, {
      headers: bearerHeader(),
    })

    const res = await connectStartPost(req)
    const data = await res.json()

    assert.equal(res.status, 402)
    assert.match(data.error, /pro or team/i)
  })

  test("POST /api/quickbooks/connect/start returns QuickBooks auth URL for pro plan", async () => {
    setQuickBooksEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select") {
        return {
          data: {
            plan_tier: "pro",
            stripe_subscription_status: "active",
            referral_trial_ends_at: null,
            referral_bonus_ends_at: null,
          },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest("http://localhost/api/quickbooks/connect/start", {
      returnPath: "/history?from=quickbooks",
    }, {
      headers: bearerHeader(),
    })

    const res = await connectStartPost(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.match(data.url, /appcenter\.intuit\.com\/connect\/oauth2/)
    assert.match(data.url, /client_id=quickbooks_client/)
  })

  test("POST /api/quickbooks/connect/token exchanges auth code and saves connection", async () => {
    setQuickBooksEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select") {
        return {
          data: {
            plan_tier: "pro",
            stripe_subscription_status: "active",
            referral_trial_ends_at: null,
            referral_bonus_ends_at: null,
          },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const originalFetch = globalThis.fetch
    const fetchCalls = []
    globalThis.fetch = async (url) => {
      fetchCalls.push(String(url))
      return new Response(
        JSON.stringify({
          access_token: "access_token_123",
          refresh_token: "refresh_token_123",
          expires_in: 3600,
          x_refresh_token_expires_in: 86400,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    try {
      const req = jsonRequest("http://localhost/api/quickbooks/connect/token", {
        code: "qb_code",
        realmId: "realm_123",
      }, {
        headers: bearerHeader(),
      })

      const res = await connectTokenPost(req)
      const data = await res.json()

      assert.equal(res.status, 200)
      assert.equal(data.ok, true)
      assert.equal(data.realmId, "realm_123")

      const upsertCall = state.supabase.queryCalls.find(
        (query) => query.table === "quickbooks_connections" && query.action === "upsert"
      )

      assert.ok(upsertCall)
      assert.equal(upsertCall.payload.realm_id, "realm_123")
      assert.equal(fetchCalls[0], "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("GET /api/quickbooks/status returns connection and sync stats", async () => {
    setQuickBooksEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select") {
        return {
          data: {
            plan_tier: "pro",
            stripe_subscription_status: "active",
            referral_trial_ends_at: null,
            referral_bonus_ends_at: null,
          },
          error: null,
        }
      }

      if (query.table === "quickbooks_connections" && query.action === "select") {
        return {
          data: {
            user_id: "user-1",
            realm_id: "realm_123",
            access_token: "access_token_123",
            refresh_token: "refresh_token_123",
            token_expires_at: futureIso(),
            refresh_token_expires_at: futureIso(48),
            connected_at: futureIso(),
            updated_at: futureIso(),
          },
          error: null,
        }
      }

      if (query.table === "quickbooks_invoice_links" && query.action === "select") {
        return {
          data: [{ synced_at: "2026-03-20T12:00:00.000Z" }],
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = new Request("http://localhost/api/quickbooks/status", {
      method: "GET",
      headers: bearerHeader(),
    })

    const res = await quickBooksStatusGet(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.connected, true)
    assert.equal(data.realmId, "realm_123")
    assert.equal(data.syncStats.syncedInvoices, 1)
  })

  test("POST /api/quickbooks/invoices/sync creates a QuickBooks invoice and stores the link", async () => {
    setQuickBooksEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select") {
        return {
          data: {
            plan_tier: "pro",
            stripe_subscription_status: "active",
            referral_trial_ends_at: null,
            referral_bonus_ends_at: null,
          },
          error: null,
        }
      }

      if (query.table === "quickbooks_connections" && query.action === "select") {
        return {
          data: {
            user_id: "user-1",
            realm_id: "realm_123",
            access_token: "access_token_123",
            refresh_token: "refresh_token_123",
            token_expires_at: futureIso(),
            refresh_token_expires_at: futureIso(48),
            connected_at: futureIso(),
            updated_at: futureIso(),
          },
          error: null,
        }
      }

      if (query.table === "quickbooks_invoice_links" && query.action === "select") {
        return { data: null, error: null }
      }

      return { data: null, error: null }
    }

    const originalFetch = globalThis.fetch
    const fetchCalls = []
    globalThis.fetch = async (url, init = {}) => {
      const href = String(url)
      fetchCalls.push({ url: href, init })

      if (href.includes("/query?query=") && href.includes("Customer")) {
        return new Response(
          JSON.stringify({ QueryResponse: {} }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (href.endsWith("/customer")) {
        return new Response(
          JSON.stringify({ Customer: { Id: "customer_123" } }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (href.includes("/query?query=") && href.includes("Item")) {
        return new Response(
          JSON.stringify({ QueryResponse: { Item: [{ Id: "1", Name: "Services" }] } }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (href.endsWith("/invoice")) {
        return new Response(
          JSON.stringify({
            Invoice: {
              Id: "invoice_123",
              CustomerRef: { value: "customer_123" },
              DocNumber: "EST-2403-001",
              Balance: 240,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      throw new Error(`Unhandled fetch ${href}`)
    }

    try {
      const req = jsonRequest("http://localhost/api/quickbooks/invoices/sync", {
        estimateId: "estimate-123",
        estimateNumber: "EST-2403-001",
        clientName: "Rivera Plumbing",
        clientAddress: "100 Main St",
        summaryNote: "Basement leak repair",
        totalAmount: 240,
        taxAmount: 0,
        type: "estimate",
        items: [
          {
            id: "item-1",
            description: "Leak repair labor",
            quantity: 2,
            unit_price: 120,
            total: 240,
            category: "SERVICE",
            unit: "hr",
          },
        ],
      }, {
        headers: bearerHeader(),
      })

      const res = await quickBooksSyncPost(req)
      const data = await res.json()

      assert.equal(res.status, 200)
      assert.equal(data.ok, true)
      assert.equal(data.invoiceId, "invoice_123")
      assert.equal(data.customerId, "customer_123")
      assert.equal(data.status, "open")
      assert.equal(fetchCalls.length, 4)

      const upsertCall = state.supabase.queryCalls.find(
        (query) => query.table === "quickbooks_invoice_links" && query.action === "upsert"
      )

      assert.ok(upsertCall)
      assert.equal(upsertCall.payload.quickbooks_invoice_id, "invoice_123")
      assert.equal(upsertCall.payload.quickbooks_customer_id, "customer_123")
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

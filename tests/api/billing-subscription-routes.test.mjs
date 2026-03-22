import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"
import { bearerHeader, jsonRequest } from "../helpers/http.mjs"
import { getTestState, resetTestState } from "../mocks/state.mjs"

import { POST as billingCheckoutPost } from "../../app/api/billing/stripe/checkout/route.ts"
import { POST as billingPortalPost } from "../../app/api/billing/stripe/portal/route.ts"
import { GET as billingSubscriptionGet } from "../../app/api/billing/subscription/route.ts"
import { POST as billingWebhookPost } from "../../app/api/webhooks/stripe/billing/route.ts"

const RELEVANT_ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_BILLING_WEBHOOK_SECRET",
  "STRIPE_BILLING_PRICE_STARTER_MONTHLY",
  "STRIPE_BILLING_PRICE_STARTER_ANNUAL",
  "STRIPE_BILLING_PRICE_PRO_MONTHLY",
  "STRIPE_BILLING_PRICE_PRO_ANNUAL",
  "STRIPE_BILLING_PRICE_TEAM_MONTHLY",
  "STRIPE_BILLING_PRICE_TEAM_ANNUAL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]

function clearRelevantEnv() {
  for (const key of RELEVANT_ENV_KEYS) {
    delete process.env[key]
  }
}

function setBillingEnv() {
  process.env.STRIPE_SECRET_KEY = "sk_test_billing"
  process.env.STRIPE_BILLING_WEBHOOK_SECRET = "whsec_billing"
  process.env.STRIPE_BILLING_PRICE_STARTER_MONTHLY = "price_starter_monthly_456"
  process.env.STRIPE_BILLING_PRICE_STARTER_ANNUAL = "price_starter_annual_456"
  process.env.STRIPE_BILLING_PRICE_PRO_MONTHLY = "price_pro_monthly_123"
  process.env.STRIPE_BILLING_PRICE_PRO_ANNUAL = "price_pro_annual_123"
  process.env.STRIPE_BILLING_PRICE_TEAM_MONTHLY = "price_team_monthly_789"
  process.env.STRIPE_BILLING_PRICE_TEAM_ANNUAL = "price_team_annual_789"
  process.env.NEXT_PUBLIC_APP_URL = "https://snapquote.app"
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role"
}

beforeEach(() => {
  resetTestState()
  clearRelevantEnv()
})

describe("POST /api/billing/stripe/checkout", () => {
  test("returns unauthorized when auth guard fails", async () => {
    setBillingEnv()
    const state = getTestState()
    state.routeAuth.result = {
      ok: false,
      response: new Response(
        JSON.stringify({ error: { message: "Unauthorized", code: 401 } }),
        { status: 401, headers: { "content-type": "application/json" } }
      ),
    }

    const req = jsonRequest("http://localhost/api/billing/stripe/checkout", {
      planTier: "pro",
    })

    const res = await billingCheckoutPost(req)
    assert.equal(res.status, 401)
  })

  test("creates checkout session and billing customer for selected plan", async () => {
    setBillingEnv()
    const state = getTestState()
    state.supabase.user = { id: "user-1", email: "owner@example.com" }
    state.stripe.checkoutSessionsCreate = async () => ({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
    })
    state.stripe.customersCreate = async () => ({ id: "cus_test_123" })

    const req = jsonRequest(
      "http://localhost/api/billing/stripe/checkout",
      { planTier: "team" },
      { headers: bearerHeader() }
    )

    const res = await billingCheckoutPost(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.planTier, "team")
    assert.equal(data.sessionId, "cs_test_123")
    assert.equal(data.customerId, "cus_test_123")
    assert.equal(state.stripe.customersCreateCalls.length, 1)
    assert.equal(state.stripe.checkoutSessionsCreateCalls.length, 1)
    assert.equal(state.stripe.checkoutSessionsCreateCalls[0].mode, "subscription")
    assert.equal(state.stripe.checkoutSessionsCreateCalls[0].line_items[0].price, "price_team_monthly_789")
    assert.equal(state.stripe.checkoutSessionsCreateCalls[0].metadata.planTier, "team")
  })

  test("accepts annual price override when it matches the selected plan tier", async () => {
    setBillingEnv()
    const state = getTestState()
    state.supabase.user = { id: "user-1", email: "owner@example.com" }
    state.stripe.checkoutSessionsCreate = async () => ({
      id: "cs_test_annual_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_annual_123",
    })
    state.stripe.customersCreate = async () => ({ id: "cus_test_annual_123" })

    const req = jsonRequest(
      "http://localhost/api/billing/stripe/checkout",
      {
        planTier: "pro",
        priceId: "price_pro_annual_123",
      },
      { headers: bearerHeader() }
    )

    const res = await billingCheckoutPost(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.planTier, "pro")
    assert.equal(state.stripe.checkoutSessionsCreateCalls[0].line_items[0].price, "price_pro_annual_123")
  })

  test("rejects annual price override when it belongs to another plan tier", async () => {
    setBillingEnv()

    const req = jsonRequest(
      "http://localhost/api/billing/stripe/checkout",
      {
        planTier: "starter",
        priceId: "price_team_annual_789",
      },
      { headers: bearerHeader() }
    )

    const res = await billingCheckoutPost(req)
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.match(data.error.message, /priceId does not match selected planTier/)
  })

  test("returns conflict when active subscription already exists", async () => {
    setBillingEnv()
    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: {
            stripe_customer_id: "cus_live_1",
            stripe_subscription_id: "sub_live_1",
            stripe_subscription_status: "active",
          },
          error: null,
        }
      }
      return { data: null, error: null }
    }

    const req = jsonRequest(
      "http://localhost/api/billing/stripe/checkout",
      { planTier: "pro" },
      { headers: bearerHeader() }
    )

    const res = await billingCheckoutPost(req)
    assert.equal(res.status, 409)
    assert.equal(state.stripe.checkoutSessionsCreateCalls.length, 0)
  })

  test("returns actionable error when billing schema columns are missing", async () => {
    setBillingEnv()
    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: null,
          error: {
            code: "PGRST204",
            message: "Could not find the 'stripe_customer_id' column of 'profiles' in the schema cache",
          },
        }
      }
      return { data: null, error: null }
    }

    const req = jsonRequest(
      "http://localhost/api/billing/stripe/checkout",
      { planTier: "pro" },
      { headers: bearerHeader() }
    )

    const res = await billingCheckoutPost(req)
    const data = await res.json()

    assert.equal(res.status, 503)
    assert.match(data.error.message, /schema is out of date/i)
    assert.equal(state.stripe.checkoutSessionsCreateCalls.length, 0)
  })
})

describe("POST /api/billing/stripe/portal", () => {
  test("returns 403 when billing customer is not linked", async () => {
    setBillingEnv()
    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select" && query.mode === "maybeSingle") {
        return { data: { stripe_customer_id: null }, error: null }
      }
      return { data: null, error: null }
    }

    const req = jsonRequest(
      "http://localhost/api/billing/stripe/portal",
      {},
      { headers: bearerHeader() }
    )
    const res = await billingPortalPost(req)

    assert.equal(res.status, 403)
  })

  test("creates billing portal session when customer exists", async () => {
    setBillingEnv()
    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select" && query.mode === "maybeSingle") {
        return { data: { stripe_customer_id: "cus_portal_1" }, error: null }
      }
      return { data: null, error: null }
    }
    state.stripe.billingPortalSessionsCreate = async () => ({
      url: "https://billing.stripe.com/p/session_123",
    })

    const req = jsonRequest(
      "http://localhost/api/billing/stripe/portal",
      {},
      { headers: bearerHeader() }
    )
    const res = await billingPortalPost(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.url, "https://billing.stripe.com/p/session_123")
    assert.equal(state.stripe.billingPortalSessionsCreateCalls[0].customer, "cus_portal_1")
  })
})

describe("GET /api/billing/subscription", () => {
  test("returns current subscription status payload", async () => {
    setBillingEnv()
    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: {
            plan_tier: "starter",
            stripe_customer_id: "cus_sub_1",
            stripe_subscription_id: "sub_sub_1",
            stripe_subscription_status: "active",
            stripe_subscription_price_id: "price_starter_monthly_456",
            stripe_subscription_current_period_end: "2026-03-31T00:00:00.000Z",
            stripe_cancel_at_period_end: false,
          },
          error: null,
        }
      }
      return { data: null, error: null }
    }

    const req = new Request("http://localhost/api/billing/subscription", {
      method: "GET",
      headers: bearerHeader(),
    })
    const res = await billingSubscriptionGet(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.planTier, "starter")
    assert.equal(data.subscribed, true)
    assert.equal(data.status, "active")
    assert.equal(data.customerId, "cus_sub_1")
  })

  test("returns free-plan fallback when billing schema columns are missing", async () => {
    setBillingEnv()
    const state = getTestState()
    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: null,
          error: {
            code: "PGRST204",
            message: "Could not find the 'stripe_customer_id' column of 'profiles' in the schema cache",
          },
        }
      }
      return { data: null, error: null }
    }

    const req = new Request("http://localhost/api/billing/subscription", {
      method: "GET",
      headers: bearerHeader(),
    })
    const res = await billingSubscriptionGet(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.planTier, "free")
    assert.equal(data.subscribed, false)
    assert.equal(data.status, null)
    assert.equal(data.cancelAtPeriodEnd, false)
  })
})

describe("POST /api/webhooks/stripe/billing", () => {
  test("returns 400 when signature is missing", async () => {
    setBillingEnv()
    const req = new Request("http://localhost/api/webhooks/stripe/billing", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    })

    const res = await billingWebhookPost(req)
    assert.equal(res.status, 400)
  })

  test("applies customer.subscription.updated to profile billing fields", async () => {
    setBillingEnv()
    const state = getTestState()
    state.stripe.constructEvent = () => ({
      id: "evt_sub_updated",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_updated_1",
          customer: "cus_updated_1",
          status: "active",
          cancel_at_period_end: false,
          current_period_end: 1775000000,
          metadata: { userId: "user-1", planTier: "team" },
          items: {
            data: [
              {
                price: { id: "price_team_monthly_789" },
              },
            ],
          },
        },
      },
    })

    const req = new Request("http://localhost/api/webhooks/stripe/billing", {
      method: "POST",
      body: "{}",
      headers: {
        "stripe-signature": "sig_test",
      },
    })

    const res = await billingWebhookPost(req)
    assert.equal(res.status, 200)

    const upsertCall = state.supabase.queryCalls.find((call) =>
      call.table === "profiles" && call.action === "upsert"
    )

    assert.ok(upsertCall)
    assert.equal(upsertCall.payload.plan_tier, "team")
    assert.equal(upsertCall.payload.stripe_customer_id, "cus_updated_1")
    assert.equal(upsertCall.payload.stripe_subscription_id, "sub_updated_1")
    assert.equal(upsertCall.payload.stripe_subscription_status, "active")
  })

  test("handles checkout.session.completed by retrieving subscription snapshot", async () => {
    setBillingEnv()
    const state = getTestState()
    state.stripe.constructEvent = () => ({
      id: "evt_checkout_completed",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          mode: "subscription",
          customer: "cus_checkout_1",
          subscription: "sub_checkout_1",
          client_reference_id: "user-1",
          metadata: {},
        },
      },
    })
    state.stripe.subscriptionsRetrieve = async () => ({
      id: "sub_checkout_1",
      customer: "cus_checkout_1",
      status: "active",
      cancel_at_period_end: false,
      current_period_end: 1776000000,
      metadata: {},
      items: {
        data: [
          {
            price: {
              id: "price_pro_monthly_123",
            },
          },
        ],
      },
    })

    const req = new Request("http://localhost/api/webhooks/stripe/billing", {
      method: "POST",
      body: "{}",
      headers: {
        "stripe-signature": "sig_test",
      },
    })

    const res = await billingWebhookPost(req)
    assert.equal(res.status, 200)
    assert.equal(state.stripe.subscriptionsRetrieveCalls[0], "sub_checkout_1")
  })
})

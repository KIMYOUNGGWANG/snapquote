import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"

import { bearerHeader, jsonRequest } from "../helpers/http.mjs"
import { getTestState, resetTestState } from "../mocks/state.mjs"

import { GET as customerShareLinkGet, POST as customerShareLinkPost } from "../../app/api/estimates/[estimateId]/share-link/route.ts"
import { GET as publicQuoteGet } from "../../app/api/public/quotes/[token]/route.ts"
import { POST as publicQuoteDecisionPost } from "../../app/api/public/quotes/[token]/decision/route.ts"
import {
  buildCustomerQuoteSnapshot,
  customerPortalEstimateUpdatesChanged,
  getCustomerPortalEstimateUpdates,
} from "../../lib/customer-portal-client.ts"
import { getCustomerQuoteDecisionRetryLabel } from "../../lib/customer-portal-decision-recovery.ts"
import { getCustomerPortalPaymentActionState } from "../../lib/customer-portal-payment.ts"
import {
  getCustomerQuoteNextStepCopy,
  getCustomerQuoteStatusClassName,
  getCustomerQuoteStatusLabel,
  isCustomerPortalUiStatus,
} from "../../lib/customer-portal-status.ts"

const RELEVANT_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]

const VALID_TOKEN = "customerportal000000000000000000000000"
const VALID_ESTIMATE_UUID = "11111111-1111-4111-8111-111111111111"

function clearRelevantEnv() {
  for (const key of RELEVANT_ENV_KEYS) {
    delete process.env[key]
  }
}

function setCustomerPortalEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role"
}

function hasEqFilter(query, column, value) {
  return query.filters?.some((filter) => filter.op === "eq" && filter.column === column && filter.value === value)
}

function assertLatestShareLinkLookup(query) {
  assert.deepEqual(query.orderBy, [{ column: "updated_at", options: { ascending: false } }])
  assert.equal(query.limitValue, 1)
}

function buildSnapshot(overrides = {}) {
  return {
    estimateNumber: "EST-2605-101",
    clientName: "Apex Kitchen",
    clientEmail: "owner@apex.test",
    clientAddress: "22 Harbor Rd",
    summaryNote: "Replace damaged cabinet toe-kick and reconnect sink plumbing.",
    taxRate: 5,
    taxAmount: 75,
    totalAmount: 1575,
    currency: "CAD",
    paymentLink: "https://pay.example.test/deposit",
    paymentLinkType: "deposit",
    items: [
      {
        id: "item-1",
        itemNumber: 1,
        category: "LABOR",
        description: "Cabinet repair and plumbing reconnect",
        quantity: 6,
        unit: "hr",
        unit_price: 250,
        total: 1500,
      },
    ],
    ...overrides,
  }
}

function buildShareRow(overrides = {}) {
  return {
    id: "share_1",
    user_id: "user-1",
    estimate_id: "estimate_1",
    share_url: "http://localhost/q/customerportal000000000000000000000000",
    estimate_snapshot: buildSnapshot(),
    status: "shared",
    viewed_at: null,
    approved_at: null,
    change_requested_at: null,
    customer_name: null,
    customer_email: null,
    customer_note: null,
    profiles: {
      business_name: "Crew West",
      phone: "+14165550123",
      email: "hello@crewwest.test",
      address: "Vancouver, BC",
      logo_url: null,
    },
    ...overrides,
  }
}

beforeEach(() => {
  resetTestState()
  clearRelevantEnv()
})

describe("customer quote portal routes", () => {
  test("customer quote snapshots can fall back to a profile payment link", () => {
    const snapshot = buildCustomerQuoteSnapshot({
      id: "estimate_profile_pay",
      estimateNumber: "EST-PROFILE-PAY",
      clientName: "Profile Pay Customer",
      clientAddress: "1 Payment Lane",
      summary_note: "Use the profile payment link when no estimate-specific link exists.",
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 450,
      createdAt: "2026-05-29T10:00:00.000Z",
      updatedAt: "2026-05-29T10:00:00.000Z",
      status: "sent",
      synced: false,
      items: [
        {
          id: "item-profile-pay",
          itemNumber: 1,
          category: "SERVICE",
          description: "Profile payment link service",
          quantity: 1,
          unit: "LS",
          unit_price: 450,
          total: 450,
        },
      ],
    }, {
      paymentLinkOverride: "https://pay.example.test/profile",
      paymentLinkTypeOverride: "custom",
    })

    assert.equal(snapshot.paymentLink, "https://pay.example.test/profile")
    assert.equal(snapshot.paymentLinkType, "custom")
  })

  test("customer quote snapshots carry paid payment state", () => {
    const snapshot = buildCustomerQuoteSnapshot({
      id: "estimate_paid_snapshot",
      estimateNumber: "EST-PAID-SNAPSHOT",
      clientName: "Paid Customer",
      clientAddress: "2 Paid Lane",
      summary_note: "Paid estimate should not keep asking for payment.",
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 450,
      createdAt: "2026-05-29T10:00:00.000Z",
      updatedAt: "2026-05-29T10:00:00.000Z",
      status: "paid",
      paymentLink: "https://pay.example.test/paid",
      paymentLinkType: "deposit",
      paymentCompletedAt: "2026-05-29T12:00:00.000Z",
      synced: false,
      items: [
        {
          id: "item-paid-snapshot",
          itemNumber: 1,
          category: "SERVICE",
          description: "Paid service",
          quantity: 1,
          unit: "LS",
          unit_price: 450,
          total: 450,
        },
      ],
    })

    assert.equal(snapshot.paymentStatus, "paid")
    assert.equal(snapshot.paymentCompletedAt, "2026-05-29T12:00:00.000Z")
  })

  test("customer quote snapshots treat payment-completed sent estimates as paid", () => {
    const snapshot = buildCustomerQuoteSnapshot({
      id: "estimate_paid_like_snapshot",
      estimateNumber: "EST-PAID-LIKE-SNAPSHOT",
      clientName: "Paid Timestamp Customer",
      clientAddress: "3 Paid Timestamp Lane",
      summary_note: "Sent estimate already collected through Stripe reconciliation.",
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 450,
      createdAt: "2026-05-29T10:00:00.000Z",
      updatedAt: "2026-05-29T10:00:00.000Z",
      status: "sent",
      paymentLink: "https://pay.example.test/paid-like",
      paymentLinkType: "deposit",
      paymentCompletedAt: "2026-05-29T12:00:00.000Z",
      synced: false,
      items: [
        {
          id: "item-paid-like-snapshot",
          itemNumber: 1,
          category: "SERVICE",
          description: "Paid-like service",
          quantity: 1,
          unit: "LS",
          unit_price: 450,
          total: 450,
        },
      ],
    })

    assert.equal(snapshot.paymentStatus, "paid")
    assert.equal(snapshot.paymentCompletedAt, "2026-05-29T12:00:00.000Z")
  })

  test("customer portal estimate updates can mark paid quotes collected locally", () => {
    const paidAt = "2026-05-29T12:00:00.000Z"
    const updates = getCustomerPortalEstimateUpdates({
      ok: true,
      shareUrl: "https://snapquote.test/q/paid-token",
      portal: {
        status: "approved",
        approvedAt: "2026-05-29T11:00:00.000Z",
      },
      estimate: {
        paymentStatus: "paid",
        paymentCompletedAt: paidAt,
      },
    })

    assert.equal(updates.customerPortalStatus, "approved")
    assert.equal(updates.status, "paid")
    assert.equal(updates.paymentCompletedAt, paidAt)
    assert.equal(updates.customerPortalUrl, "https://snapquote.test/q/paid-token")
    assert.equal(customerPortalEstimateUpdatesChanged({
      id: "estimate-local-paid-sync",
      estimateNumber: "EST-PAID-SYNC",
      items: [],
      summary_note: "",
      clientName: "Paid Sync",
      clientAddress: "",
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 450,
      createdAt: "2026-05-29T10:00:00.000Z",
      updatedAt: "2026-05-29T10:00:00.000Z",
      status: "sent",
      customerPortalStatus: "approved",
      customerPortalUrl: "https://snapquote.test/q/paid-token",
    }, updates), true)
  })

  test("customer portal payment action stays gated until approval", () => {
    assert.deepEqual(
      getCustomerPortalPaymentActionState("viewed", true, "deposit"),
      {
        showPayLink: false,
        helperText: "Approve this quote to unlock deposit payment.",
        buttonLabel: "Pay deposit",
        tone: "info",
      },
    )
    assert.deepEqual(
      getCustomerPortalPaymentActionState("approved", true, "deposit"),
      {
        showPayLink: true,
        helperText: "Deposit payment is ready.",
        buttonLabel: "Pay deposit",
        tone: "success",
      },
    )
    assert.deepEqual(
      getCustomerPortalPaymentActionState("change_requested", true, "full"),
      {
        showPayLink: false,
        helperText: "Payment is paused while the contractor prepares the next version.",
        buttonLabel: "Pay full amount",
        tone: "info",
      },
    )
    assert.deepEqual(
      getCustomerPortalPaymentActionState("approved", false),
      {
        showPayLink: false,
        helperText: "",
        buttonLabel: "Pay online",
        tone: "info",
      },
    )
    assert.deepEqual(
      getCustomerPortalPaymentActionState("approved", true, "full"),
      {
        showPayLink: true,
        helperText: "Full payment is ready.",
        buttonLabel: "Pay full amount",
        tone: "success",
      },
    )
    assert.deepEqual(
      getCustomerPortalPaymentActionState("viewed", true, "custom"),
      {
        showPayLink: false,
        helperText: "Approve this quote to unlock online payment.",
        buttonLabel: "Pay online",
        tone: "info",
      },
    )
    assert.deepEqual(
      getCustomerPortalPaymentActionState("approved", true, "deposit", true),
      {
        showPayLink: false,
        helperText: "Payment received. The contractor has this quote marked paid.",
        buttonLabel: "Pay deposit",
        tone: "success",
      },
    )
  })

  test("customer portal status helpers keep labels and tones aligned", () => {
    assert.equal(isCustomerPortalUiStatus("approved"), true)
    assert.equal(isCustomerPortalUiStatus("paid"), true)
    assert.equal(isCustomerPortalUiStatus("sent"), false)
    assert.equal(getCustomerQuoteStatusLabel("shared"), "Ready for review")
    assert.equal(getCustomerQuoteStatusLabel("viewed"), "Viewed")
    assert.equal(getCustomerQuoteStatusLabel("approved"), "Approved")
    assert.equal(getCustomerQuoteStatusLabel("change_requested"), "Changes requested")
    assert.equal(getCustomerQuoteStatusLabel("paid"), "Paid")
    assert.match(getCustomerQuoteStatusClassName("approved"), /emerald/)
    assert.match(getCustomerQuoteStatusClassName("paid"), /emerald/)
    assert.match(getCustomerQuoteStatusClassName("change_requested"), /amber/)
    assert.match(getCustomerQuoteStatusClassName("viewed"), /blue/)
  })

  test("customer portal decision retry labels match the failed action", () => {
    assert.equal(getCustomerQuoteDecisionRetryLabel("approve"), "Retry approval")
    assert.equal(getCustomerQuoteDecisionRetryLabel("request_changes"), "Retry change request")
  })

  test("customer portal next-step copy follows the decision and payment state", () => {
    assert.deepEqual(
      getCustomerQuoteNextStepCopy("shared"),
      {
        title: "Review and respond",
        description: "Check the scope, totals, and terms, then approve or request changes so the contractor can keep the job moving.",
      },
    )
    assert.deepEqual(
      getCustomerQuoteNextStepCopy("approved"),
      {
        title: "Payment is next",
        description: "Your approval is recorded. Use the payment option when available, or coordinate payment and scheduling with the contractor.",
      },
    )
    assert.deepEqual(
      getCustomerQuoteNextStepCopy("change_requested"),
      {
        title: "Waiting on revision",
        description: "Your change request has been sent. The contractor can update the scope before payment or scheduling moves forward.",
      },
    )
    assert.deepEqual(
      getCustomerQuoteNextStepCopy("approved", true),
      {
        title: "Payment received",
        description: "You're all set. The contractor has this quote marked paid and can follow up with scheduling, receipts, or closeout details.",
      },
    )
  })

  test("POST /api/estimates/:estimateId/share-link stores a local-first quote snapshot", async () => {
    setCustomerPortalEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "upsert") {
        return { data: [], error: null }
      }

      if (query.table === "estimate_share_links" && query.action === "select" && query.mode === "maybeSingle") {
        return { data: null, error: null }
      }

      if (query.table === "estimate_share_links" && query.action === "insert" && query.mode === "single") {
        assert.equal(query.payload.user_id, "user-1")
        assert.equal(query.payload.estimate_id, "estimate_1")
        assert.equal(query.payload.estimate_snapshot.estimateNumber, "EST-2605-101")
        assert.equal(query.payload.status, "shared")
        assert.match(query.payload.token_hash, /^[a-f0-9]{64}$/)
        return {
          data: buildShareRow({
            estimate_snapshot: query.payload.estimate_snapshot,
          }),
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest("http://localhost/api/estimates/estimate_1/share-link", {
      estimate: buildSnapshot(),
    }, {
      headers: bearerHeader(),
    })

    const res = await customerShareLinkPost(req, { params: Promise.resolve({ estimateId: "estimate_1" }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.match(data.shareUrl, /^http:\/\/localhost\/q\//)
    assert.equal(data.portal.status, "shared")
  })

  test("POST /api/estimates/:estimateId/share-link reuses an existing customer URL", async () => {
    setCustomerPortalEnv()
    const state = getTestState()
    const existingUrl = "https://snapquote.test/q/existing-customer-token"

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "upsert") {
        return { data: [], error: null }
      }

      if (query.table === "estimate_share_links" && query.action === "select" && query.mode === "maybeSingle") {
        assertLatestShareLinkLookup(query)
        return {
          data: buildShareRow({
            share_url: existingUrl,
            status: "viewed",
          }),
          error: null,
        }
      }

      if (query.table === "estimate_share_links" && query.action === "update" && query.mode === "single") {
        assert.ok(hasEqFilter(query, "id", "share_1"))
        assert.equal(query.payload.share_url, existingUrl)
        assert.equal(query.payload.estimate_snapshot.totalAmount, 1800)
        return {
          data: buildShareRow({
            share_url: existingUrl,
            status: "viewed",
            estimate_snapshot: query.payload.estimate_snapshot,
          }),
          error: null,
        }
      }

      assert.fail(`Unexpected query ${query.table}:${query.action}:${query.mode}`)
    }

    const req = jsonRequest("http://localhost/api/estimates/estimate_1/share-link", {
      estimate: buildSnapshot({ totalAmount: 1800 }),
    }, {
      headers: bearerHeader(),
    })

    const res = await customerShareLinkPost(req, { params: Promise.resolve({ estimateId: "estimate_1" }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.shareUrl, existingUrl)
    assert.equal(data.portal.status, "viewed")
  })

  test("POST /api/estimates/:estimateId/share-link can reset stale customer decisions for a resend", async () => {
    setCustomerPortalEnv()
    const state = getTestState()
    const existingUrl = "https://snapquote.test/q/revision-token"

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "upsert") {
        return { data: [], error: null }
      }

      if (query.table === "estimate_share_links" && query.action === "select" && query.mode === "maybeSingle") {
        assertLatestShareLinkLookup(query)
        return {
          data: buildShareRow({
            share_url: existingUrl,
            status: "change_requested",
            viewed_at: "2026-05-29T09:30:00.000Z",
            change_requested_at: "2026-05-29T10:00:00.000Z",
            customer_name: "Jordan Lee",
            customer_email: "jordan@example.test",
            customer_note: "Please add disposal haul-away.",
          }),
          error: null,
        }
      }

      if (query.table === "estimate_share_links" && query.action === "update" && query.mode === "single") {
        assert.ok(hasEqFilter(query, "id", "share_1"))
        assert.equal(query.payload.share_url, existingUrl)
        assert.equal(query.payload.estimate_snapshot.totalAmount, 1900)
        assert.equal(query.payload.status, "shared")
        assert.equal(query.payload.viewed_at, null)
        assert.equal(query.payload.approved_at, null)
        assert.equal(query.payload.change_requested_at, null)
        assert.equal(query.payload.customer_name, null)
        assert.equal(query.payload.customer_email, null)
        assert.equal(query.payload.customer_note, null)
        return {
          data: buildShareRow({
            share_url: existingUrl,
            status: "shared",
            viewed_at: null,
            approved_at: null,
            change_requested_at: null,
            customer_name: null,
            customer_email: null,
            customer_note: null,
            estimate_snapshot: query.payload.estimate_snapshot,
          }),
          error: null,
        }
      }

      assert.fail(`Unexpected query ${query.table}:${query.action}:${query.mode}`)
    }

    const req = jsonRequest("http://localhost/api/estimates/estimate_1/share-link", {
      estimate: buildSnapshot({ totalAmount: 1900 }),
      resetCustomerDecision: true,
    }, {
      headers: bearerHeader(),
    })

    const res = await customerShareLinkPost(req, { params: Promise.resolve({ estimateId: "estimate_1" }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.shareUrl, existingUrl)
    assert.equal(data.portal.status, "shared")
    assert.equal(data.portal.changeRequestedAt, undefined)
    assert.equal(data.portal.customerNote, undefined)
  })

  test("POST /api/estimates/:estimateId/share-link rejects paid quote decision resets", async () => {
    setCustomerPortalEnv()
    const state = getTestState()
    const existingUrl = "https://snapquote.test/q/paid-reset-token"
    const paidAt = "2026-05-29T12:00:00.000Z"

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "upsert") {
        return { data: [], error: null }
      }

      if (query.table === "estimate_share_links" && query.action === "select" && query.mode === "maybeSingle") {
        assertLatestShareLinkLookup(query)
        return {
          data: buildShareRow({
            share_url: existingUrl,
            status: "approved",
            approved_at: "2026-05-29T11:00:00.000Z",
            estimate_snapshot: buildSnapshot({
              paymentCompletedAt: paidAt,
            }),
          }),
          error: null,
        }
      }

      if (query.table === "estimate_share_links" && query.action === "update") {
        assert.fail("paid customer quote links should not be reset")
      }

      return { data: null, error: null }
    }

    const req = jsonRequest("http://localhost/api/estimates/estimate_1/share-link", {
      estimate: buildSnapshot({ paymentCompletedAt: paidAt }),
      resetCustomerDecision: true,
    }, {
      headers: bearerHeader(),
    })

    const res = await customerShareLinkPost(req, { params: Promise.resolve({ estimateId: "estimate_1" }) })
    const data = await res.json()

    assert.equal(res.status, 409)
    assert.equal(data.error.message, "Paid quotes cannot be reset for customer review.")
  })

  test("GET /api/estimates/:estimateId/share-link returns customer response status", async () => {
    setCustomerPortalEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "upsert") {
        return { data: [], error: null }
      }

      if (query.table === "estimate_share_links" && query.action === "select" && query.mode === "maybeSingle") {
        assert.ok(hasEqFilter(query, "user_id", "user-1"))
        assert.ok(hasEqFilter(query, "estimate_id", "estimate_1"))
        assertLatestShareLinkLookup(query)
        return {
          data: buildShareRow({
            status: "change_requested",
            change_requested_at: "2026-05-29T10:00:00.000Z",
            customer_name: "Jordan Lee",
            customer_note: "Please add the disposal line.",
          }),
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = new Request("http://localhost/api/estimates/estimate_1/share-link", {
      headers: bearerHeader(),
    })
    const res = await customerShareLinkGet(req, { params: Promise.resolve({ estimateId: "estimate_1" }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.portal.status, "change_requested")
    assert.equal(data.portal.customerName, "Jordan Lee")
    assert.equal(data.portal.customerNote, "Please add the disposal line.")
  })

  test("GET /api/estimates/:estimateId/share-link treats completed snapshot payments as paid", async () => {
    setCustomerPortalEnv()
    const state = getTestState()
    const paidAt = "2026-05-29T12:00:00.000Z"

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "upsert") {
        return { data: [], error: null }
      }

      if (query.table === "estimate_share_links" && query.action === "select" && query.mode === "maybeSingle") {
        assert.ok(hasEqFilter(query, "user_id", "user-1"))
        assert.ok(hasEqFilter(query, "estimate_id", "estimate_1"))
        assertLatestShareLinkLookup(query)
        return {
          data: buildShareRow({
            status: "viewed",
            viewed_at: "2026-05-29T10:00:00.000Z",
            estimate_snapshot: buildSnapshot({
              paymentCompletedAt: paidAt,
            }),
          }),
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = new Request("http://localhost/api/estimates/estimate_1/share-link", {
      headers: bearerHeader(),
    })
    const res = await customerShareLinkGet(req, { params: Promise.resolve({ estimateId: "estimate_1" }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.portal.status, "viewed")
    assert.equal(data.estimate.paymentStatus, "paid")
    assert.equal(data.estimate.paymentCompletedAt, paidAt)
  })

  test("GET /api/estimates/:estimateId/share-link returns current paid payment state", async () => {
    setCustomerPortalEnv()
    const state = getTestState()
    const paidAt = "2026-05-29T12:00:00.000Z"

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "upsert") {
        return { data: [], error: null }
      }

      if (query.table === "estimate_share_links" && query.action === "select" && query.mode === "maybeSingle") {
        assert.ok(hasEqFilter(query, "user_id", "user-1"))
        assert.ok(hasEqFilter(query, "estimate_id", VALID_ESTIMATE_UUID))
        assertLatestShareLinkLookup(query)
        return {
          data: buildShareRow({
            estimate_id: VALID_ESTIMATE_UUID,
            status: "approved",
            approved_at: "2026-05-29T11:00:00.000Z",
            estimate_snapshot: buildSnapshot({
              paymentLink: "https://pay.example.test/deposit",
              paymentLinkType: "deposit",
            }),
          }),
          error: null,
        }
      }

      if (query.table === "estimates" && query.action === "select" && query.mode === "maybeSingle") {
        assert.ok(hasEqFilter(query, "user_id", "user-1"))
        assert.ok(hasEqFilter(query, "id", VALID_ESTIMATE_UUID))
        return {
          data: {
            status: "paid",
            payment_completed_at: paidAt,
          },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = new Request(`http://localhost/api/estimates/${VALID_ESTIMATE_UUID}/share-link`, {
      headers: bearerHeader(),
    })
    const res = await customerShareLinkGet(req, { params: Promise.resolve({ estimateId: VALID_ESTIMATE_UUID }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.portal.status, "approved")
    assert.equal(data.estimate.paymentStatus, "paid")
    assert.equal(data.estimate.paymentCompletedAt, paidAt)
  })

  test("GET /api/public/quotes/:token returns the quote and marks the link viewed", async () => {
    setCustomerPortalEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "estimate_share_links" && query.action === "select" && query.mode === "maybeSingle") {
        assert.ok(hasEqFilter(query, "token_hash", query.filters[0].value))
        return {
          data: buildShareRow(),
          error: null,
        }
      }

      if (query.table === "estimate_share_links" && query.action === "update" && query.mode === "single") {
        assert.equal(query.payload.status, "viewed")
        assert.ok(query.payload.viewed_at)
        return {
          data: buildShareRow({
            status: "viewed",
            viewed_at: query.payload.viewed_at,
          }),
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = new Request(`http://localhost/api/public/quotes/${VALID_TOKEN}`)
    const res = await publicQuoteGet(req, { params: Promise.resolve({ token: VALID_TOKEN }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.quote.status, "viewed")
    assert.equal(data.quote.estimate.estimateNumber, "EST-2605-101")
    assert.equal(data.quote.business.businessName, "Crew West")

    const analyticsInsert = state.supabase.queryCalls.find(
      (call) => call.table === "analytics_events" && call.action === "insert"
    )
    assert.ok(analyticsInsert)
    assert.equal(analyticsInsert.payload.event_name, "quote_viewed")
    assert.equal(analyticsInsert.payload.user_id, "user-1")
    assert.equal(analyticsInsert.payload.estimate_id, null)
    assert.equal(analyticsInsert.payload.estimate_number, "EST-2605-101")
    assert.equal(analyticsInsert.payload.channel, "customer_portal")
    assert.equal(analyticsInsert.payload.metadata.status, "viewed")
    assert.equal(analyticsInsert.payload.metadata.paymentLinkIncluded, true)
  })

  test("GET /api/public/quotes/:token does not refresh terminal customer decisions", async () => {
    setCustomerPortalEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "estimate_share_links" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: buildShareRow({
            status: "approved",
            viewed_at: null,
            approved_at: "2026-05-29T11:00:00.000Z",
          }),
          error: null,
        }
      }

      assert.notEqual(query.action, "update", "terminal quote views should not rewrite the share link")
      return { data: null, error: null }
    }

    const req = new Request(`http://localhost/api/public/quotes/${VALID_TOKEN}`)
    const res = await publicQuoteGet(req, { params: Promise.resolve({ token: VALID_TOKEN }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.quote.status, "approved")
    assert.equal(data.quote.approvedAt, "2026-05-29T11:00:00.000Z")
    assert.equal(state.supabase.queryCalls.some((call) => call.table === "estimate_share_links" && call.action === "update"), false)
    assert.equal(state.supabase.queryCalls.some((call) => call.table === "analytics_events" && call.action === "insert"), false)
  })

  test("GET /api/public/quotes/:token uses current paid estimate state to close stale payment snapshots", async () => {
    setCustomerPortalEnv()
    const state = getTestState()
    const paidAt = "2026-05-29T12:00:00.000Z"

    state.supabase.queryResolver = async (query) => {
      if (query.table === "estimate_share_links" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: buildShareRow({
            estimate_id: VALID_ESTIMATE_UUID,
            status: "approved",
            approved_at: "2026-05-29T11:00:00.000Z",
            estimate_snapshot: buildSnapshot({
              paymentLink: "https://pay.example.test/stale-paid-link",
              paymentLinkType: "deposit",
            }),
          }),
          error: null,
        }
      }

      if (query.table === "estimates" && query.action === "select" && query.mode === "maybeSingle") {
        assert.ok(hasEqFilter(query, "id", VALID_ESTIMATE_UUID))
        assert.ok(hasEqFilter(query, "user_id", "user-1"))
        return {
          data: {
            status: "paid",
            payment_completed_at: paidAt,
          },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = new Request(`http://localhost/api/public/quotes/${VALID_TOKEN}`)
    const res = await publicQuoteGet(req, { params: Promise.resolve({ token: VALID_TOKEN }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.quote.status, "approved")
    assert.equal(data.quote.estimate.paymentStatus, "paid")
    assert.equal(data.quote.estimate.paymentCompletedAt, paidAt)
    assert.equal(data.quote.estimate.paymentLinkType, "deposit")
  })

  test("POST /api/public/quotes/:token/decision records customer approval", async () => {
    setCustomerPortalEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "estimate_share_links" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: buildShareRow({
            status: "viewed",
            viewed_at: "2026-05-29T10:30:00.000Z",
          }),
          error: null,
        }
      }

      if (query.table === "estimate_share_links" && query.action === "update" && query.mode === "maybeSingle") {
        assert.equal(query.payload.status, "approved")
        assert.equal(query.payload.customer_name, "Jordan Lee")
        assert.equal(query.payload.customer_email, "jordan@example.test")
        assert.ok(query.payload.approved_at)
        return {
          data: buildShareRow({
            status: "approved",
            approved_at: query.payload.approved_at,
            customer_name: query.payload.customer_name,
            customer_email: query.payload.customer_email,
            customer_note: "Looks good.",
          }),
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest(`http://localhost/api/public/quotes/${VALID_TOKEN}/decision`, {
      action: "approve",
      customerName: "Jordan Lee",
      customerEmail: "jordan@example.test",
      message: "Looks good.",
    })

    const res = await publicQuoteDecisionPost(req, { params: Promise.resolve({ token: VALID_TOKEN }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.quote.status, "approved")
    assert.equal(data.quote.customerName, "Jordan Lee")

    const analyticsInsert = state.supabase.queryCalls.find(
      (call) => call.table === "analytics_events" && call.action === "insert"
    )
    assert.ok(analyticsInsert)
    assert.equal(analyticsInsert.payload.event_name, "quote_approved")
    assert.equal(analyticsInsert.payload.user_id, "user-1")
    assert.equal(analyticsInsert.payload.estimate_id, null)
    assert.equal(analyticsInsert.payload.estimate_number, "EST-2605-101")
    assert.equal(analyticsInsert.payload.channel, "customer_portal")
    assert.equal(analyticsInsert.payload.metadata.status, "approved")
    assert.equal(analyticsInsert.payload.metadata.paymentLinkIncluded, true)
  })

  test("POST /api/public/quotes/:token/decision records customer change requests", async () => {
    setCustomerPortalEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "estimate_share_links" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: buildShareRow({
            status: "viewed",
            viewed_at: "2026-05-29T10:30:00.000Z",
          }),
          error: null,
        }
      }

      if (query.table === "estimate_share_links" && query.action === "update" && query.mode === "maybeSingle") {
        assert.equal(query.payload.status, "change_requested")
        assert.equal(query.payload.approved_at, null)
        assert.equal(query.payload.customer_name, "Jordan Lee")
        assert.equal(query.payload.customer_note, "Please include disposal haul-away.")
        assert.ok(query.payload.change_requested_at)
        return {
          data: buildShareRow({
            status: "change_requested",
            approved_at: null,
            change_requested_at: query.payload.change_requested_at,
            customer_name: query.payload.customer_name,
            customer_note: query.payload.customer_note,
          }),
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest(`http://localhost/api/public/quotes/${VALID_TOKEN}/decision`, {
      action: "request_changes",
      customerName: "Jordan Lee",
      message: "Please include disposal haul-away.",
    })

    const res = await publicQuoteDecisionPost(req, { params: Promise.resolve({ token: VALID_TOKEN }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.quote.status, "change_requested")
    assert.equal(data.quote.customerNote, "Please include disposal haul-away.")

    const analyticsInsert = state.supabase.queryCalls.find(
      (call) => call.table === "analytics_events" && call.action === "insert"
    )
    assert.ok(analyticsInsert)
    assert.equal(analyticsInsert.payload.event_name, "quote_change_requested")
    assert.equal(analyticsInsert.payload.user_id, "user-1")
    assert.equal(analyticsInsert.payload.estimate_id, null)
    assert.equal(analyticsInsert.payload.estimate_number, "EST-2605-101")
    assert.equal(analyticsInsert.payload.channel, "customer_portal")
    assert.equal(analyticsInsert.payload.metadata.status, "change_requested")
    assert.equal(analyticsInsert.payload.metadata.hasCustomerNote, true)
  })

  test("POST /api/public/quotes/:token/decision rejects paid quotes without reopening customer status", async () => {
    setCustomerPortalEnv()
    const state = getTestState()
    const paidAt = "2026-05-29T12:00:00.000Z"

    state.supabase.queryResolver = async (query) => {
      if (query.table === "estimate_share_links" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: buildShareRow({
            estimate_id: VALID_ESTIMATE_UUID,
            status: "approved",
            approved_at: "2026-05-29T11:15:00.000Z",
            estimate_snapshot: buildSnapshot({
              paymentLink: "https://pay.example.test/deposit",
              paymentLinkType: "deposit",
            }),
          }),
          error: null,
        }
      }

      if (query.table === "estimates" && query.action === "select" && query.mode === "maybeSingle") {
        assert.ok(hasEqFilter(query, "id", VALID_ESTIMATE_UUID))
        assert.ok(hasEqFilter(query, "user_id", "user-1"))
        return {
          data: {
            status: "paid",
            payment_completed_at: paidAt,
          },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest(`http://localhost/api/public/quotes/${VALID_TOKEN}/decision`, {
      action: "request_changes",
      customerName: "Jordan Lee",
      message: "Please change the scope after payment.",
    })

    const res = await publicQuoteDecisionPost(req, { params: Promise.resolve({ token: VALID_TOKEN }) })
    const data = await res.json()

    assert.equal(res.status, 409)
    assert.equal(data.error.message, "This quote is already paid.")
    assert.equal(state.supabase.queryCalls.some((call) => call.table === "estimate_share_links" && call.action === "update"), false)
    assert.equal(state.supabase.queryCalls.some((call) => call.table === "analytics_events" && call.action === "insert"), false)
  })

  test("POST /api/public/quotes/:token/decision treats repeated approved decisions as idempotent", async () => {
    setCustomerPortalEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "estimate_share_links" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: buildShareRow({
            status: "approved",
            approved_at: "2026-05-29T11:15:00.000Z",
            customer_name: "Jordan Lee",
            customer_email: "jordan@example.test",
            customer_note: "Looks good.",
          }),
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest(`http://localhost/api/public/quotes/${VALID_TOKEN}/decision`, {
      action: "approve",
      customerName: "Jordan Lee",
      customerEmail: "jordan@example.test",
      message: "Looks good.",
    })

    const res = await publicQuoteDecisionPost(req, { params: Promise.resolve({ token: VALID_TOKEN }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.quote.status, "approved")
    assert.equal(data.quote.customerName, "Jordan Lee")
    assert.equal(state.supabase.queryCalls.some((call) => call.table === "estimate_share_links" && call.action === "update"), false)
    assert.equal(state.supabase.queryCalls.some((call) => call.table === "analytics_events" && call.action === "insert"), false)
  })

  test("POST /api/public/quotes/:token/decision rejects conflicting terminal decisions", async () => {
    setCustomerPortalEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "estimate_share_links" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: buildShareRow({
            status: "approved",
            approved_at: "2026-05-29T11:15:00.000Z",
            customer_name: "Jordan Lee",
            customer_email: "jordan@example.test",
            customer_note: "Looks good.",
          }),
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest(`http://localhost/api/public/quotes/${VALID_TOKEN}/decision`, {
      action: "request_changes",
      customerName: "Jordan Lee",
      message: "Please change this after approval.",
    })

    const res = await publicQuoteDecisionPost(req, { params: Promise.resolve({ token: VALID_TOKEN }) })
    const data = await res.json()

    assert.equal(res.status, 409)
    assert.equal(data.error.message, "This quote is already approved.")
    assert.equal(state.supabase.queryCalls.some((call) => call.table === "estimate_share_links" && call.action === "update"), false)
    assert.equal(state.supabase.queryCalls.some((call) => call.table === "analytics_events" && call.action === "insert"), false)
  })

  test("POST /api/public/quotes/:token/decision rejects empty change requests", async () => {
    setCustomerPortalEnv()
    const state = getTestState()

    const req = jsonRequest(`http://localhost/api/public/quotes/${VALID_TOKEN}/decision`, {
      action: "request_changes",
      customerName: "Jordan Lee",
      message: "   ",
    })

    const res = await publicQuoteDecisionPost(req, { params: Promise.resolve({ token: VALID_TOKEN }) })
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.equal(data.error.message, "Invalid customer quote decision")
    assert.equal(state.supabase.queryCalls.some((call) => call.table === "estimate_share_links" && call.action === "update"), false)
  })
})

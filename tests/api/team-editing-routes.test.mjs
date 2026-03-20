import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"

import { bearerHeader, jsonRequest } from "../helpers/http.mjs"
import { getTestState, resetTestState } from "../mocks/state.mjs"

import { GET as teamEstimateDetailGet, PATCH as teamEstimatePatch } from "../../app/api/team/estimates/[estimateId]/route.ts"
import { GET as teamEstimateSessionGet, POST as teamEstimateSessionPost } from "../../app/api/team/estimates/[estimateId]/session/route.ts"

const RELEVANT_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]

function clearRelevantEnv() {
  for (const key of RELEVANT_ENV_KEYS) {
    delete process.env[key]
  }
}

function setTeamEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role"
}

function hasEqFilter(query, column, value) {
  return query.filters?.some((filter) => filter.op === "eq" && filter.column === column && filter.value === value)
}

function futureIso(minutes = 5) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

function buildEstimateRow(overrides = {}) {
  return {
    id: "estimate_1",
    user_id: "user-2",
    estimate_number: "SQ-201",
    total_amount: 2200,
    tax_rate: 5,
    tax_amount: 110,
    ai_summary: "Replace two fixtures and patch drywall openings.",
    created_at: "2026-03-20T16:00:00.000Z",
    updated_at: "2026-03-20T16:10:00.000Z",
    sent_at: null,
    status: "draft",
    estimate_items: [
      {
        id: "item_1",
        item_number: 1,
        category: "PARTS",
        unit: "ea",
        description: "Fixture replacement",
        quantity: 2,
        unit_price: 450,
        total: 900,
      },
    ],
    estimate_sections: [
      {
        id: "section_db_1",
        local_id: "section_1",
        division_code: "09",
        name: "Finish Work",
        sort_order: 0,
        estimate_section_items: [
          {
            id: "section_item_1",
            local_id: "section_item_local_1",
            item_number: 1,
            category: "LABOR",
            unit: "hr",
            description: "Patch and sand drywall",
            quantity: 4,
            unit_price: 95,
            total: 380,
          },
        ],
      },
    ],
    clients: {
      name: "Harbor Dental",
      address: "44 Bay St",
    },
    profiles: {
      business_name: "Crew West",
    },
    ...overrides,
  }
}

beforeEach(() => {
  resetTestState()
  clearRelevantEnv()
})

describe("Team estimate editing routes", () => {
  test("GET /api/team/estimates/:estimateId returns the full shared estimate payload", async () => {
    setTeamEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "upsert") {
        return { data: [], error: null }
      }

      if (query.table === "team_workspace_members" && query.action === "select" && query.mode === "maybeSingle" && hasEqFilter(query, "user_id", "user-1")) {
        return {
          data: {
            workspace_id: "workspace_1",
            user_id: "user-1",
            role: "admin",
            joined_at: "2026-03-20T15:00:00.000Z",
            invited_by: "user-2",
          },
          error: null,
        }
      }

      if (query.table === "team_workspace_members" && query.action === "select" && query.mode === "execute" && hasEqFilter(query, "workspace_id", "workspace_1")) {
        return {
          data: [{ user_id: "user-1" }, { user_id: "user-2" }],
          error: null,
        }
      }

      if (query.table === "estimates" && query.action === "select" && query.mode === "maybeSingle" && hasEqFilter(query, "id", "estimate_1")) {
        return {
          data: buildEstimateRow(),
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = new Request("http://localhost/api/team/estimates/estimate_1", {
      method: "GET",
      headers: bearerHeader(),
    })

    const res = await teamEstimateDetailGet(req, { params: Promise.resolve({ estimateId: "estimate_1" }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.estimate.estimateId, "estimate_1")
    assert.equal(data.estimate.ownerBusinessName, "Crew West")
    assert.equal(data.estimate.sections.length, 1)
  })

  test("GET /api/team/estimates/:estimateId/session returns another editor as read-only lock", async () => {
    setTeamEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "upsert") {
        return { data: [], error: null }
      }

      if (query.table === "team_workspace_members" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: {
            workspace_id: "workspace_1",
            user_id: "user-1",
            role: "member",
            joined_at: "2026-03-20T15:00:00.000Z",
            invited_by: "user-2",
          },
          error: null,
        }
      }

      if (query.table === "team_workspace_members" && query.action === "select" && query.mode === "execute") {
        return {
          data: [{ user_id: "user-1" }, { user_id: "user-2" }],
          error: null,
        }
      }

      if (query.table === "estimates" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: buildEstimateRow(),
          error: null,
        }
      }

      if (query.table === "team_estimate_sessions" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: {
            estimate_id: "estimate_1",
            workspace_id: "workspace_1",
            editor_user_id: "user-2",
            acquired_at: "2026-03-20T16:00:00.000Z",
            heartbeat_at: "2026-03-20T16:01:00.000Z",
            expires_at: futureIso(),
            created_at: "2026-03-20T16:00:00.000Z",
            updated_at: "2026-03-20T16:01:00.000Z",
          },
          error: null,
        }
      }

      if (query.table === "profiles" && query.action === "select" && query.mode === "maybeSingle" && hasEqFilter(query, "id", "user-2")) {
        return {
          data: {
            business_name: "Crew West",
            email: "crew-west@snapquote.test",
          },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = new Request("http://localhost/api/team/estimates/estimate_1/session", {
      method: "GET",
      headers: bearerHeader(),
    })

    const res = await teamEstimateSessionGet(req, { params: Promise.resolve({ estimateId: "estimate_1" }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.session.active, true)
    assert.equal(data.session.ownedByCaller, false)
    assert.equal(data.session.canEdit, false)
    assert.equal(data.session.editor.businessName, "Crew West")
  })

  test("POST /api/team/estimates/:estimateId/session takeover replaces the active editor", async () => {
    setTeamEnv()
    const state = getTestState()
    let currentEditorUserId = "user-2"

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "upsert") {
        return { data: [], error: null }
      }

      if (query.table === "team_workspace_members" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: {
            workspace_id: "workspace_1",
            user_id: "user-1",
            role: "admin",
            joined_at: "2026-03-20T15:00:00.000Z",
            invited_by: "user-2",
          },
          error: null,
        }
      }

      if (query.table === "team_workspace_members" && query.action === "select" && query.mode === "execute") {
        return {
          data: [{ user_id: "user-1" }, { user_id: "user-2" }],
          error: null,
        }
      }

      if (query.table === "estimates" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: buildEstimateRow(),
          error: null,
        }
      }

      if (query.table === "team_estimate_sessions" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: {
            estimate_id: "estimate_1",
            workspace_id: "workspace_1",
            editor_user_id: currentEditorUserId,
            acquired_at: "2026-03-20T16:00:00.000Z",
            heartbeat_at: "2026-03-20T16:01:00.000Z",
            expires_at: futureIso(),
            created_at: "2026-03-20T16:00:00.000Z",
            updated_at: "2026-03-20T16:01:00.000Z",
          },
          error: null,
        }
      }

      if (query.table === "team_estimate_sessions" && query.action === "upsert") {
        currentEditorUserId = query.payload.editor_user_id
        return { data: [], error: null }
      }

      if (query.table === "profiles" && query.action === "select" && query.mode === "maybeSingle" && hasEqFilter(query, "id", "user-1")) {
        return {
          data: {
            business_name: "North Shore Electric",
            email: "owner@snapquote.test",
          },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest("http://localhost/api/team/estimates/estimate_1/session", {
      action: "takeover",
    }, {
      headers: bearerHeader(),
    })

    const res = await teamEstimateSessionPost(req, { params: Promise.resolve({ estimateId: "estimate_1" }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.session.active, true)
    assert.equal(data.session.ownedByCaller, true)
    assert.equal(data.session.editor.businessName, "North Shore Electric")
  })

  test("PATCH /api/team/estimates/:estimateId returns 409 without an active claimed session", async () => {
    setTeamEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "upsert") {
        return { data: [], error: null }
      }

      if (query.table === "team_workspace_members" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: {
            workspace_id: "workspace_1",
            user_id: "user-1",
            role: "member",
            joined_at: "2026-03-20T15:00:00.000Z",
            invited_by: "user-2",
          },
          error: null,
        }
      }

      if (query.table === "team_workspace_members" && query.action === "select" && query.mode === "execute") {
        return {
          data: [{ user_id: "user-1" }, { user_id: "user-2" }],
          error: null,
        }
      }

      if (query.table === "estimates" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: buildEstimateRow(),
          error: null,
        }
      }

      if (query.table === "team_estimate_sessions" && query.action === "select" && query.mode === "maybeSingle") {
        return { data: null, error: null }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest("http://localhost/api/team/estimates/estimate_1", {
      clientName: "Harbor Dental",
      clientAddress: "44 Bay St",
      summary_note: "Updated summary",
      status: "draft",
      taxRate: 5,
      taxAmount: 110,
      totalAmount: 2200,
      items: [
        {
          id: "item_1",
          itemNumber: 1,
          category: "PARTS",
          description: "Fixture replacement",
          quantity: 2,
          unit: "ea",
          unit_price: 450,
          total: 900,
        },
      ],
    }, {
      method: "PATCH",
      headers: bearerHeader(),
    })

    const res = await teamEstimatePatch(req, { params: Promise.resolve({ estimateId: "estimate_1" }) })
    const data = await res.json()

    assert.equal(res.status, 409)
    assert.match(data.error.message, /claim the team editing session/i)
  })

  test("PATCH /api/team/estimates/:estimateId stores shared edits when caller owns the session", async () => {
    setTeamEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "upsert") {
        return { data: [], error: null }
      }

      if (query.table === "team_workspace_members" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: {
            workspace_id: "workspace_1",
            user_id: "user-1",
            role: "admin",
            joined_at: "2026-03-20T15:00:00.000Z",
            invited_by: "user-2",
          },
          error: null,
        }
      }

      if (query.table === "team_workspace_members" && query.action === "select" && query.mode === "execute") {
        return {
          data: [{ user_id: "user-1" }, { user_id: "user-2" }],
          error: null,
        }
      }

      if (query.table === "estimates" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: buildEstimateRow({
            ai_summary: "Updated summary",
            updated_at: "2026-03-20T16:25:00.000Z",
          }),
          error: null,
        }
      }

      if (query.table === "team_estimate_sessions" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: {
            estimate_id: "estimate_1",
            workspace_id: "workspace_1",
            editor_user_id: "user-1",
            acquired_at: "2026-03-20T16:00:00.000Z",
            heartbeat_at: "2026-03-20T16:01:00.000Z",
            expires_at: futureIso(),
            created_at: "2026-03-20T16:00:00.000Z",
            updated_at: "2026-03-20T16:01:00.000Z",
          },
          error: null,
        }
      }

      if (query.table === "profiles" && query.action === "select" && query.mode === "maybeSingle" && hasEqFilter(query, "id", "user-1")) {
        return {
          data: {
            business_name: "North Shore Electric",
            email: "owner@snapquote.test",
          },
          error: null,
        }
      }

      if (query.table === "clients" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: { id: "client_1" },
          error: null,
        }
      }

      if (query.table === "estimates" && query.action === "update") {
        return { data: [], error: null }
      }

      if (query.table === "estimate_items" && query.action === "delete") {
        return { data: [], error: null }
      }

      if (query.table === "estimate_items" && query.action === "insert") {
        return { data: [], error: null }
      }

      if (query.table === "estimate_sections" && query.action === "delete") {
        return { data: [], error: null }
      }

      if (query.table === "estimate_sections" && query.action === "insert" && query.mode === "execute") {
        return {
          data: [{ id: "section_db_2", local_id: "section_1" }],
          error: null,
        }
      }

      if (query.table === "estimate_section_items" && query.action === "insert") {
        return { data: [], error: null }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest("http://localhost/api/team/estimates/estimate_1", {
      clientName: "Harbor Dental",
      clientAddress: "44 Bay St",
      summary_note: "Updated summary",
      status: "draft",
      taxRate: 5,
      taxAmount: 110,
      totalAmount: 2200,
      items: [
        {
          id: "item_1",
          itemNumber: 1,
          category: "PARTS",
          description: "Fixture replacement",
          quantity: 2,
          unit: "ea",
          unit_price: 450,
          total: 900,
        },
      ],
      sections: [
        {
          id: "section_1",
          name: "Finish Work",
          divisionCode: "09",
          items: [
            {
              id: "section_item_local_1",
              itemNumber: 1,
              category: "LABOR",
              description: "Patch and sand drywall",
              quantity: 4,
              unit: "hr",
              unit_price: 95,
              total: 380,
            },
          ],
        },
      ],
    }, {
      method: "PATCH",
      headers: bearerHeader(),
    })

    const res = await teamEstimatePatch(req, { params: Promise.resolve({ estimateId: "estimate_1" }) })
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.estimate.summary_note, "Updated summary")

    const updateCall = state.supabase.queryCalls.find(
      (query) => query.table === "estimates" && query.action === "update"
    )
    assert.ok(updateCall)
    assert.equal(updateCall.payload.ai_summary, "Updated summary")
  })
})

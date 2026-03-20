import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"

import { bearerHeader, jsonRequest } from "../helpers/http.mjs"
import { getTestState, resetTestState } from "../mocks/state.mjs"

import { GET as teamWorkspaceGet } from "../../app/api/team/workspace/route.ts"
import { POST as teamInvitesPost } from "../../app/api/team/invites/route.ts"
import { POST as teamInviteAcceptPost } from "../../app/api/team/invites/accept/route.ts"
import { GET as teamEstimatesGet } from "../../app/api/team/estimates/route.ts"

const RELEVANT_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
]

function clearRelevantEnv() {
  for (const key of RELEVANT_ENV_KEYS) {
    delete process.env[key]
  }
}

function setTeamEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role"
  process.env.NEXT_PUBLIC_APP_URL = "https://app.snapquote.test"
}

function hasEqFilter(query, column, value) {
  return query.filters?.some((filter) => filter.op === "eq" && filter.column === column && filter.value === value)
}

function hasInFilter(query, column, value) {
  return query.filters?.some((filter) => filter.op === "in" && filter.column === column && JSON.stringify(filter.value) === JSON.stringify(value))
}

function futureIso(hours = 24) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

function pastIso(hours = 24) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

beforeEach(() => {
  resetTestState()
  clearRelevantEnv()
})

describe("Team workspace routes", () => {
  test("GET /api/team/workspace bootstraps a workspace for Team plan owners", async () => {
    setTeamEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "upsert") {
        return { data: [], error: null }
      }

      if (query.table === "team_workspace_members" && query.action === "select" && query.mode === "maybeSingle" && hasEqFilter(query, "user_id", "user-1")) {
        return { data: null, error: null }
      }

      if (query.table === "profiles" && query.action === "select" && query.mode === "maybeSingle" && query.selectColumns?.includes("plan_tier")) {
        return {
          data: {
            plan_tier: "team",
            stripe_subscription_status: "active",
            referral_trial_ends_at: null,
            referral_bonus_ends_at: null,
          },
          error: null,
        }
      }

      if (query.table === "team_workspaces" && query.action === "select" && query.mode === "maybeSingle" && hasEqFilter(query, "owner_user_id", "user-1")) {
        return { data: null, error: null }
      }

      if (query.table === "profiles" && query.action === "select" && query.mode === "maybeSingle" && query.selectColumns?.includes("business_name")) {
        return {
          data: { business_name: "North Shore Electric" },
          error: null,
        }
      }

      if (query.table === "team_workspaces" && query.action === "insert" && query.mode === "single") {
        return {
          data: {
            id: "workspace_1",
            owner_user_id: "user-1",
            name: "North Shore Electric Team",
            created_at: "2026-03-20T16:00:00.000Z",
            updated_at: "2026-03-20T16:00:00.000Z",
          },
          error: null,
        }
      }

      if (query.table === "team_workspace_members" && query.action === "insert" && query.mode === "single") {
        return {
          data: {
            workspace_id: "workspace_1",
            user_id: "user-1",
            role: "owner",
            joined_at: "2026-03-20T16:00:00.000Z",
            invited_by: "user-1",
          },
          error: null,
        }
      }

      if (query.table === "team_workspace_members" && query.action === "select" && query.mode === "execute" && hasEqFilter(query, "workspace_id", "workspace_1")) {
        return {
          data: [
            {
              workspace_id: "workspace_1",
              user_id: "user-1",
              role: "owner",
              joined_at: "2026-03-20T16:00:00.000Z",
              invited_by: "user-1",
            },
          ],
          error: null,
        }
      }

      if (query.table === "profiles" && query.action === "select" && query.mode === "execute" && hasInFilter(query, "id", ["user-1"])) {
        return {
          data: [
            {
              id: "user-1",
              business_name: "North Shore Electric",
              email: "owner@snapquote.test",
            },
          ],
          error: null,
        }
      }

      if (query.table === "team_workspace_invites" && query.action === "select" && query.mode === "execute") {
        return { data: [], error: null }
      }

      return { data: null, error: null }
    }

    const req = new Request("http://localhost/api/team/workspace", {
      method: "GET",
      headers: bearerHeader(),
    })

    const res = await teamWorkspaceGet(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.eligible, true)
    assert.equal(data.hasWorkspace, true)
    assert.equal(data.workspace.name, "North Shore Electric Team")
    assert.equal(data.workspace.role, "owner")
    assert.equal(data.members.length, 1)
    assert.equal(data.pendingInvites.length, 0)
  })

  test("POST /api/team/invites returns 409 when a pending invite already exists", async () => {
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
            role: "owner",
            joined_at: "2026-03-20T16:00:00.000Z",
            invited_by: "user-1",
          },
          error: null,
        }
      }

      if (query.table === "profiles" && query.action === "select" && query.mode === "maybeSingle" && query.selectColumns?.includes("plan_tier")) {
        return {
          data: {
            plan_tier: "team",
            stripe_subscription_status: "active",
            referral_trial_ends_at: null,
            referral_bonus_ends_at: null,
          },
          error: null,
        }
      }

      if (query.table === "team_workspaces" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: {
            id: "workspace_1",
            owner_user_id: "user-1",
            name: "North Shore Electric Team",
            created_at: "2026-03-20T16:00:00.000Z",
            updated_at: "2026-03-20T16:00:00.000Z",
          },
          error: null,
        }
      }

      if (query.table === "team_workspace_invites" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: {
            id: "invite_1",
            workspace_id: "workspace_1",
            email: "tech@snapquote.test",
            role: "member",
            token: "existing_token",
            status: "pending",
            invited_by: "user-1",
            accepted_by: null,
            expires_at: futureIso(),
            accepted_at: null,
            created_at: "2026-03-20T16:00:00.000Z",
            updated_at: "2026-03-20T16:00:00.000Z",
          },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest("http://localhost/api/team/invites", {
      email: "tech@snapquote.test",
      role: "member",
    }, {
      headers: bearerHeader(),
    })

    const res = await teamInvitesPost(req)
    const data = await res.json()

    assert.equal(res.status, 409)
    assert.match(data.error.message, /pending invite already exists/i)
  })

  test("POST /api/team/invites/accept returns 410 for expired tokens", async () => {
    setTeamEnv()
    const state = getTestState()

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "upsert") {
        return { data: [], error: null }
      }

      if (query.table === "team_workspace_invites" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: {
            id: "invite_expired",
            workspace_id: "workspace_1",
            email: "tech@snapquote.test",
            role: "member",
            token: "expired_token",
            status: "pending",
            invited_by: "user-9",
            accepted_by: null,
            expires_at: pastIso(),
            accepted_at: null,
            created_at: "2026-03-12T16:00:00.000Z",
            updated_at: "2026-03-12T16:00:00.000Z",
          },
          error: null,
        }
      }

      if (query.table === "team_workspace_invites" && query.action === "update") {
        return { data: [], error: null }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest("http://localhost/api/team/invites/accept", {
      token: "expired_token",
    }, {
      headers: bearerHeader(),
    })

    const res = await teamInviteAcceptPost(req)
    const data = await res.json()

    assert.equal(res.status, 410)
    assert.match(data.error.message, /expired/i)
  })

  test("POST /api/team/invites/accept joins the workspace for a valid invite", async () => {
    setTeamEnv()
    const state = getTestState()
    state.routeAuth.result = {
      ok: true,
      userId: "invitee_1",
    }

    state.supabase.queryResolver = async (query) => {
      if (query.table === "profiles" && query.action === "upsert") {
        return { data: [], error: null }
      }

      if (query.table === "team_workspace_invites" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: {
            id: "invite_live",
            workspace_id: "workspace_1",
            email: "tech@snapquote.test",
            role: "member",
            token: "live_token",
            status: "pending",
            invited_by: "user-1",
            accepted_by: null,
            expires_at: futureIso(),
            accepted_at: null,
            created_at: "2026-03-20T16:00:00.000Z",
            updated_at: "2026-03-20T16:00:00.000Z",
          },
          error: null,
        }
      }

      if (query.table === "team_workspace_members" && query.action === "select" && query.mode === "maybeSingle" && hasEqFilter(query, "user_id", "invitee_1")) {
        return { data: null, error: null }
      }

      if (query.table === "team_workspaces" && query.action === "select" && query.mode === "maybeSingle") {
        return {
          data: {
            id: "workspace_1",
            owner_user_id: "user-1",
            name: "North Shore Electric Team",
            created_at: "2026-03-20T16:00:00.000Z",
            updated_at: "2026-03-20T16:00:00.000Z",
          },
          error: null,
        }
      }

      if (query.table === "team_workspace_members" && query.action === "insert") {
        return { data: [], error: null }
      }

      if (query.table === "team_workspace_invites" && query.action === "update") {
        return { data: [], error: null }
      }

      return { data: null, error: null }
    }

    const req = jsonRequest("http://localhost/api/team/invites/accept", {
      token: "live_token",
    }, {
      headers: bearerHeader(),
    })

    const res = await teamInviteAcceptPost(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.joined, true)
    assert.equal(data.workspace.id, "workspace_1")
    assert.equal(data.workspace.role, "member")
  })

  test("GET /api/team/estimates returns the shared synced estimate feed", async () => {
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
            role: "owner",
            joined_at: "2026-03-20T16:00:00.000Z",
            invited_by: "user-1",
          },
          error: null,
        }
      }

      if (query.table === "team_workspace_members" && query.action === "select" && query.mode === "execute" && hasEqFilter(query, "workspace_id", "workspace_1")) {
        return {
          data: [
            { user_id: "user-1" },
            { user_id: "user-2" },
          ],
          error: null,
        }
      }

      if (query.table === "estimates" && query.action === "select" && query.mode === "execute" && hasInFilter(query, "user_id", ["user-1", "user-2"])) {
        return {
          data: [
            {
              id: "estimate_2",
              user_id: "user-2",
              estimate_number: "SQ-102",
              total_amount: 980,
              status: "sent",
              updated_at: "2026-03-20T16:20:00.000Z",
              created_at: "2026-03-20T16:00:00.000Z",
              clients: { name: "Blue Lantern Cafe" },
              profiles: { business_name: "Second Crew" },
            },
            {
              id: "estimate_1",
              user_id: "user-1",
              estimate_number: "SQ-101",
              total_amount: 2450,
              status: "paid",
              updated_at: "2026-03-20T16:10:00.000Z",
              created_at: "2026-03-20T15:00:00.000Z",
              clients: { name: "North Ridge HOA" },
              profiles: { business_name: "North Shore Electric" },
            },
          ],
          error: null,
        }
      }

      return { data: null, error: null }
    }

    const req = new Request("http://localhost/api/team/estimates?limit=10", {
      method: "GET",
      headers: bearerHeader(),
    })

    const res = await teamEstimatesGet(req)
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.ok, true)
    assert.equal(data.workspaceId, "workspace_1")
    assert.equal(data.count, 2)
    assert.equal(data.estimates[0].estimateId, "estimate_2")
    assert.equal(data.estimates[0].ownerBusinessName, "Second Crew")
    assert.equal(data.estimates[1].status, "paid")
  })
})

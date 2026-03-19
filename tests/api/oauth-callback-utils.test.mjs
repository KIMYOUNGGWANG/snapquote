import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  buildLoginErrorRedirectPath,
  buildPostAuthRedirectPath,
  normalizeIntent,
  normalizeNextPath,
  normalizeOAuthError,
  resolveOAuthCallbackState,
} from "../../lib/auth/oauth-callback.ts"

describe("OAuth callback helpers", () => {
  test("normalizeNextPath allows only internal paths", () => {
    assert.equal(normalizeNextPath("/history"), "/history")
    assert.equal(normalizeNextPath("/profile?tab=billing"), "/profile?tab=billing")
    assert.equal(normalizeNextPath("https://evil.example"), "/")
    assert.equal(normalizeNextPath("//evil.example"), "/")
    assert.equal(normalizeNextPath(""), "/")
  })

  test("normalizeIntent allows simple safe intent values", () => {
    assert.equal(normalizeIntent("payment-link"), "payment-link")
    assert.equal(normalizeIntent(" quick quote "), "")
    assert.equal(normalizeIntent("a".repeat(49)), "")
    assert.equal(normalizeIntent(""), "")
  })

  test("buildPostAuthRedirectPath preserves query and appends sanitized intent", () => {
    const path = buildPostAuthRedirectPath("/new-estimate?from=login", "payment-link")
    assert.equal(path, "/new-estimate?from=login&intent=payment-link")
  })

  test("buildLoginErrorRedirectPath keeps next path and sets oauth_error", () => {
    const path = buildLoginErrorRedirectPath("/history?source=oauth", "payment-link", "Auth failed")
    assert.equal(path, "/login?next=%2Fhistory%3Fsource%3Doauth&intent=payment-link&oauth_error=Auth+failed")
  })

  test("normalizeOAuthError trims and limits long messages", () => {
    const normalized = normalizeOAuthError("   Something went wrong   ")
    assert.equal(normalized, "Something went wrong")

    const long = normalizeOAuthError("x".repeat(500))
    assert.equal(long.length, 180)
  })

  test("resolveOAuthCallbackState preserves next path and intent for timeout recovery", () => {
    const state = resolveOAuthCallbackState(
      new URLSearchParams("next=/new-estimate?from=login&intent=payment-link")
    )

    assert.equal(state.nextPath, "/new-estimate?from=login")
    assert.equal(state.intent, "payment-link")
    assert.equal(state.postAuthRedirectPath, "/new-estimate?from=login&intent=payment-link")
    assert.equal(
      state.timeoutRedirectPath,
      "/login?next=%2Fnew-estimate%3Ffrom%3Dlogin&intent=payment-link&oauth_error=Sign+in+timed+out.+Please+try+again."
    )
  })
})

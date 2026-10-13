import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { isEstimatePaidLike } from "../../lib/estimate-payment-state.ts"

describe("follow-up service payment closure", () => {
  test("treats paid status and payment timestamps as paid-like", () => {
    assert.equal(isEstimatePaidLike({ status: "paid" }), true)
    assert.equal(isEstimatePaidLike({ status: "sent", paymentCompletedAt: "2026-05-29T12:00:00.000Z" }), true)
    assert.equal(isEstimatePaidLike({ status: "sent", payment_completed_at: "2026-05-29T12:00:00.000Z" }), true)
    assert.equal(isEstimatePaidLike({ status: "sent", paymentCompletedAt: "   " }), false)
    assert.equal(isEstimatePaidLike({ status: "sent", paymentCompletedAt: "not-a-date" }), false)
  })
})

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { computeBalanceDue, isFullyPaid, toCents } from '../../lib/estimates/balance.ts'

describe('estimate balance', () => {
  test('toCents rounds to integer cents', () => {
    assert.equal(toCents(0.1 + 0.2), 30)
    assert.equal(toCents(1739.99), 173999)
  })

  test('computeBalanceDue subtracts payments in dollars', () => {
    assert.equal(computeBalanceDue(1740, 500), 1240)
    assert.equal(computeBalanceDue(0.3, 0.1), 0.2)
  })

  test('computeBalanceDue never goes below zero', () => {
    assert.equal(computeBalanceDue(100, 150), 0)
  })

  test('isFullyPaid compares in cents and rejects a zero total', () => {
    assert.equal(isFullyPaid(1740, 1739.99), false)
    assert.equal(isFullyPaid(1740, 1740), true)
    assert.equal(isFullyPaid(0, 0), false)
  })
})

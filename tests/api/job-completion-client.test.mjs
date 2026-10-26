import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  applyExtraWork,
  buildCompletionMessage,
  buildExtraWorkSection,
  buildReviewItems,
  canCompleteJob,
  getCompletionAction,
  getUpdatedAtAfterServer,
  parseMoneyInput,
} from '../../lib/job-completion.ts'
import { buildCustomerQuoteSnapshot } from '../../lib/customer-portal-client.ts'
import { resolveLwwSyncAction } from '../../lib/sync-resolution.ts'

function makeEstimate(overrides = {}) {
  return {
    id: 'est-1',
    estimateNumber: 'EST-1042',
    items: [
      { id: 'item-1', itemNumber: 1, category: 'LABOR', description: 'Remove old drain', quantity: 1, unit: 'LS', unit_price: 1000, total: 1000 },
    ],
    summary_note: '',
    clientName: 'Rivera',
    clientAddress: '1 Main',
    taxRate: 13,
    taxAmount: 130,
    totalAmount: 1130,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    status: 'sent',
    customerPortalStatus: 'approved',
    ...overrides,
  }
}

describe('buildExtraWorkSection', () => {
  test('builds an "Added on site" section with one LS service line per entry', () => {
    const section = buildExtraWorkSection([
      { description: '  Extra valve ', amount: 120 },
      { description: 'Haul away', amount: 45.5 },
    ])

    assert.equal(section.name, 'Added on site')
    assert.equal(section.addedOnSite, true)
    assert.equal(typeof section.id, 'string')
    assert.equal(section.items.length, 2)
    assert.deepEqual(
      section.items.map(({ itemNumber, category, description, quantity, unit, unit_price, total }) => ({ itemNumber, category, description, quantity, unit, unit_price, total })),
      [
        { itemNumber: 1, category: 'SERVICE', description: 'Extra valve', quantity: 1, unit: 'LS', unit_price: 120, total: 120 },
        { itemNumber: 2, category: 'SERVICE', description: 'Haul away', quantity: 1, unit: 'LS', unit_price: 45.5, total: 45.5 },
      ]
    )
    assert.notEqual(section.items[0].id, section.items[1].id)
  })

  test('skips blank or non-positive lines', () => {
    const section = buildExtraWorkSection([
      { description: '   ', amount: 50 },
      { description: 'Free check', amount: 0 },
      { description: 'Real', amount: 10 },
    ])
    assert.deepEqual(section.items.map((item) => item.description), ['Real'])
  })
})

describe('canCompleteJob', () => {
  test('approved sent quote can be completed', () => {
    assert.equal(canCompleteJob(makeEstimate()), true)
  })

  test('sent quote that is not approved cannot be completed', () => {
    assert.equal(canCompleteJob(makeEstimate({ customerPortalStatus: 'viewed' })), false)
    assert.equal(canCompleteJob(makeEstimate({ customerPortalStatus: undefined })), false)
  })

  test('deposit-paid legacy quote can be completed', () => {
    assert.equal(canCompleteJob(makeEstimate({ status: 'paid', paymentLinkType: 'deposit', customerPortalStatus: undefined })), true)
  })

  test('fully paid quote cannot be completed', () => {
    assert.equal(canCompleteJob(makeEstimate({ status: 'paid', paymentLinkType: 'full' })), false)
    assert.equal(canCompleteJob(makeEstimate({ status: 'paid', paymentLinkType: undefined })), false)
  })

  test('drafts cannot be completed', () => {
    assert.equal(canCompleteJob(makeEstimate({ status: 'draft' })), false)
  })
})

describe('applyExtraWork', () => {
  test('adds the section and recomputes tax and total with the same tax rate', () => {
    const next = applyExtraWork(makeEstimate(), [{ description: 'Extra valve', amount: 100 }])

    assert.equal(next.sections.length, 1)
    assert.equal(next.sections[0].addedOnSite, true)
    assert.equal(next.items.length, 2)
    assert.equal(next.taxAmount, 143)
    assert.equal(next.totalAmount, 1243)
  })

  test('replaces an earlier added-on-site section instead of stacking it', () => {
    const first = applyExtraWork(makeEstimate(), [{ description: 'Extra valve', amount: 100 }])
    const second = applyExtraWork(first, [{ description: 'Haul away', amount: 50 }])

    assert.equal(second.sections.filter((section) => section.addedOnSite).length, 1)
    assert.deepEqual(second.items.map((item) => item.description), ['Remove old drain', 'Haul away'])
    assert.equal(second.totalAmount, 1186.5)
  })

  test('returns the estimate untouched when there is no extra work', () => {
    const estimate = makeEstimate({ totalAmount: 1130.004 })
    assert.equal(applyExtraWork(estimate, []), estimate)
  })
})

describe('buildReviewItems', () => {
  test('marks only high-confidence items with photos as done', () => {
    const items = buildReviewItems(['a', 'b', 'c', 'd'], [
      { itemId: 'a', photoIndexes: [0], confidence: 'high' },
      { itemId: 'b', photoIndexes: [], confidence: 'high' },
      { itemId: 'c', photoIndexes: [1], confidence: 'low' },
    ])

    assert.deepEqual(items, [
      { itemId: 'a', done: true, photoIndexes: [0] },
      { itemId: 'b', done: false, photoIndexes: [] },
      { itemId: 'c', done: false, photoIndexes: [1] },
      { itemId: 'd', done: false, photoIndexes: [] },
    ])
  })
})

describe('buildCompletionMessage', () => {
  test('asks for the balance when one is due', () => {
    assert.equal(
      buildCompletionMessage('https://snapquote.test/q/abc', 1240),
      'Your job is done. See photos and pay the balance here: https://snapquote.test/q/abc'
    )
  })

  test('only shares photos when nothing is due', () => {
    assert.equal(
      buildCompletionMessage('https://snapquote.test/q/abc', 0),
      'Your job is done. See the photos here: https://snapquote.test/q/abc'
    )
  })
})

describe('resend reminder', () => {
  test('prefixes a resend so the SMS dedupe key differs from the first send', () => {
    assert.equal(
      buildCompletionMessage('https://snapquote.test/q/abc', 0, { reminder: true }),
      'Reminder: Your job is done. See the photos here: https://snapquote.test/q/abc'
    )
  })
})

describe('getCompletionAction', () => {
  const completion = { completedAt: '2026-10-25T10:00:00.000Z', summary: '', photos: [], items: [] }

  test('a stored completion is always resendable, even when paid', () => {
    assert.equal(getCompletionAction(makeEstimate({ completion })), 'resend')
    assert.equal(getCompletionAction(makeEstimate({ completion, status: 'paid', paymentCompletedAt: '2026-10-25T10:00:00.000Z' })), 'resend')
  })

  test('a finalized-but-unsent report resumes even after the server marked it paid', () => {
    const pendingCompletion = { completion, amountPaid: 1130, balanceDue: 0 }
    assert.equal(getCompletionAction(makeEstimate({ status: 'paid', pendingCompletion })), 'resume')
  })

  test('otherwise follows canCompleteJob', () => {
    assert.equal(getCompletionAction(makeEstimate()), 'complete')
    assert.equal(getCompletionAction(makeEstimate({ customerPortalStatus: 'viewed' })), null)
  })
})

describe('parseMoneyInput', () => {
  test('accepts plain decimal amounts and treats blank as 0', () => {
    assert.equal(parseMoneyInput(''), 0)
    assert.equal(parseMoneyInput(' 1240.5 '), 1240.5)
    assert.equal(parseMoneyInput('.75'), 0.75)
  })

  test('rejects exponents, signs, and extra decimals', () => {
    for (const value of ['1e3', '-5', '12.345', 'abc', '1,000']) {
      assert.ok(Number.isNaN(parseMoneyInput(value)), value)
    }
  })
})

describe('buildCustomerQuoteSnapshot completion', () => {
  test('carries only the schema fields of the completion', () => {
    const estimate = makeEstimate({
      completion: {
        completedAt: '2026-10-25T10:00:00.000Z',
        summary: 'Done',
        photos: [],
        items: [{ itemId: 'item-1', done: true, photoIndexes: [] }],
        stray: 'nope',
      },
    })

    const snapshot = buildCustomerQuoteSnapshot(estimate, { completion: { amountPaid: 500, balanceDue: 630 } })
    assert.deepEqual(Object.keys(snapshot.completion).sort(), ['amountPaid', 'balanceDue', 'completedAt', 'items', 'photos', 'summary'])
  })

  test('keeps the completion and its balance when re-posted without completion options (Copy approval link)', () => {
    const completion = { completedAt: '2026-10-25T10:00:00.000Z', summary: 'Done', photos: [], items: [] }

    const partial = buildCustomerQuoteSnapshot(makeEstimate({ completion, amountPaid: 500.5 }))
    assert.equal(partial.completion.amountPaid, 500.5)
    assert.equal(partial.completion.balanceDue, 629.5)

    const unpaid = buildCustomerQuoteSnapshot(makeEstimate({ completion }), {})
    assert.equal(unpaid.completion.amountPaid, 0)
    assert.equal(unpaid.completion.balanceDue, 1130)

    assert.equal(buildCustomerQuoteSnapshot(makeEstimate()).completion, undefined)
  })
})

describe('getUpdatedAtAfterServer', () => {
  test('lands past the sync buffer so the stored report is pushed, even when the client clock is behind', () => {
    const server = '2026-10-26T09:00:00.000Z'
    for (const now of [Date.parse(server) - 60_000, Date.parse(server) - 500, Date.parse(server) + 300]) {
      const local = getUpdatedAtAfterServer(server, now)
      assert.equal(resolveLwwSyncAction({ localUpdatedAt: local, cloudUpdatedAt: server }), 'push')
    }
  })

  test('uses the client time when it is already well ahead', () => {
    const now = Date.parse('2026-10-26T09:05:00.000Z')
    assert.equal(getUpdatedAtAfterServer('2026-10-26T09:00:00.000Z', now), '2026-10-26T09:05:00.000Z')
  })

  test('falls back to now without a server time', () => {
    const now = Date.parse('2026-10-26T09:05:00.000Z')
    assert.equal(getUpdatedAtAfterServer(undefined, now), '2026-10-26T09:05:00.000Z')
  })
})

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  countEditedLines,
  formatPriceListForAI,
  getLearnableItems,
  learnPriceList,
  normalizePriceKey,
  PRICE_LIST_AI_LIMIT,
  selectPriceListForAI,
  wasEstimateAlreadySent,
} from '../../lib/price-memory.ts'

const NOW = '2026-10-13T00:00:00.000Z'

function item(overrides = {}) {
  return {
    id: 'item-1',
    itemNumber: 1,
    category: 'LABOR',
    description: 'Toilet Installation',
    quantity: 1,
    unit: 'LS',
    unit_price: 200,
    total: 200,
    ...overrides,
  }
}

function priceItem(overrides = {}) {
  return {
    id: 'price-1',
    name: 'Toilet Installation',
    price: 180,
    unit: 'LS',
    category: 'LABOR',
    keywords: ['toilet'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    usageCount: 3,
    ...overrides,
  }
}

describe('price memory learning', () => {
  test('adds an unmatched sent line as a learned item', () => {
    const changed = learnPriceList([], [item()], NOW)

    assert.equal(changed.length, 1)
    assert.equal(typeof changed[0].id, 'string')
    assert.equal(changed[0].name, 'Toilet Installation')
    assert.equal(changed[0].price, 200)
    assert.equal(changed[0].unit, 'LS')
    assert.equal(changed[0].category, 'LABOR')
    assert.deepEqual(changed[0].keywords, [])
    assert.equal(changed[0].source, 'learned')
    assert.equal(changed[0].usageCount, 1)
    assert.equal(changed[0].createdAt, NOW)
    assert.equal(changed[0].lastUsedAt, NOW)
  })

  test('keeps the manual price and only bumps usage', () => {
    const manual = priceItem()
    const changed = learnPriceList([manual], [item({ unit_price: 250 })], NOW)

    assert.equal(changed.length, 1)
    assert.equal(changed[0].id, 'price-1')
    assert.equal(changed[0].price, 180)
    assert.equal(changed[0].usageCount, 4)
    assert.equal(changed[0].lastUsedAt, NOW)
    assert.equal(changed[0].source, undefined)
  })

  test('updates a learned item to the latest sent price, unit, and category', () => {
    const learned = priceItem({ source: 'learned', price: 150, unit: 'hr', category: 'SERVICE' })
    const changed = learnPriceList([learned], [item({ unit_price: 220 })], NOW)

    assert.equal(changed.length, 1)
    assert.equal(changed[0].id, 'price-1')
    assert.equal(changed[0].price, 220)
    assert.equal(changed[0].unit, 'LS')
    assert.equal(changed[0].category, 'LABOR')
    assert.equal(changed[0].usageCount, 4)
  })

  test('skips lines that must not be learned', () => {
    const skipped = [
      item({ unit_price: 0 }),
      item({ unit_price: -5 }),
      item({ unit_price: Number.NaN }),
      item({ unit_price: '120' }),
      item({ description: '   ' }),
      item({ category: 'OTHER' }),
      item({ is_value_add: true }),
      item({ description: 'Shutoff valve (Price TBD)' }),
    ]

    assert.deepEqual(getLearnableItems(skipped), [])
    assert.deepEqual(learnPriceList([], skipped, NOW), [])
  })

  test('treats case and whitespace differences as the same item', () => {
    assert.equal(normalizePriceKey('  Toilet   INSTALLATION '), 'toilet installation')

    const changed = learnPriceList(
      [priceItem({ source: 'learned' })],
      [item({ description: 'toilet  installation', unit_price: 210 })],
      NOW,
    )

    assert.equal(changed.length, 1)
    assert.equal(changed[0].id, 'price-1')
    assert.equal(changed[0].price, 210)
  })

  test('uses the last line when a key repeats in one estimate', () => {
    const changed = learnPriceList(
      [],
      [item({ unit_price: 100 }), item({ id: 'item-2', unit_price: 300 })],
      NOW,
    )

    assert.equal(changed.length, 1)
    assert.equal(changed[0].price, 300)
    assert.equal(changed[0].usageCount, 1)
  })
})

describe('edited line counting', () => {
  test('counts added, removed, and changed lines', () => {
    const original = [
      item({ description: 'Kept line' }),
      item({ description: 'Price changed', unit_price: 100 }),
      item({ description: 'Quantity changed', quantity: 1 }),
      item({ description: 'Removed line' }),
    ]
    const sent = [
      item({ description: 'kept  LINE' }),
      item({ description: 'Price changed', unit_price: 120 }),
      item({ description: 'Quantity changed', quantity: 2 }),
      item({ description: 'Added line' }),
    ]

    assert.equal(countEditedLines(original, sent), 4)
  })

  test('returns zero when nothing changed', () => {
    assert.equal(countEditedLines([item()], [item()]), 0)
  })
})

describe('price list selection for AI', () => {
  test('sorts by usage, then by most recent use, and caps the list', () => {
    const items = Array.from({ length: PRICE_LIST_AI_LIMIT + 5 }, (_, index) =>
      priceItem({ id: `p-${index}`, name: `Item ${index}`, usageCount: 1 }),
    )
    items.push(priceItem({ id: 'top', name: 'Top', usageCount: 50 }))
    items.push(priceItem({ id: 'recent', name: 'Recent', usageCount: 1, lastUsedAt: '2026-10-12T00:00:00.000Z' }))

    const selected = selectPriceListForAI(items)

    assert.equal(selected.length, PRICE_LIST_AI_LIMIT)
    assert.equal(selected[0].id, 'top')
    assert.equal(selected[1].id, 'recent')
  })

  test('formats items in the existing prompt line format', () => {
    const text = formatPriceListForAI([priceItem()])
    assert.equal(text, '- "Toilet Installation": $180/LS [LABOR] (keywords: toilet)')
    assert.equal(formatPriceListForAI([]), '')
  })
})

describe('final review fixes', () => {
  test('treats sent or paid estimates as already sent', () => {
    assert.equal(wasEstimateAlreadySent({ status: 'draft' }), false)
    assert.equal(wasEstimateAlreadySent({ status: 'draft', sentAt: '2026-10-01T00:00:00.000Z' }), true)
    assert.equal(wasEstimateAlreadySent({ status: 'sent' }), true)
    assert.equal(wasEstimateAlreadySent({ status: 'paid' }), true)
  })

  test('does not throw when a stored item has no updatedAt', () => {
    const legacy = priceItem({ id: 'legacy', usageCount: 1 })
    delete legacy.updatedAt
    const dated = priceItem({ id: 'dated', usageCount: 1 })

    const selected = selectPriceListForAI([legacy, dated])

    assert.deepEqual(selected.map((entry) => entry.id), ['dated', 'legacy'])
  })
})

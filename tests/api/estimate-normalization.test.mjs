import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  normalizeEstimateItem,
  normalizeEstimatePayload,
  normalizePhotoEstimateAnalysis,
} from '@/lib/estimates/normalize'
import {
  getAllItemsFromEstimate,
  lineTotal,
} from '@/lib/estimates/math'

describe('estimate normalization helpers', () => {
  test('coerces item numbers and falls back to safe category and unit values', () => {
    const item = normalizeEstimateItem({
      id: ' labor-1 ',
      itemNumber: '4.9',
      category: 'labor',
      description: '  Install shutoff valve  ',
      quantity: '2',
      unit: 'bogus',
      unit_price: '125.50',
    }, 0)

    assert.equal(item.id, 'labor-1')
    assert.equal(item.itemNumber, 4)
    assert.equal(item.category, 'LABOR')
    assert.equal(item.description, 'Install shutoff valve')
    assert.equal(item.quantity, 2)
    assert.equal(item.unit, 'ea')
    assert.equal(item.unit_price, 125.5)
    assert.equal(item.total, 251)
  })

  test('drops blank items and sections while preserving valid warnings', () => {
    const estimate = normalizeEstimatePayload({
      items: [
        { description: 'Replace P-trap', quantity: 1, unit_price: 80 },
        { description: '   ', quantity: 3, unit_price: 10 },
      ],
      sections: [
        {
          name: 'Rough-in',
          items: [{ description: 'Open wall', quantity: '2', unit_price: '65' }],
        },
        {
          name: 'Empty',
          items: [{ description: '' }],
        },
      ],
      warnings: ['  Verify wall access  ', '', 42],
    })

    assert.equal(estimate.items.length, 1)
    assert.equal(estimate.sections?.length, 1)
    assert.equal(estimate.sections?.[0].items[0].description, 'Open wall')
    assert.deepEqual(estimate.warnings, ['Verify wall access'])
  })

  test('normalizes photo analysis limits and fallback text', () => {
    const analysis = normalizePhotoEstimateAnalysis({
      observations: ['  visible leak  ', 'corroded stop', 'stained cabinet', 'old trap', 'loose nut', 'extra', 'ignored'],
      suggestedScope: ['replace stop'],
      materialSuggestions: [
        { label: 'Angle stop', quantity: '2', unit: '', reason: '' },
        { label: '  ' },
      ],
      pricingConfidence: 'HIGH',
    })

    assert.equal(analysis?.observations.length, 6)
    assert.equal(analysis?.materialSuggestions.length, 1)
    assert.equal(analysis?.materialSuggestions[0].quantity, 2)
    assert.equal(analysis?.materialSuggestions[0].unit, 'ea')
    assert.equal(analysis?.materialSuggestions[0].reason, 'Visible condition from the jobsite photo.')
    assert.equal(analysis?.pricingConfidence, 'high')
  })

  test('calculates line totals from explicit totals or quantity and unit price', () => {
    assert.equal(lineTotal({ quantity: '3', unit_price: '40' }), 120)
    assert.equal(lineTotal({ quantity: 3, unit_price: 40, total: 99 }), 99)
    assert.equal(lineTotal(null), 0)
  })

  test('merges flat and section items before result calculations', () => {
    const estimate = normalizeEstimatePayload({
      items: [{ description: 'Permit', quantity: 1, unit_price: 50 }],
      sections: [
        {
          name: 'Plumbing',
          items: [{ description: 'Install fixture', quantity: 2, unit_price: 125 }],
        },
      ],
    })

    const allItems = getAllItemsFromEstimate(estimate)

    assert.equal(allItems.length, 2)
    assert.deepEqual(allItems.map((item) => item.description), ['Permit', 'Install fixture'])
    assert.equal(allItems.reduce((sum, item) => sum + lineTotal(item), 0), 300)
  })
})

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  assertSupabaseMutation,
  mapCloudEstimateToLocal,
  mapLocalEstimateItemToCloudRow,
} from '../../lib/sync-estimate-mapping.ts'

describe('sync estimate cloud mapping', () => {
  test('preserves line item metadata, sections, and attachments when pulling from cloud', () => {
    const localEstimate = mapCloudEstimateToLocal({
      id: 'estimate-cloud-1',
      estimate_number: 'EST-2605-901',
      clients: {
        name: 'Harbor Dental',
        address: '44 Bay St',
        email: 'office@harbordental.test',
        phone: '+14165550123',
        notes: 'Use side entrance after 5pm.',
      },
      tax_rate: 5,
      tax_amount: 110,
      total_amount: 2200,
      ai_summary: 'Replace fixtures and patch drywall.',
      created_at: '2026-05-23T10:00:00.000Z',
      updated_at: '2026-05-23T10:05:00.000Z',
      sent_at: '2026-05-23T10:06:00.000Z',
      status: 'sent',
      estimate_items: [
        {
          id: 'flat_db_1',
          item_number: 2,
          category: 'SERVICE',
          unit: 'LS',
          description: 'Fixture replacement package',
          quantity: '1',
          unit_price: '1450',
          total: '1450',
        },
      ],
      estimate_sections: [
        {
          id: 'section_db_1',
          local_id: 'section_local_1',
          division_code: '09',
          name: 'Finish Work',
          sort_order: 1,
          estimate_section_items: [
            {
              local_id: 'section_item_local_1',
              item_number: 3,
              category: 'LABOR',
              unit: 'hr',
              description: 'Patch and sand drywall',
              quantity: 4,
              unit_price: 95,
              total: 380,
            },
          ],
        },
      ],
      estimate_attachments: [
        {
          photos: ['data:image/png;base64,abc123'],
          audio_url: 'data:audio/webm;base64,voice123',
          original_transcript: 'Customer asked for same-day patching.',
        },
      ],
    })

    assert.equal(localEstimate.id, 'estimate-cloud-1')
    assert.equal(localEstimate.status, 'sent')
    assert.equal(localEstimate.clientEmail, 'office@harbordental.test')
    assert.equal(localEstimate.clientPhone, '+14165550123')
    assert.equal(localEstimate.clientNotes, 'Use side entrance after 5pm.')
    assert.equal(localEstimate.items[0].itemNumber, 2)
    assert.equal(localEstimate.items[0].category, 'SERVICE')
    assert.equal(localEstimate.items[0].unit, 'LS')
    assert.equal(localEstimate.sections?.[0].divisionCode, '09')
    assert.equal(localEstimate.sections?.[0].items[0].id, 'section_item_local_1')
    assert.equal(localEstimate.sections?.[0].items[0].itemNumber, 3)
    assert.equal(localEstimate.sections?.[0].items[0].category, 'LABOR')
    assert.equal(localEstimate.sections?.[0].items[0].unit, 'hr')
    assert.deepEqual(localEstimate.attachments?.photos, ['data:image/png;base64,abc123'])
    assert.equal(localEstimate.attachments?.audioUrl, 'data:audio/webm;base64,voice123')
    assert.equal(localEstimate.attachments?.originalTranscript, 'Customer asked for same-day patching.')
  })

  test('surfaces Supabase write failures instead of reporting a clean sync', () => {
    assert.throws(() => {
      assertSupabaseMutation({
        error: {
          message: 'permission denied for table estimate_attachments',
        },
      }, 'Failed to store estimate attachments')
    }, /permission denied for table estimate_attachments/)
  })

  test('maps local flat line item metadata before pushing to cloud', () => {
    const cloudRow = mapLocalEstimateItemToCloudRow('estimate-local-1', {
      id: 'flat-item-local-1',
      itemNumber: 7,
      category: 'SERVICE',
      description: 'Pressure test repaired supply line',
      quantity: 1,
      unit: 'LS',
      unit_price: 185,
      total: 185,
    }, {
      updatedAt: '2026-05-24T09:00:00.000Z',
    })

    assert.deepEqual(cloudRow, {
      estimate_id: 'estimate-local-1',
      local_id: 'flat-item-local-1',
      item_number: 7,
      category: 'SERVICE',
      unit: 'LS',
      description: 'Pressure test repaired supply line',
      quantity: 1,
      unit_price: 185,
      total: 185,
      updated_at: '2026-05-24T09:00:00.000Z',
    })
  })
})

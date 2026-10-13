import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  formatPendingSyncSummary,
  summarizePendingSync,
} from '../../lib/offline-sync.ts'
import { normalizeEstimateForLocalSave } from '../../lib/estimate-local-save.ts'

describe('offline workflow helpers', () => {
  test('summarizes unsynced estimates by status', () => {
    const summary = summarizePendingSync([
      { status: 'draft', synced: false },
      { status: 'sent', synced: false },
      { status: 'sent', paymentCompletedAt: '2026-05-29T12:00:00.000Z', synced: false },
      { status: 'paid', synced: false },
      { status: 'draft', synced: true },
    ], 2)

    assert.deepEqual(summary, {
      draftCount: 1,
      sentCount: 1,
      paidCount: 2,
      unsyncedEstimateCount: 4,
      pendingAudioCount: 2,
      totalPendingCount: 6,
    })
  })

  test('formats pending sync summary for operators', () => {
    const message = formatPendingSyncSummary({
      draftCount: 2,
      sentCount: 1,
      paidCount: 0,
      unsyncedEstimateCount: 3,
      pendingAudioCount: 1,
      totalPendingCount: 4,
    })

    assert.equal(message, '2 drafts • 1 sent quote • 1 recording')
  })

  test('returns synced message when queue is clear', () => {
    const message = formatPendingSyncSummary({
      draftCount: 0,
      sentCount: 0,
      paidCount: 0,
      unsyncedEstimateCount: 0,
      pendingAudioCount: 0,
      totalPendingCount: 0,
    })

    assert.equal(message, 'All local changes are synced.')
  })

  test('preserves explicit synced flag after a cloud sync save', () => {
    const normalized = normalizeEstimateForLocalSave({
      id: 'estimate-synced-1',
      estimateNumber: 'EST-2605-001',
      synced: true,
      status: 'sent',
      createdAt: '2026-05-23T10:00:00.000Z',
    }, '2026-05-23T10:05:00.000Z')

    assert.equal(normalized.synced, true)
    assert.equal(normalized.status, 'sent')
    assert.equal(normalized.updatedAt, '2026-05-23T10:00:00.000Z')
  })

  test('defaults new local estimates to unsynced drafts', () => {
    const normalized = normalizeEstimateForLocalSave({
      id: 'estimate-local-1',
      estimateNumber: 'EST-2605-002',
    }, '2026-05-23T10:05:00.000Z')

    assert.equal(normalized.synced, false)
    assert.equal(normalized.status, 'draft')
    assert.equal(normalized.updatedAt, '2026-05-23T10:05:00.000Z')
  })
})

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  formatPendingSyncSummary,
  summarizePendingSync,
} from '../../lib/offline-sync.ts'

describe('offline workflow helpers', () => {
  test('summarizes unsynced estimates by status', () => {
    const summary = summarizePendingSync([
      { status: 'draft', synced: false },
      { status: 'sent', synced: false },
      { status: 'paid', synced: false },
      { status: 'draft', synced: true },
    ], 2)

    assert.deepEqual(summary, {
      draftCount: 1,
      sentCount: 1,
      paidCount: 1,
      unsyncedEstimateCount: 3,
      pendingAudioCount: 2,
      totalPendingCount: 5,
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
})

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { resolveLwwSyncAction } from '../../lib/sync-resolution.ts'
import {
  applyCloudAmountPaidToLocalEstimate,
  applyCloudPaymentStateToLocalEstimate,
  preserveLocalOnlyCompletionState,
  applyCloudCustomerPortalLinkToLocalEstimate,
  applyCloudQuickBooksLinkToLocalEstimate,
  assertSupabaseMutation,
  hasCustomerPortalEstimatePatchChanged,
  hasQuickBooksEstimatePatchChanged,
  mapCloudEstimateToLocal,
  mapCloudCustomerPortalLinkToLocalPatch,
  mapCloudQuickBooksLinkToLocalPatch,
  mapClearedAttachmentsToCloudPatch,
  mapLocalEstimateAttachmentsToCloudRow,
  mapLocalEstimateItemToCloudRow,
  mapLocalEstimateSectionToCloudRow,
  mapLocalEstimateSectionItemToCloudRow,
  mapLocalEstimateToCloudRow,
  selectLatestCloudCustomerPortalLink,
} from '../../lib/sync-estimate-mapping.ts'

describe('sync estimate cloud mapping', () => {
  test('preserves line item metadata, sections, attachments, portal links, and QuickBooks links when pulling from cloud', () => {
    const localEstimate = applyCloudCustomerPortalLinkToLocalEstimate(applyCloudQuickBooksLinkToLocalEstimate(mapCloudEstimateToLocal({
      id: 'estimate-cloud-1',
      estimate_number: 'EST-2605-901',
      payment_link: 'https://pay.example.test/estimate-cloud-1',
      payment_link_id: 'plink_cloud_1',
      payment_link_type: 'deposit',
      payment_completed_at: '2026-05-23T12:30:00.000Z',
      last_payment_session_id: 'cs_cloud_paid_1',
      revision_of_estimate_id: 'estimate-cloud-original',
      revision_of_estimate_number: 'EST-2605-900',
      revision_requested_at: '2026-05-23T09:00:00.000Z',
      superseded_by_estimate_id: 'estimate-cloud-revision',
      superseded_at: '2026-05-23T11:00:00.000Z',
      first_followed_up_at: '2026-05-23T13:15:00.000Z',
      last_followed_up_at: '2026-05-24T09:45:00.000Z',
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
          scope_assumptions_confirmed_at: '2026-05-23T10:12:00.000Z',
        },
      ],
    }), {
      estimate_id: 'estimate-cloud-1',
      quickbooks_invoice_id: 'qb_invoice_123',
      quickbooks_customer_id: 'qb_customer_456',
      quickbooks_invoice_doc_number: 'QB-9021',
      quickbooks_invoice_status: 'open',
      synced_at: '2026-05-23T13:00:00.000Z',
    }), {
      estimate_id: 'estimate-cloud-1',
      share_url: 'https://app.snapquote.test/q/customer-token',
      status: 'change_requested',
      viewed_at: '2026-05-23T12:45:00.000Z',
      change_requested_at: '2026-05-23T12:55:00.000Z',
      customer_name: 'Avery Customer',
      customer_email: 'avery@example.test',
      customer_note: 'Please add disposal haul-away.',
    })

    assert.equal(localEstimate.id, 'estimate-cloud-1')
    assert.equal(localEstimate.status, 'paid')
    assert.equal(localEstimate.paymentLink, 'https://pay.example.test/estimate-cloud-1')
    assert.equal(localEstimate.paymentLinkId, 'plink_cloud_1')
    assert.equal(localEstimate.paymentLinkType, 'deposit')
    assert.equal(localEstimate.paymentCompletedAt, '2026-05-23T12:30:00.000Z')
    assert.equal(localEstimate.lastPaymentSessionId, 'cs_cloud_paid_1')
    assert.equal(localEstimate.quickbooksInvoiceId, 'qb_invoice_123')
    assert.equal(localEstimate.quickbooksCustomerId, 'qb_customer_456')
    assert.equal(localEstimate.quickbooksDocNumber, 'QB-9021')
    assert.equal(localEstimate.quickbooksInvoiceStatus, 'open')
    assert.equal(localEstimate.quickbooksSyncedAt, '2026-05-23T13:00:00.000Z')
    assert.equal(localEstimate.customerPortalUrl, 'https://app.snapquote.test/q/customer-token')
    assert.equal(localEstimate.customerPortalStatus, 'change_requested')
    assert.equal(localEstimate.customerViewedAt, '2026-05-23T12:45:00.000Z')
    assert.equal(localEstimate.customerChangeRequestedAt, '2026-05-23T12:55:00.000Z')
    assert.equal(localEstimate.customerPortalName, 'Avery Customer')
    assert.equal(localEstimate.customerPortalEmail, 'avery@example.test')
    assert.equal(localEstimate.customerPortalNote, 'Please add disposal haul-away.')
    assert.equal(localEstimate.revisionOfEstimateId, 'estimate-cloud-original')
    assert.equal(localEstimate.revisionOfEstimateNumber, 'EST-2605-900')
    assert.equal(localEstimate.revisionRequestedAt, '2026-05-23T09:00:00.000Z')
    assert.equal(localEstimate.supersededByEstimateId, 'estimate-cloud-revision')
    assert.equal(localEstimate.supersededAt, '2026-05-23T11:00:00.000Z')
    assert.equal(localEstimate.firstFollowedUpAt, '2026-05-23T13:15:00.000Z')
    assert.equal(localEstimate.lastFollowedUpAt, '2026-05-24T09:45:00.000Z')
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
    assert.equal(localEstimate.attachments?.scopeAssumptionsConfirmedAt, '2026-05-23T10:12:00.000Z')
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

  test('maps local section item metadata before pushing to cloud', () => {
    const cloudRow = mapLocalEstimateSectionItemToCloudRow('estimate-local-1', 'section-cloud-1', {
      id: 'section-item-local-1',
      itemNumber: 4,
      category: 'LABOR',
      description: 'Install recessed light trims',
      quantity: 3,
      unit: 'hr',
      unit_price: 92,
      total: 276,
    }, {
      updatedAt: '2026-05-24T09:15:00.000Z',
    })

    assert.deepEqual(cloudRow, {
      estimate_id: 'estimate-local-1',
      local_id: 'section-item-local-1',
      item_number: 4,
      category: 'LABOR',
      unit: 'hr',
      description: 'Install recessed light trims',
      quantity: 3,
      unit_price: 92,
      total: 276,
      updated_at: '2026-05-24T09:15:00.000Z',
      section_id: 'section-cloud-1',
    })
  })

  test('maps local scope confirmation attachment state before pushing to cloud', () => {
    const cloudRow = mapLocalEstimateAttachmentsToCloudRow('estimate-local-1', {
      photos: ['data:image/png;base64,abc123', '  ', 'data:image/png;base64,def456'],
      audioUrl: ' data:audio/webm;base64,voice123 ',
      originalTranscript: ' Replace leaking sink trap. ',
      scopeAssumptionsConfirmedAt: ' 2026-05-24T09:45:00.000Z ',
    }, {
      updatedAt: '2026-05-24T10:00:00.000Z',
    })

    assert.deepEqual(cloudRow, {
      estimate_id: 'estimate-local-1',
      photos: ['data:image/png;base64,abc123', 'data:image/png;base64,def456'],
      audio_url: 'data:audio/webm;base64,voice123',
      original_transcript: 'Replace leaking sink trap.',
      scope_assumptions_confirmed_at: '2026-05-24T09:45:00.000Z',
      updated_at: '2026-05-24T10:00:00.000Z',
    })
  })

  test('keeps a confirmation-only attachment row syncable', () => {
    const cloudRow = mapLocalEstimateAttachmentsToCloudRow('estimate-local-1', {
      photos: [],
      scopeAssumptionsConfirmedAt: '2026-05-24T09:45:00.000Z',
    })

    assert.deepEqual(cloudRow, {
      estimate_id: 'estimate-local-1',
      photos: [],
      audio_url: null,
      original_transcript: null,
      scope_assumptions_confirmed_at: '2026-05-24T09:45:00.000Z',
    })
  })

  test('detects changed QuickBooks invoice link patches', () => {
    const patch = mapCloudQuickBooksLinkToLocalPatch({
      estimate_id: 'estimate-cloud-1',
      quickbooks_invoice_id: 'qb_invoice_123',
      quickbooks_invoice_status: 'paid',
      synced_at: '2026-05-23T13:30:00.000Z',
    })

    assert.equal(patch?.quickbooksInvoiceId, 'qb_invoice_123')
    assert.equal(patch?.quickbooksInvoiceStatus, 'paid')
    assert.equal(patch?.quickbooksSyncedAt, '2026-05-23T13:30:00.000Z')
    assert.equal(hasQuickBooksEstimatePatchChanged({
      id: 'estimate-cloud-1',
      estimateNumber: 'EST-2605-901',
      items: [],
      summary_note: '',
      clientName: 'Harbor Dental',
      clientAddress: '44 Bay St',
      taxRate: 5,
      taxAmount: 0,
      totalAmount: 0,
      createdAt: '2026-05-23T10:00:00.000Z',
      updatedAt: '2026-05-23T10:00:00.000Z',
      status: 'sent',
    }, patch), true)
  })

  test('detects changed customer portal link patches', () => {
    const patch = mapCloudCustomerPortalLinkToLocalPatch({
      estimate_id: 'estimate-cloud-1',
      share_url: 'https://app.snapquote.test/q/customer-token',
      status: 'approved',
      viewed_at: '2026-05-23T12:45:00.000Z',
      approved_at: '2026-05-23T12:58:00.000Z',
      customer_name: 'Avery Customer',
      customer_email: 'avery@example.test',
    })

    assert.equal(patch?.customerPortalUrl, 'https://app.snapquote.test/q/customer-token')
    assert.equal(patch?.customerPortalStatus, 'approved')
    assert.equal(patch?.customerApprovedAt, '2026-05-23T12:58:00.000Z')
    assert.equal(hasCustomerPortalEstimatePatchChanged({
      id: 'estimate-cloud-1',
      estimateNumber: 'EST-2605-901',
      items: [],
      summary_note: '',
      clientName: 'Harbor Dental',
      clientAddress: '44 Bay St',
      taxRate: 5,
      taxAmount: 0,
      totalAmount: 0,
      createdAt: '2026-05-23T10:00:00.000Z',
      updatedAt: '2026-05-23T10:00:00.000Z',
      status: 'sent',
    }, patch), true)
  })

  test('clears stale customer response fields when a portal link is reset', () => {
    const localEstimate = applyCloudCustomerPortalLinkToLocalEstimate({
      id: 'estimate-cloud-1',
      estimateNumber: 'EST-2605-901',
      items: [],
      summary_note: '',
      clientName: 'Harbor Dental',
      clientAddress: '44 Bay St',
      taxRate: 5,
      taxAmount: 0,
      totalAmount: 0,
      createdAt: '2026-05-23T10:00:00.000Z',
      updatedAt: '2026-05-23T10:00:00.000Z',
      status: 'sent',
      customerPortalUrl: 'https://app.snapquote.test/q/customer-token',
      customerPortalStatus: 'change_requested',
      customerViewedAt: '2026-05-23T12:45:00.000Z',
      customerChangeRequestedAt: '2026-05-23T12:55:00.000Z',
      customerPortalName: 'Avery Customer',
      customerPortalEmail: 'avery@example.test',
      customerPortalNote: 'Please add disposal haul-away.',
    }, {
      estimate_id: 'estimate-cloud-1',
      share_url: 'https://app.snapquote.test/q/customer-token',
      status: 'shared',
      viewed_at: null,
      approved_at: null,
      change_requested_at: null,
      customer_name: null,
      customer_email: null,
      customer_note: null,
      updated_at: '2026-05-24T08:00:00.000Z',
    })

    assert.equal(localEstimate.customerPortalStatus, 'shared')
    assert.equal(localEstimate.customerPortalUrl, 'https://app.snapquote.test/q/customer-token')
    assert.equal(localEstimate.customerViewedAt, undefined)
    assert.equal(localEstimate.customerApprovedAt, undefined)
    assert.equal(localEstimate.customerChangeRequestedAt, undefined)
    assert.equal(localEstimate.customerPortalName, undefined)
    assert.equal(localEstimate.customerPortalEmail, undefined)
    assert.equal(localEstimate.customerPortalNote, undefined)
  })

  test('selects the latest customer portal link for sync when duplicates exist', () => {
    const olderLink = {
      estimate_id: 'estimate-cloud-1',
      share_url: 'https://app.snapquote.test/q/old-token',
      status: 'viewed',
      viewed_at: '2026-05-23T12:45:00.000Z',
      updated_at: '2026-05-23T12:45:00.000Z',
    }
    const latestLink = {
      estimate_id: 'estimate-cloud-1',
      share_url: 'https://app.snapquote.test/q/latest-token',
      status: 'approved',
      approved_at: '2026-05-23T13:15:00.000Z',
      updated_at: '2026-05-23T13:15:00.000Z',
    }

    const selected = selectLatestCloudCustomerPortalLink(olderLink, latestLink)

    assert.equal(selected.share_url, 'https://app.snapquote.test/q/latest-token')
    assert.equal(selected.status, 'approved')
  })

  test('maps local revision tracking metadata before pushing to cloud', () => {
    const cloudRow = mapLocalEstimateToCloudRow('user-1', 'client-1', {
      id: 'estimate-revision-1',
      estimateNumber: 'EST-2605-902',
      items: [],
      summary_note: 'Revised quote after customer requested change.',
      clientName: 'Harbor Dental',
      clientAddress: '44 Bay St',
      taxRate: 5,
      taxAmount: 120,
      totalAmount: 2400,
      createdAt: '2026-05-24T08:00:00.000Z',
      updatedAt: '',
      sentAt: '2026-05-24T08:30:00.000Z',
      status: 'sent',
      paymentLink: 'https://pay.example.test/estimate-revision-1',
      paymentLinkId: 'plink_revision_1',
      paymentLinkType: 'full',
      paymentCompletedAt: '2026-05-24T12:00:00.000Z',
      paymentStateVersion: 4,
      lastPaymentSessionId: 'cs_revision_paid_1',
      revisionOfEstimateId: 'estimate-cloud-original',
      revisionOfEstimateNumber: 'EST-2605-900',
      revisionRequestedAt: '2026-05-23T09:00:00.000Z',
      supersededByEstimateId: 'estimate-revision-2',
      supersededAt: '2026-05-24T10:00:00.000Z',
      firstFollowedUpAt: '2026-05-24T09:30:00.000Z',
      lastFollowedUpAt: '2026-05-25T09:30:00.000Z',
    }, {
      now: '2026-05-24T09:00:00.000Z',
    })

    assert.deepEqual(cloudRow, {
      id: 'estimate-revision-1',
      user_id: 'user-1',
      client_id: 'client-1',
      estimate_number: 'EST-2605-902',
      total_amount: 2400,
      tax_rate: 5,
      tax_amount: 120,
      ai_summary: 'Revised quote after customer requested change.',
      created_at: '2026-05-24T08:00:00.000Z',
      updated_at: '2026-05-24T08:00:00.000Z',
      sent_at: '2026-05-24T08:30:00.000Z',
      status: 'paid',
      payment_link: 'https://pay.example.test/estimate-revision-1',
      payment_link_id: 'plink_revision_1',
      payment_link_type: 'full',
      payment_completed_at: '2026-05-24T12:00:00.000Z',
      payment_state_version: 4,
      revision_of_estimate_id: 'estimate-cloud-original',
      revision_of_estimate_number: 'EST-2605-900',
      revision_requested_at: '2026-05-23T09:00:00.000Z',
      superseded_by_estimate_id: 'estimate-revision-2',
      superseded_at: '2026-05-24T10:00:00.000Z',
      first_followed_up_at: '2026-05-24T09:30:00.000Z',
      last_followed_up_at: '2026-05-25T09:30:00.000Z',
    })
  })

  test('cloud amount_paid maps to local amountPaid', () => {
    assert.equal(mapCloudEstimateToLocal({ id: 'e1', amount_paid: '250.5' }).amountPaid, 250.5)
    assert.equal(mapCloudEstimateToLocal({ id: 'e1', amount_paid: 0 }).amountPaid, 0)
    assert.equal(mapCloudEstimateToLocal({ id: 'e1' }).amountPaid, undefined)
  })

  test('local upsert row never includes server-owned payment fields', () => {
    const row = mapLocalEstimateToCloudRow('user-1', null, {
      id: 'e1', estimateNumber: 'EST-1', items: [], summary_note: '', clientName: 'A', clientAddress: '',
      taxRate: 5, taxAmount: 0, totalAmount: 100, createdAt: '2026-05-24T08:00:00.000Z',
      updatedAt: '2026-05-24T08:00:00.000Z', status: 'sent', amountPaid: 40,
      lastPaymentSessionId: 'cs_polled', lastPolledPaymentSessionId: 'cs_polled',
    })
    assert.equal('amount_paid' in row, false)
    assert.equal('last_payment_session_id' in row, false)
    assert.equal('last_polled_payment_session_id' in row, false)
  })

  describe('server-owned payment state after a push', () => {
    const staleLocal = {
      id: 'e1', estimateNumber: 'EST-1', items: [], summary_note: 'edited offline', clientName: 'A', clientAddress: '',
      taxRate: 5, taxAmount: 0, totalAmount: 100, createdAt: '2026-05-24T08:00:00.000Z',
      updatedAt: '2026-05-25T08:00:00.000Z', sentAt: '2026-05-24T09:00:00.000Z', status: 'sent',
      paymentLink: 'https://pay.example.test/full', paymentLinkId: 'plink_full', paymentLinkType: 'full',
      paymentStateVersion: 1,
    }

    test('push and pull carry payment_state_version; a never-pulled estimate pushes version 0', () => {
      assert.equal(mapLocalEstimateToCloudRow('user-1', null, staleLocal).payment_state_version, 1)
      assert.equal(mapLocalEstimateToCloudRow('user-1', null, { ...staleLocal, paymentStateVersion: undefined }).payment_state_version, 0)
      assert.equal(mapCloudEstimateToLocal({ id: 'e1', payment_state_version: 3 }).paymentStateVersion, 3)
    })

    test('a stale sent push keeps the webhook paid state locally', () => {
      // The trigger kept the stored payment state; this is what the upsert returned.
      const synced = applyCloudPaymentStateToLocalEstimate(staleLocal, {
        status: 'paid', sent_at: '2026-05-24T09:00:00.000Z', payment_completed_at: '2026-05-24T20:00:00.000Z',
        payment_link: 'https://pay.example.test/full', payment_link_id: 'plink_full', payment_link_type: 'full',
        payment_state_version: 2,
      })
      assert.equal(synced.status, 'paid')
      assert.equal(synced.paymentCompletedAt, '2026-05-24T20:00:00.000Z')
      assert.equal(synced.paymentStateVersion, 2)
      assert.equal(synced.summary_note, 'edited offline')
    })

    test('a stale push keeps the finalize balance link instead of the old link', () => {
      const synced = applyCloudPaymentStateToLocalEstimate(staleLocal, {
        status: 'sent', sent_at: '2026-05-24T09:00:00.000Z', payment_completed_at: null,
        payment_link: 'https://pay.example.test/balance', payment_link_id: 'plink_balance', payment_link_type: 'custom',
        payment_state_version: 2,
      })
      assert.equal(synced.paymentLink, 'https://pay.example.test/balance')
      assert.equal(synced.paymentLinkId, 'plink_balance')
      assert.equal(synced.paymentLinkType, 'custom')
    })

    test('an accepted push leaves the estimate object untouched', () => {
      const accepted = applyCloudPaymentStateToLocalEstimate(staleLocal, {
        status: 'sent', sent_at: '2026-05-24T09:00:00.000Z', payment_completed_at: null,
        payment_link: 'https://pay.example.test/full', payment_link_id: 'plink_full', payment_link_type: 'full',
        payment_state_version: 1,
      })
      assert.equal(accepted, staleLocal)
      assert.equal(applyCloudPaymentStateToLocalEstimate(staleLocal, null), staleLocal)
    })
  })

  test('completion round-trips through attachments row', () => {
    const completion = {
      completedAt: '2026-06-01T10:00:00.000Z',
      summary: 'Replaced the trap and tested for leaks.',
      photos: ['data:image/jpeg;base64,aaa'],
      items: [{ itemId: 'item-1', done: true, photoIndexes: [0] }, { itemId: 'item-2', done: false, photoIndexes: [] }],
    }
    const row = mapLocalEstimateAttachmentsToCloudRow('e1', undefined, { completion })
    assert.deepEqual(row?.completion, completion)

    const local = mapCloudEstimateToLocal({ id: 'e1', estimate_attachments: [{ photos: [], completion: row.completion }] })
    assert.deepEqual(local.completion, completion)
  })

  test('malformed cloud completion is dropped', () => {
    const bad = [
      'nope',
      { completedAt: 'x', summary: 's', photos: [1], items: [] },
      { completedAt: 'x', summary: 's', photos: [], items: [{ itemId: 'a', done: 'yes', photoIndexes: [] }] },
      { completedAt: 'x', summary: 's', photos: [], items: [{ itemId: 'a', done: true, photoIndexes: ['0'] }] },
      { completedAt: 'x', summary: 's', photos: ['p'], items: [{ itemId: 'a', done: true, photoIndexes: [1] }] },
      { completedAt: 'x', summary: 's', photos: ['p'], items: [{ itemId: 'a', done: true, photoIndexes: [-1] }] },
      { completedAt: 'x', summary: 's', photos: ['p'], items: [{ itemId: 'a', done: true, photoIndexes: [0.5] }] },
      { completedAt: 'x', summary: 's', photos: [] },
    ]
    for (const completion of bad) {
      assert.equal(mapCloudEstimateToLocal({ id: 'e1', estimate_attachments: { photos: [], completion } }).completion, undefined)
    }
  })

  test('addedOnSite section flag round-trips as added_on_site', () => {
    const section = { id: 's1', name: 'Added on site', addedOnSite: true, items: [] }
    const row = mapLocalEstimateSectionToCloudRow('e1', section, 2, { updatedAt: 'now' })
    assert.deepEqual(row, {
      estimate_id: 'e1', local_id: 's1', division_code: null, name: 'Added on site',
      sort_order: 2, added_on_site: true, updated_at: 'now',
    })
    assert.equal(mapLocalEstimateSectionToCloudRow('e1', { id: 's2', name: 'X', items: [] }, 0).added_on_site, false)

    const local = mapCloudEstimateToLocal({
      id: 'e1',
      estimate_sections: [{ local_id: 's1', name: 'Added on site', added_on_site: true, sort_order: 0,
        estimate_section_items: [{ local_id: 'i1', description: 'Extra', quantity: 1, unit_price: 5, total: 5 }] }],
    })
    assert.equal(local.sections[0].addedOnSite, true)
  })

  test('missing completion column maps to undefined', () => {
    const local = mapCloudEstimateToLocal({ id: 'e1', estimate_attachments: [{ photos: ['data:image/png;base64,a'] }] })
    assert.equal(local.completion, undefined)
    assert.equal(local.attachments.photos.length, 1)
  })

  test('push branch (local newer) still takes server amount_paid and never pushes it back', () => {
    const local = {
      id: 'e1', estimateNumber: 'EST-1', items: [], summary_note: '', clientName: 'A', clientAddress: '',
      taxRate: 5, taxAmount: 0, totalAmount: 1000, createdAt: '2026-05-24T08:00:00.000Z',
      updatedAt: '2026-05-25T08:00:00.000Z', status: 'sent', amountPaid: 100, synced: false,
    }
    const cloud = { id: 'e1', created_at: local.createdAt, updated_at: '2026-05-24T09:00:00.000Z', amount_paid: '500.00' }

    assert.equal(resolveLwwSyncAction({
      localUpdatedAt: local.updatedAt, localCreatedAt: local.createdAt,
      cloudUpdatedAt: cloud.updated_at, cloudCreatedAt: cloud.created_at,
    }), 'push')

    const patched = applyCloudAmountPaidToLocalEstimate(local, cloud)
    assert.equal(patched.amountPaid, 500)
    assert.equal(patched.updatedAt, local.updatedAt)
    assert.equal('amount_paid' in mapLocalEstimateToCloudRow('user-1', null, patched), false)
  })

  test('applyCloudAmountPaidToLocalEstimate is a no-op when equal or cloud has no value', () => {
    const local = { id: 'e1', amountPaid: 500 }
    assert.equal(applyCloudAmountPaidToLocalEstimate(local, { amount_paid: 500 }), local)
    assert.equal(applyCloudAmountPaidToLocalEstimate(local, { amount_paid: null }), local)
    assert.equal(applyCloudAmountPaidToLocalEstimate(local, undefined), local)
  })

  test('clearing attachments never touches the completion column', () => {
    const patch = mapClearedAttachmentsToCloudPatch('2026-06-01T10:00:00.000Z')
    assert.deepEqual(patch, {
      photos: [],
      audio_url: null,
      original_transcript: null,
      scope_assumptions_confirmed_at: null,
      updated_at: '2026-06-01T10:00:00.000Z',
    })
    assert.equal('completion' in patch, false)
  })
})

describe('preserveLocalOnlyCompletionState', () => {
  const completion = { completedAt: '2026-10-25T10:00:00.000Z', summary: '', photos: [], items: [] }
  const pendingCompletion = { completion, amountPaid: 500, balanceDue: 1240 }

  test('keeps the local resume marker when the pulled cloud row has no completion yet', () => {
    const pulled = { id: 'e1', status: 'paid', totalAmount: 1740 }
    const merged = preserveLocalOnlyCompletionState(pulled, { id: 'e1', status: 'sent', totalAmount: 1000, pendingCompletion })
    assert.deepEqual(merged, { id: 'e1', status: 'paid', totalAmount: 1740, pendingCompletion })
  })

  test('keeps a stored local completion the cloud does not have yet (write-once) and queues it for push', () => {
    const pulled = { id: 'e1', status: 'sent', updatedAt: '2026-10-26T09:00:00.000Z', synced: true }
    const merged = preserveLocalOnlyCompletionState(pulled, { id: 'e1', completion })
    assert.equal(merged.status, 'sent')
    assert.deepEqual(merged.completion, completion)
    assert.equal(merged.synced, false)
    assert.equal(resolveLwwSyncAction({ localUpdatedAt: merged.updatedAt, cloudUpdatedAt: pulled.updatedAt }), 'push')
  })

  test('prefers the cloud completion when both exist', () => {
    const cloudCompletion = { ...completion, summary: 'cloud' }
    const pulled = { id: 'e1', completion: cloudCompletion }
    assert.equal(preserveLocalOnlyCompletionState(pulled, { id: 'e1', completion }), pulled)
  })

  test('drops the marker once the cloud already holds the completion', () => {
    const pulled = { id: 'e1', completion }
    assert.equal(preserveLocalOnlyCompletionState(pulled, { id: 'e1', pendingCompletion }), pulled)
  })

  test('is a no-op without a local marker', () => {
    const pulled = { id: 'e1' }
    assert.equal(preserveLocalOnlyCompletionState(pulled, undefined), pulled)
    assert.equal(preserveLocalOnlyCompletionState(pulled, { id: 'e1' }), pulled)
  })
})

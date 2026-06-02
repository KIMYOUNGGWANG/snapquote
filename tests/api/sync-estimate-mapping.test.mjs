import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  applyCloudCustomerPortalLinkToLocalEstimate,
  applyCloudQuickBooksLinkToLocalEstimate,
  assertSupabaseMutation,
  hasCustomerPortalEstimatePatchChanged,
  hasQuickBooksEstimatePatchChanged,
  mapCloudEstimateToLocal,
  mapCloudCustomerPortalLinkToLocalPatch,
  mapCloudQuickBooksLinkToLocalPatch,
  mapLocalEstimateAttachmentsToCloudRow,
  mapLocalEstimateItemToCloudRow,
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
      last_payment_session_id: 'cs_revision_paid_1',
      revision_of_estimate_id: 'estimate-cloud-original',
      revision_of_estimate_number: 'EST-2605-900',
      revision_requested_at: '2026-05-23T09:00:00.000Z',
      superseded_by_estimate_id: 'estimate-revision-2',
      superseded_at: '2026-05-24T10:00:00.000Z',
      first_followed_up_at: '2026-05-24T09:30:00.000Z',
      last_followed_up_at: '2026-05-25T09:30:00.000Z',
    })
  })
})

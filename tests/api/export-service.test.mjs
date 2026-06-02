import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { generateQuickBooksCSV } from "../../lib/export-service.ts"

function buildEstimate(overrides = {}) {
  return {
    id: "estimate-export-1",
    estimateNumber: "EST-EXPORT-001",
    items: [
      {
        id: "item-1",
        itemNumber: 1,
        category: "SERVICE",
        description: "Service work",
        quantity: 1,
        unit: "LS",
        unit_price: 1200,
        total: 1200,
      },
    ],
    summary_note: "Service work",
    clientName: "Export Customer",
    clientAddress: "100 Main St",
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 1200,
    createdAt: "2026-04-10T12:00:00.000Z",
    updatedAt: "2026-04-10T12:00:00.000Z",
    sentAt: "2026-04-11T12:00:00.000Z",
    status: "sent",
    synced: true,
    ...overrides,
  }
}

describe("QuickBooks CSV export", () => {
  test("marks payment-completed sent estimates as paid with the paid activity date", () => {
    const csv = generateQuickBooksCSV([
      buildEstimate({
        paymentCompletedAt: "2026-05-29T12:00:00.000Z",
      }),
      buildEstimate({
        id: "estimate-export-2",
        estimateNumber: "EST-EXPORT-002",
        clientName: "Pending Export Customer",
        totalAmount: 950,
        items: [
          {
            id: "item-2",
            itemNumber: 1,
            category: "SERVICE",
            description: "Pending work",
            quantity: 1,
            unit: "LS",
            unit_price: 950,
            total: 950,
          },
        ],
      }),
    ])

    const lines = csv.split("\n")

    assert.match(lines[1], /^"5\/29\/2026","EST-EXPORT-001"/)
    assert.match(lines[1], /,"Paid"$/)
    assert.match(lines[2], /^"4\/11\/2026","EST-EXPORT-002"/)
    assert.match(lines[2], /,"Sent"$/)
  })
})

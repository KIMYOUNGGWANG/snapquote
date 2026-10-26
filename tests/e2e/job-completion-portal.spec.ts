import { expect, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test, type NextFixture } from "next/experimental/testmode/playwright"

// Homeowner portal (/q/[token]) after a completion report. The page reads Supabase on the server,
// so these tests mock that read through Next's test proxy (experimental.testProxy, dev only).
// No contractor session is seeded: a homeowner opens the link signed out.

type JsonRecord = Record<string, unknown>

const SCREENS_DIR = path.join(process.cwd(), ".superpowers/sdd/2026-10-25-job-completion-report/screens")
const BALANCE_LINK = "https://pay.snapquote.test/balance-link"

/** Screenshots for design review: `CAPTURE_SCREENS=1 pnpm test:e2e tests/e2e/job-completion-portal.spec.ts`. */
async function capture(page: Page, name: string, fullPage = true) {
    if (process.env.CAPTURE_SCREENS !== "1") return
    await page.screenshot({ path: path.join(SCREENS_DIR, `${name}.png`), fullPage, animations: "disabled" })
}


const PORTAL_TOKEN = "job-done-portal-token-0123456789abcdef"
const PHOTO = `data:image/png;base64,${readFileSync(path.join(process.cwd(), "public/hero-contractor.png")).toString("base64")}`
const LONG_SUMMARY = "Replaced the kitchen sink drain and P-trap, then ran water for ten minutes to check every joint. "
    .repeat(4)
    .concat("\nThe old shut-off valve was seized, so we left it in place — ask us if you want it swapped next visit.")

function makePortalSnapshot(overrides: JsonRecord = {}): JsonRecord {
    return {
        estimateNumber: "EST-1042",
        clientName: "Rivera Kitchen",
        clientAddress: "12 Rivera Lane",
        summaryNote: "Kitchen drain and valves.",
        taxRate: 13,
        taxAmount: 239.2,
        totalAmount: 2079.2,
        paymentLink: BALANCE_LINK,
        paymentLinkType: "custom",
        // Builder convention: flat items carry every line, section lines included.
        items: [
            { id: "item-drain", itemNumber: 1, category: "LABOR", description: "Remove old drain", quantity: 1, unit: "LS", unit_price: 640, total: 640 },
            { id: "item-ptrap", itemNumber: 2, category: "PARTS", description: "Install P-trap", quantity: 1, unit: "ea", unit_price: 600, total: 600 },
            { id: "item-leak", itemNumber: 3, category: "SERVICE", description: "Leak test", quantity: 1, unit: "LS", unit_price: 500, total: 500 },
            { id: "item-extra", itemNumber: 4, category: "SERVICE", description: "Extra shut-off valve", quantity: 1, unit: "LS", unit_price: 100, total: 100 },
        ],
        sections: [{
            id: "section-extra",
            name: "Added on site",
            addedOnSite: true,
            items: [{ id: "item-extra", itemNumber: 1, category: "SERVICE", description: "Extra shut-off valve", quantity: 1, unit: "LS", unit_price: 100, total: 100 }],
        }],
        completion: {
            completedAt: "2026-10-25T10:00:00.000Z",
            summary: "Replaced the kitchen drain and P-trap. Tested for leaks, no issues.",
            photos: [PHOTO, PHOTO],
            items: [
                { itemId: "item-drain", done: true, photoIndexes: [0] },
                { itemId: "item-ptrap", done: true, photoIndexes: [] },
                { itemId: "item-leak", done: true, photoIndexes: [1] },
            ],
            amountPaid: 839.2,
            balanceDue: 1240,
        },
        ...overrides,
    }
}

async function openPortal(page: Page, next: NextFixture, snapshot: JsonRecord, status = "approved") {
    await page.setViewportSize({ width: 375, height: 812 })
    next.onFetch((request) => {
        const url = new URL(request.url)
        if (request.method === "GET" && url.pathname.endsWith("/rest/v1/estimate_share_links")) {
            return new Response(JSON.stringify([{
                id: "share-job-done",
                user_id: "00000000-0000-4000-8000-000000000001",
                // Not a UUID, so the page skips the live payment-state read and trusts the snapshot.
                estimate_id: "estimate-job-complete",
                share_url: `https://snapquote.test/q/${PORTAL_TOKEN}`,
                estimate_snapshot: snapshot,
                status,
                viewed_at: "2026-10-21T08:00:00.000Z",
                ...(status === "approved" ? { approved_at: "2026-10-21T08:00:00.000Z" } : {}),
                profiles: { business_name: "Rivera Plumbing", phone: "+1 416 555 0142" },
            }]), { headers: { "content-type": "application/json" } })
        }
        return "abort"
    })
    await page.goto(`/q/${PORTAL_TOKEN}`)
    await expect(page.getByTestId("customer-quote-page")).toBeVisible()
}

test("portal: unpaid completion shows balance, checklist, extra work, and the quote once", async ({ page, next }) => {
    await openPortal(page, next, makePortalSnapshot({
        paymentTerms: "Balance due within 7 days of completion.",
        closingNote: "Thanks for choosing Rivera Plumbing.",
    }))

    const completion = page.getByTestId("customer-job-completion")
    await expect(completion.getByRole("heading", { name: "Your job is done" })).toBeVisible()
    await expect(completion.getByTestId("customer-completion-balance")).toHaveText("$1,240.00")
    const pay = completion.getByRole("link", { name: "Pay balance" })
    await expect(pay).toHaveAttribute("href", BALANCE_LINK)
    await expect(completion.getByTestId("customer-completion-received")).toHaveText("$839.20 paid so far of $2,079.20")
    await expect(completion.getByTestId("customer-completion-summary")).toHaveText(/Replaced the kitchen drain/)
    await expect(completion.getByTestId("customer-completion-done-count")).toHaveText("3 of 3 done")
    const rows = completion.getByTestId("customer-completion-item")
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(1).getByTestId("customer-completion-no-photo")).toBeVisible()
    const extra = completion.getByTestId("customer-completion-extra")
    await expect(extra).toContainText("Added on site")
    await expect(extra).toContainText("Extra shut-off valve")
    await expect(extra).toContainText("$100.00 + tax")

    // The quote body keeps every original line once; extra work is summarised, not repeated.
    await expect(page.getByTestId("customer-quote-line-item")).toHaveCount(3)
    await expect(page.getByTestId("customer-quote-added-on-site-total")).toHaveText("$100.00")
    await expect(page.getByTestId("customer-quote-subtotal")).toHaveText("$1,840.00")
    await expect(page.getByTestId("customer-quote-total")).toHaveText("$2,079.20")
    // The status copy is gone, but the contractor's terms and closing note stay.
    await expect(page.getByTestId("customer-quote-next-step-title")).toHaveCount(0)
    await expect(page.getByTestId("customer-quote-terms")).toContainText("Balance due within 7 days of completion.")
    await expect(page.getByTestId("customer-quote-closing-note")).toHaveText("Thanks for choosing Rivera Plumbing.")
    await expect(page.getByTestId("customer-quote-approve-button")).toHaveCount(0)
    // Mobile: only the report's button; the sidebar one is hidden below lg.
    await expect(page.getByRole("link", { name: "Pay balance" })).toHaveCount(1)

    await capture(page, "task10-unpaid-375")
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.getByTestId("customer-quote-pay-link")).toBeVisible()
    await expect(page.getByRole("link", { name: "Pay balance" })).toHaveCount(2)
    await capture(page, "task10-unpaid-1280")
})

test("portal: a photo opens large, Esc closes it and focus returns to the thumbnail", async ({ page, next }) => {
    await openPortal(page, next, makePortalSnapshot())

    const thumb = page.getByRole("button", { name: "Remove old drain, photo 1" })
    await thumb.click()
    const viewer = page.getByRole("dialog", { name: "Remove old drain" })
    await expect(viewer).toBeVisible()
    await expect(viewer.getByRole("img", { name: "Remove old drain, photo 1" })).toBeVisible()
    await capture(page, "task10-photo-375", false)

    await page.keyboard.press("Escape")
    await expect(viewer).toBeHidden()
    await expect(thumb).toBeFocused()

    await thumb.click()
    await viewer.getByRole("button", { name: "Close" }).click()
    await expect(viewer).toBeHidden()
    await expect(thumb).toBeFocused()
})

test("portal: paid completion says paid in full and offers no payment", async ({ page, next }) => {
    await openPortal(page, next, makePortalSnapshot({ paymentStatus: "paid", paymentCompletedAt: "2026-10-26T09:00:00.000Z" }))

    const completion = page.getByTestId("customer-job-completion")
    await expect(completion.getByRole("heading", { name: "Your job is done" })).toBeVisible()
    await expect(completion.getByTestId("customer-completion-paid")).toHaveText("Paid in full")
    await expect(completion.getByTestId("customer-completion-received")).toHaveText("$2,079.20 paid")
    await expect(page.getByRole("link", { name: "Pay balance" })).toHaveCount(0)
    await expect(page.getByTestId("customer-quote-status")).toHaveText(/paid/i)
    await expect(page.getByText(/Payment received/)).toHaveCount(1)
    await expect(page.getByTestId("customer-quote-next-step")).toHaveCount(0)

    await capture(page, "task10-paid-375")
    await page.setViewportSize({ width: 1280, height: 800 })
    await capture(page, "task10-paid-1280")
})

test("portal: no extra work, an unconfirmed line and a long summary", async ({ page, next }) => {
    await openPortal(page, next, makePortalSnapshot({
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 1740,
        items: (makePortalSnapshot().items as JsonRecord[]).slice(0, 3),
        sections: undefined,
        completion: {
            completedAt: "2026-10-25T10:00:00.000Z",
            summary: LONG_SUMMARY,
            photos: [PHOTO],
            items: [
                { itemId: "item-drain", done: true, photoIndexes: [0] },
                { itemId: "item-ptrap", done: true, photoIndexes: [] },
                { itemId: "item-leak", done: false, photoIndexes: [] },
            ],
            amountPaid: 0,
            balanceDue: 1740,
        },
    }))

    const completion = page.getByTestId("customer-job-completion")
    await expect(completion.getByTestId("customer-completion-balance")).toHaveText("$1,740.00")
    await expect(completion.getByTestId("customer-completion-received")).toHaveText("Nothing paid yet of $1,740.00")
    await expect(completion.getByTestId("customer-completion-done-count")).toHaveText("2 of 3 done")
    await expect(completion.getByTestId("customer-completion-item").nth(2)).toHaveAttribute("data-done", "false")
    await expect(completion.getByTestId("customer-completion-extra")).toHaveCount(0)
    await expect(page.getByTestId("customer-quote-line-item")).toHaveCount(3)
    await expect(page.getByTestId("customer-quote-added-on-site-total")).toHaveCount(0)

    await capture(page, "task10-no-extra-375")
})

test("portal: a completion on a viewed quote shows payment only, no approve form", async ({ page, next }) => {
    await openPortal(page, next, makePortalSnapshot(), "viewed")

    await expect(page.getByTestId("customer-job-completion").getByRole("heading", { name: "Your job is done" })).toBeVisible()
    await expect(page.getByTestId("customer-quote-actions").getByRole("heading", { name: "Payment" })).toBeVisible()
    await expect(page.getByTestId("customer-quote-approve-button")).toHaveCount(0)
    await expect(page.getByTestId("customer-quote-change-button")).toHaveCount(0)
    await expect(page.getByTestId("customer-quote-message-input")).toHaveCount(0)
    await expect(page.getByRole("link", { name: "Pay balance" })).toHaveCount(1)
})

import { expect, type Page } from "@playwright/test"
import path from "node:path"
import { test, type NextFixture } from "next/experimental/testmode/playwright"

// Homeowner portal (/q/[token]) with a 3D walkthrough preview. Supabase reads are mocked through Next's
// test proxy (same approach as job-completion-portal.spec.ts), so no real database is touched.

const PORTAL_TOKEN = "walkthrough-portal-token-0123456789abcd"
const OWNER_ID = "00000000-0000-4000-8000-000000000002"
const PREVIEW_URL = "https://walk.example.test/p/kitchen-a1b2c3/"

/** Screenshots for review: `CAPTURE_SCREENS=1 SCREENS_DIR=<dir> pnpm test:e2e tests/e2e/walkthrough-portal.spec.ts`. */
async function capture(page: Page, name: string) {
    if (process.env.CAPTURE_SCREENS !== "1" || !process.env.SCREENS_DIR) return
    await page.screenshot({ path: path.join(process.env.SCREENS_DIR, `${name}.png`), fullPage: true, animations: "disabled" })
}

type WalkthroughMock = { kind: "row"; row: Record<string, unknown> } | { kind: "none" } | { kind: "error" }

async function openPortal(page: Page, next: NextFixture, walkthrough: WalkthroughMock) {
    next.onFetch(async (request) => {
        const url = new URL(request.url)
        if (request.method === "GET" && url.pathname.endsWith("/rest/v1/estimate_share_links")) {
            return new Response(JSON.stringify([{
                id: "share-walkthrough",
                user_id: OWNER_ID,
                estimate_id: "estimate-kitchen",
                share_url: `https://snapquote.test/q/${PORTAL_TOKEN}`,
                estimate_snapshot: {
                    estimateNumber: "EST-2048",
                    clientName: "Nguyen Kitchen",
                    clientAddress: "8 Maple Ave",
                    summaryNote: "Kitchen refresh: white shaker cabinets, quartz counters, subway tile.",
                    taxRate: 13,
                    taxAmount: 1950,
                    totalAmount: 16950,
                    items: [
                        { id: "i1", itemNumber: 1, category: "MATERIAL", description: "White shaker cabinet doors", quantity: 22, unit: "ea", unit_price: 300, total: 6600 },
                        { id: "i2", itemNumber: 2, category: "MATERIAL", description: "Quartz countertops", quantity: 1, unit: "LS", unit_price: 5400, total: 5400 },
                        { id: "i3", itemNumber: 3, category: "LABOR", description: "Subway tile backsplash", quantity: 1, unit: "LS", unit_price: 3000, total: 3000 },
                    ],
                },
                status: "viewed",
                viewed_at: "2026-11-16T08:00:00.000Z",
                profiles: { business_name: "Maple Renovations", phone: "+1 416 555 0199" },
            }]), { headers: { "content-type": "application/json" } })
        }
        if (request.method === "GET" && url.pathname.endsWith("/rest/v1/estimate_walkthroughs")) {
            if (walkthrough.kind === "error") return new Response(JSON.stringify({ message: "boom" }), { status: 500 })
            return new Response(JSON.stringify(walkthrough.kind === "row" ? [walkthrough.row] : []), {
                headers: { "content-type": "application/json" },
            })
        }
        return "abort"
    })
    await page.goto(`/q/${PORTAL_TOKEN}`)
    await expect(page.getByTestId("customer-quote-page")).toBeVisible()
}

test("portal: a ready 3D preview shows a card that opens the walkthrough in a new tab", async ({ page, next }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await openPortal(page, next, { kind: "row", row: { status: "ready", url: PREVIEW_URL, requested_at: "2026-11-16T07:00:00.000Z" } })

    const card = page.getByTestId("customer-quote-walkthrough")
    await expect(card.getByRole("heading", { name: "See your finished room in 3D" })).toBeVisible()
    const link = card.getByRole("link", { name: "Open 3D preview" })
    await expect(link).toHaveAttribute("href", PREVIEW_URL)
    await expect(link).toHaveAttribute("target", "_blank")
    await expect(link).toHaveAttribute("rel", "noopener noreferrer")
    await expect(page.getByTestId("customer-quote-line-item")).toHaveCount(3)
    await capture(page, "walkthrough-ready-375")

    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(card).toBeVisible()
    await capture(page, "walkthrough-ready-1280")
})

test("portal: no card while the preview is only requested, missing, or unreadable", async ({ page, next }) => {
    for (const walkthrough of [
        { kind: "row", row: { status: "requested", url: null, requested_at: "2026-11-16T07:00:00.000Z" } },
        { kind: "none" },
        { kind: "error" },
    ] satisfies WalkthroughMock[]) {
        await openPortal(page, next, walkthrough)
        await expect(page.getByTestId("customer-quote-walkthrough")).toHaveCount(0)
        await expect(page.getByTestId("customer-quote-line-item")).toHaveCount(3)
    }
})

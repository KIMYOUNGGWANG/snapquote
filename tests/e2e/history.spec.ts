import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local", quiet: true })

async function expectTouchTarget(locator: Locator) {
    const box = await locator.boundingBox()

    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
}

type SeedEstimate = {
    id: string
    estimateNumber: string
    status: "draft" | "sent" | "paid"
    clientName: string
    clientAddress: string
    summary_note: string
    taxRate: number
    taxAmount: number
    totalAmount: number
    clientEmail?: string
    createdAt: string
    updatedAt: string
    sentAt?: string
    paymentLinkId?: string
    paymentCompletedAt?: string
    synced?: boolean
    items: Array<{
        id: string
        itemNumber: number
        category: "PARTS" | "LABOR" | "SERVICE" | "OTHER"
        description: string
        quantity: number
        unit: "ea" | "LS" | "hr" | "day" | "SF" | "LF" | "%" | "other"
        unit_price: number
        total: number
    }>
}

function getSupabaseAuthStorageKey() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0]
    return `sb-${projectRef}-auth-token`
}

async function seedAuthenticatedSupabaseSession(context: BrowserContext) {
    await context.addInitScript(({ storageKey }) => {
        window.localStorage.setItem(
            storageKey,
            JSON.stringify({
                access_token: "test-access-token",
                refresh_token: "test-refresh-token",
                token_type: "bearer",
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                user: {
                    id: "00000000-0000-4000-8000-000000000001",
                    aud: "authenticated",
                    role: "authenticated",
                    email: "test@example.com",
                },
            })
        )
    }, { storageKey: getSupabaseAuthStorageKey() })
}

async function routeAuthenticatedHistoryShell(page: Page) {
    await page.route("**/auth/v1/user**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                id: "00000000-0000-4000-8000-000000000001",
                aud: "authenticated",
                role: "authenticated",
                email: "test@example.com",
            }),
        })
    })
    await page.route("**/api/quickbooks/status", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: true,
                planTier: "pro",
                eligible: true,
                connected: false,
                reconnectRequired: false,
                syncStats: { syncedInvoices: 0 },
            }),
        })
    })
    await page.route("**/api/billing/subscription", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: true,
                planTier: "pro",
                status: "active",
                currentPeriodEnd: "2026-06-30T00:00:00.000Z",
            }),
        })
    })
    await page.route("**/api/referrals/token", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, token: "followup26" }),
        })
    })
}

const seedEstimates: SeedEstimate[] = [
    {
        id: "estimate-draft-1",
        estimateNumber: "EST-2605-101",
        status: "draft",
        clientName: "Apex Kitchen Remodel",
        clientAddress: "120 Cedar Ave",
        summary_note: "Cabinet rough-in and permit prep for kitchen remodel.",
        taxRate: 8.25,
        taxAmount: 0,
        totalAmount: 640,
        createdAt: "2026-05-23T08:00:00.000Z",
        updatedAt: "2026-05-23T10:00:00.000Z",
        synced: false,
        items: [
            {
                id: "draft-item-1",
                itemNumber: 1,
                category: "SERVICE",
                description: "Cabinet rough-in labor",
                quantity: 1,
                unit: "LS",
                unit_price: 640,
                total: 640,
            },
            {
                id: "draft-item-2",
                itemNumber: 2,
                category: "PARTS",
                description: "Permit allowance",
                quantity: 1,
                unit: "ea",
                unit_price: 0,
                total: 0,
            },
        ],
    },
    {
        id: "estimate-sent-1",
        estimateNumber: "EST-2605-102",
        status: "sent",
        clientName: "Harbor Roof Repair",
        clientAddress: "44 Bay Point",
        summary_note: "Emergency roof patch and flashing repair.",
        taxRate: 8.25,
        taxAmount: 96,
        totalAmount: 1280,
        createdAt: "2026-05-22T08:00:00.000Z",
        updatedAt: "2026-05-22T12:00:00.000Z",
        sentAt: "2026-05-22T12:00:00.000Z",
        paymentLinkId: "plink_harbor_roof",
        synced: true,
        items: [
            {
                id: "sent-item-1",
                itemNumber: 1,
                category: "SERVICE",
                description: "Emergency roof patch",
                quantity: 1,
                unit: "LS",
                unit_price: 1280,
                total: 1280,
            },
        ],
    },
    {
        id: "estimate-paid-1",
        estimateNumber: "EST-2605-103",
        status: "paid",
        clientName: "Maple Service Call",
        clientAddress: "9 Maple Street",
        summary_note: "Replace leaking shutoff valve and test operation.",
        taxRate: 8.25,
        taxAmount: 31.25,
        totalAmount: 410,
        createdAt: "2026-05-21T08:00:00.000Z",
        updatedAt: "2026-05-21T14:00:00.000Z",
        paymentCompletedAt: "2026-05-21T14:00:00.000Z",
        synced: true,
        items: [
            {
                id: "paid-item-1",
                itemNumber: 1,
                category: "SERVICE",
                description: "Shutoff valve replacement",
                quantity: 1,
                unit: "ea",
                unit_price: 410,
                total: 410,
            },
        ],
    },
]

async function openSeededDB(page: Page, estimates: SeedEstimate[]) {
    await page.goto("/")

    await page.evaluate(async (records) => {
        function requestToPromise<T>(request: IDBRequest<T>) {
            return new Promise<T>((resolve, reject) => {
                request.onerror = () => reject(request.error)
                request.onsuccess = () => resolve(request.result)
            })
        }

        await new Promise<void>((resolve, reject) => {
            const deleteRequest = indexedDB.deleteDatabase("snapquote-db")
            deleteRequest.onerror = () => reject(deleteRequest.error)
            deleteRequest.onsuccess = () => resolve()
            deleteRequest.onblocked = () => resolve()
        })

        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("snapquote-db", 6)
            request.onerror = () => reject(request.error)
            request.onupgradeneeded = () => {
                const database = request.result
                const createStore = (
                    name: string,
                    indexes: Array<{ name: string; keyPath: string }>
                ) => {
                    const store = database.objectStoreNames.contains(name)
                        ? request.transaction!.objectStore(name)
                        : database.createObjectStore(name, { keyPath: "id" })

                    for (const index of indexes) {
                        if (!store.indexNames.contains(index.name)) {
                            store.createIndex(index.name, index.keyPath)
                        }
                    }
                }

                createStore("estimates", [
                    { name: "by-date", keyPath: "createdAt" },
                    { name: "by-status", keyPath: "status" },
                ])
                createStore("photos", [{ name: "by-estimate", keyPath: "estimateId" }])
                createStore("pendingAudio", [
                    { name: "by-date", keyPath: "createdAt" },
                    { name: "by-processed", keyPath: "processed" },
                ])
                createStore("priceList", [
                    { name: "by-category", keyPath: "category" },
                    { name: "by-name", keyPath: "name" },
                ])
                createStore("receipts", [{ name: "by-date", keyPath: "date" }])
                createStore("timeEntries", [{ name: "by-date", keyPath: "date" }])
                createStore("clients", [{ name: "by-name", keyPath: "name" }])
            }
            request.onsuccess = () => resolve(request.result)
        })

        const transaction = db.transaction("estimates", "readwrite")
        const store = transaction.objectStore("estimates")
        await Promise.all(records.map((estimate) => requestToPromise(store.put(estimate))))
        await new Promise<void>((resolve, reject) => {
            transaction.onerror = () => reject(transaction.error)
            transaction.oncomplete = () => resolve()
        })
        db.close()
    }, estimates)
}

test("empty history next action keeps guidance readable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history")

    const nextAction = page.getByTestId("history-next-action")
    await expect(nextAction).toBeVisible()
    await expect(nextAction).toContainText("Start the next quote")
    await expect(nextAction).toContainText("No open follow-up is blocking the pipeline")

    const titleFits = await page.getByTestId("history-page-title").evaluate((element) => {
        return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
    })
    const descriptionFits = await page.getByTestId("history-next-action-description").evaluate((element) => {
        return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
    })
    const nextActionBox = await nextAction.boundingBox()
    const localSignInBox = await page.getByTestId("history-local-signin-link").boundingBox()
    const nextActionButtonBox = await page.getByTestId("history-next-action-button").boundingBox()
    const bottomNavBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(titleFits).toBe(true)
    expect(descriptionFits).toBe(true)
    expect(nextActionBox).not.toBeNull()
    expect(localSignInBox).not.toBeNull()
    expect(nextActionButtonBox).not.toBeNull()
    expect(bottomNavBox).not.toBeNull()
    expect(localSignInBox!.height).toBeGreaterThanOrEqual(44)
    expect(nextActionButtonBox!.height).toBeGreaterThanOrEqual(44)
    expect(nextActionBox!.y + nextActionBox!.height).toBeLessThanOrEqual(bottomNavBox!.y - 8)
})

test("empty history command center remains readable on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/history")

    const titleFits = await page.getByTestId("history-page-title").evaluate((element) => {
        return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
    })
    const descriptionFits = await page.getByTestId("history-next-action-description").evaluate((element) => {
        return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
    })

    expect(titleFits).toBe(true)
    expect(descriptionFits).toBe(true)
})

test("history desktop uses a two-column workbench for lanes and operations", async ({ page }) => {
    await openSeededDB(page, seedEstimates)

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/history")

    await expect(page.getByTestId("history-workbench")).toBeVisible()
    await expect(page.getByTestId("history-estimate-lanes-section")).toBeVisible()
    await expect(page.getByTestId("history-operations-panel")).toBeVisible()
    await expect(page.getByText("Offline Queue")).toBeVisible()
    await expect(page.getByText("QuickBooks Sync")).toBeVisible()
    await expect(page.getByTestId("history-draft-value")).toHaveText("$640.00 open value")
    await expect(page.getByTestId("history-sent-value")).toHaveText("$1280.00 out")
    await expect(page.getByTestId("history-paid-value")).toHaveText("$410.00 collected")
    await expect(page.getByTestId("history-total-records")).toHaveText("3 total records")

    const workbenchBox = await page.getByTestId("history-workbench").boundingBox()
    const lanesBox = await page.getByTestId("history-estimate-lanes-section").boundingBox()
    const operationsBox = await page.getByTestId("history-operations-panel").boundingBox()
    const bottomNavBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(workbenchBox).not.toBeNull()
    expect(lanesBox).not.toBeNull()
    expect(operationsBox).not.toBeNull()
    expect(bottomNavBox).not.toBeNull()
    expect(workbenchBox!.width).toBeGreaterThan(900)
    expect(lanesBox!.x).toBeLessThan(operationsBox!.x)
    expect(Math.abs(lanesBox!.y - operationsBox!.y)).toBeLessThanOrEqual(2)
    expect(lanesBox!.width).toBeGreaterThan(560)
    expect(operationsBox!.width).toBeGreaterThan(300)
    expect(operationsBox!.y).toBeLessThan(bottomNavBox!.y - 8)
})

test("history mobile command center and search keep the pipeline actionable", async ({ page }) => {
    await openSeededDB(page, seedEstimates)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history")

    const nextAction = page.getByTestId("history-next-action")
    await expect(nextAction).toBeVisible()
    await expect(nextAction).toContainText("Finish draft pricing")
    await expect(nextAction).toContainText("Apex Kitchen Remodel")
    await expect(page.getByTestId("history-next-action-button")).toContainText("Finish pricing")
    await expect(page.getByTestId("history-local-mode-banner")).toBeVisible()
    await expect(page.getByTestId("sync-status-button")).toHaveCount(0)

    const firstDraftTitle = page.getByTestId("history-estimate-lanes-section").getByText("Apex Kitchen Remodel").first()
    await expect(firstDraftTitle).toBeVisible()
    await expect(page.getByTestId("history-edit-draft-button")).toContainText("Finish pricing")
    await expect(page.getByTestId("history-estimate-lanes-section")).toContainText("1 of 1")
    await expectTouchTarget(page.getByRole("button", { name: "Refresh QuickBooks status" }))

    const firstDraftTitleBox = await firstDraftTitle.boundingBox()
    const bottomNavBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(firstDraftTitleBox).not.toBeNull()
    expect(bottomNavBox).not.toBeNull()
    expect(firstDraftTitleBox!.y).toBeLessThan(bottomNavBox!.y - 8)

    await page.getByTestId("history-search-input").fill("roof")
    await expect(page.getByText("No matching estimates")).toBeVisible()
    const clearSearchBox = await page.getByTestId("history-clear-search").boundingBox()
    expect(clearSearchBox).not.toBeNull()
    expect(clearSearchBox!.width).toBeGreaterThanOrEqual(44)
    expect(clearSearchBox!.height).toBeGreaterThanOrEqual(44)

    await page.getByTestId("history-sent-tab").click()
    await expect(page.getByText("Harbor Roof Repair").first()).toBeVisible()
    await expect(page.getByTestId("history-estimate-lanes-section")).toContainText("1 of 1")

    await page.getByTestId("history-clear-search").click()
    await expect(page.getByText("Harbor Roof Repair").first()).toBeVisible()
})

test("history follow-up modal keeps long send issues readable on narrow mobile", async ({ page, context }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await seedAuthenticatedSupabaseSession(context)
    await routeAuthenticatedHistoryShell(page)

    const longFollowUpError = [
        "FOLLOW_UP_EMAIL_PROVIDER_QUOTA_LIMIT_FOR_FIELD_CREW_CUSTOMER_WITH_LONG_REFERENCE",
        "Monthly email quota reached after the follow-up message was prepared for customer delivery.",
    ].join(" ")

    await page.route("**/api/send-email", async (route) => {
        await route.fulfill({
            status: 402,
            contentType: "application/json",
            body: JSON.stringify({
                error: longFollowUpError,
                code: "FREE_PLAN_LIMIT_REACHED",
            }),
        })
    })

    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: "estimate-follow-up-mobile",
            estimateNumber: "EST-2605-FOLLOW-UP-LONG-REFERENCE",
            clientName: "Long Follow Up Customer",
            clientEmail: "long-follow-up@example.com",
            paymentLinkId: undefined,
        },
    ])

    await page.goto("/history")
    await page.getByTestId("history-sent-tab").click()
    await expect(page.getByText("Long Follow Up Customer").first()).toBeVisible()

    await page.getByTestId("history-more-actions-toggle").click()
    await page.getByRole("button", { name: "Follow-up" }).click()

    const dialog = page.getByRole("dialog", { name: "Send Follow-up" })
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId("follow-up-summary")).toBeVisible()
    await expect(page.getByLabel("Client Email *")).toHaveValue("long-follow-up@example.com")
    await expect(page.getByLabel("Message")).toHaveValue(/Hi Long Follow Up Customer/)
    await expect(page.getByLabel("Message")).toHaveValue(/EST-2605-FOLLOW-UP-LONG-REFERENCE/)

    const footerBox = await page.getByTestId("follow-up-modal-footer").boundingBox()
    const sendButtonBox = await dialog.getByRole("button", { name: "Send Follow-up" }).boundingBox()
    const dialogFits = await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    expect(footerBox).not.toBeNull()
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(700)
    expect(sendButtonBox).not.toBeNull()
    expect(sendButtonBox!.height).toBeGreaterThanOrEqual(44)
    expect(dialogFits).toBe(true)

    await dialog.getByRole("button", { name: "Send Follow-up" }).click()

    const deliveryIssue = page.getByTestId("follow-up-delivery-issue")
    const deliveryIssueMessage = page.getByTestId("follow-up-delivery-issue-message")
    await expect(deliveryIssue).toBeVisible({ timeout: 10_000 })
    await expect(deliveryIssue).toContainText("Upgrade to keep emailing PDFs")
    await expect(deliveryIssueMessage).toContainText("FOLLOW_UP_EMAIL_PROVIDER_QUOTA_LIMIT")
    await expect(page.getByTestId("follow-up-delivery-action")).toHaveAttribute("href", "/pricing")
    await expect(page.getByTestId("toast-message")).toHaveCount(0)

    const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    const issueFits = await deliveryIssue.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    const messageFits = await deliveryIssueMessage.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    const retryButtonBox = await page.getByTestId("follow-up-delivery-retry-action").boundingBox()
    expect(pageFits).toBe(true)
    expect(issueFits).toBe(true)
    expect(messageFits).toBe(true)
    expect(retryButtonBox).not.toBeNull()
    expect(retryButtonBox!.height).toBeGreaterThanOrEqual(44)
    await expect.poll(async () => {
        const issueBox = await deliveryIssue.boundingBox()
        const latestFooterBox = await page.getByTestId("follow-up-modal-footer").boundingBox()

        return Boolean(issueBox && latestFooterBox && issueBox.y + issueBox.height <= latestFooterBox.y + 1)
    }).toBe(true)
})

test("history PDF download keeps the estimate and customer in the filename", async ({ page }) => {
    await openSeededDB(page, seedEstimates)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history")
    await expect(page.getByText("Apex Kitchen Remodel").first()).toBeVisible()

    const downloadPromise = page.waitForEvent("download")
    await page
        .getByTestId("history-estimate-primary-actions")
        .first()
        .getByRole("button", { name: "PDF" })
        .click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe("EST-2605-101-apex-kitchen-remodel-estimate.pdf")
    await expect(page.getByText("PDF downloaded as EST-2605-101-apex-kitchen-remodel-estimate.pdf.")).toBeVisible()
})

test("history PDF download toast keeps long filenames readable above mobile navigation", async ({ page }) => {
    await openSeededDB(page, [
        {
            ...seedEstimates[0],
            id: "estimate-long-toast",
            estimateNumber: "EST-2605-199",
            clientName: "SupercalifragilisticexpialidociousBasementRestorationDivision",
        },
    ])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history")
    await expect(page.getByText("SupercalifragilisticexpialidociousBasementRestorationDivision").first()).toBeVisible()

    const historyPageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    const cardTitleFits = await page
        .getByTestId("history-estimate-client-name")
        .first()
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    const nextActionDescriptionFits = await page
        .getByTestId("history-next-action-description")
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    expect(historyPageFits).toBe(true)
    expect(cardTitleFits).toBe(true)
    expect(nextActionDescriptionFits).toBe(true)

    const downloadPromise = page.waitForEvent("download")
    await page
        .getByTestId("history-estimate-primary-actions")
        .first()
        .getByRole("button", { name: "PDF" })
        .click()
    await downloadPromise

    const toastMessage = page.getByTestId("toast-message")
    const toastText = page.getByTestId("toast-message-text")
    const bottomNavigation = page.getByTestId("bottom-navigation")
    await expect(toastMessage).toBeVisible()
    await expect(toastText).toContainText("supercalifragilisticexpialidociousbasementresto")

    const toastTextFits = await toastText.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    const toastBox = await toastMessage.boundingBox()
    const navBox = await bottomNavigation.boundingBox()

    expect(toastBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(toastTextFits).toBe(true)
    expect(toastBox!.x).toBeGreaterThanOrEqual(12)
    expect(toastBox!.x + toastBox!.width).toBeLessThanOrEqual(viewportWidth - 12)
    expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

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
    clientPhone?: string
    createdAt: string
    updatedAt: string
    sentAt?: string
    paymentLink?: string
    paymentLinkId?: string
    customerPortalUrl?: string
    customerPortalStatus?: "shared" | "viewed" | "approved" | "change_requested"
    customerViewedAt?: string
    customerApprovedAt?: string
    customerChangeRequestedAt?: string
    customerPortalNote?: string
    supersededByEstimateId?: string
    supersededAt?: string
    firstFollowedUpAt?: string
    lastFollowedUpAt?: string
    lastFollowUpChannel?: "email" | "sms" | "automation"
    paymentCompletedAt?: string
    synced?: boolean
    attachments?: {
        photos: string[]
        originalTranscript?: string
        scopeAssumptionsConfirmedAt?: string
    }
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

type QuickBooksStatusFixture = {
    ok: true
    planTier: "free" | "starter" | "pro" | "team"
    eligible: boolean
    connected: boolean
    reconnectRequired: boolean
    syncStats: { syncedInvoices: number }
    realmId?: string | null
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

async function routeAuthenticatedHistoryShell(
    page: Page,
    options: {
        onShareLinkPost?: (payload: unknown) => void
        shareLinkResponse?: {
            ok: true
            shareUrl: string
            portal: {
                status: "shared" | "viewed" | "approved" | "change_requested"
                viewedAt?: string
                approvedAt?: string
                changeRequestedAt?: string
            }
        }
        quickBooksStatus?: QuickBooksStatusFixture
        quickBooksStatusResponses?: Array<{
            status: number
            body: unknown
        }>
        onQuickBooksStatusRequest?: (count: number) => void
    } = {}
) {
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
    let quickBooksStatusRequestCount = 0
    await page.route("**/api/quickbooks/status", async (route) => {
        quickBooksStatusRequestCount += 1
        options.onQuickBooksStatusRequest?.(quickBooksStatusRequestCount)
        const quickBooksStatusResponse = options.quickBooksStatusResponses?.[
            Math.min(quickBooksStatusRequestCount - 1, options.quickBooksStatusResponses.length - 1)
        ]

        if (quickBooksStatusResponse) {
            await route.fulfill({
                status: quickBooksStatusResponse.status,
                contentType: "application/json",
                body: JSON.stringify(quickBooksStatusResponse.body),
            })
            return
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(options.quickBooksStatus ?? {
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
    await page.route("**/api/estimates/*/share-link", async (route) => {
        if (route.request().method() === "GET") {
            await route.fulfill({
                status: 404,
                contentType: "application/json",
                body: JSON.stringify({ error: { message: "Customer quote link was not found.", code: 404 } }),
            })
            return
        }

        options.onShareLinkPost?.(route.request().postDataJSON())

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(options.shareLinkResponse || {
                ok: true,
                shareUrl: "https://snapquote.test/q/followup-approval-link",
                portal: { status: "shared" },
            }),
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
        attachments: {
            photos: [],
            originalTranscript: "Cabinet rough-in and permit prep for kitchen remodel.",
            scopeAssumptionsConfirmedAt: "2026-05-23T10:05:00.000Z",
        },
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

async function readEstimateFollowUpFields(page: Page, estimateId: string) {
    return page.evaluate(async (id) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("snapquote-db", 6)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
        const estimate = await new Promise<{
            firstFollowedUpAt?: string
            lastFollowedUpAt?: string
            lastFollowUpChannel?: string
            synced?: boolean
        } | undefined>((resolve, reject) => {
            const transaction = db.transaction("estimates", "readonly")
            const request = transaction.objectStore("estimates").get(id)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
        db.close()

        return {
            firstFollowedUpAt: estimate?.firstFollowedUpAt,
            lastFollowedUpAt: estimate?.lastFollowedUpAt,
            lastFollowUpChannel: estimate?.lastFollowUpChannel,
            synced: estimate?.synced,
        }
    }, estimateId)
}

async function readEstimatePaymentFields(page: Page, estimateId: string) {
    return page.evaluate(async (id) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("snapquote-db", 6)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
        const estimate = await new Promise<{
            status?: "draft" | "sent" | "paid"
            paymentLink?: string
            paymentLinkId?: string
            paymentLinkType?: string
            paymentCompletedAt?: string
            customerPortalStatus?: string
            customerPortalUrl?: string
            synced?: boolean
        } | undefined>((resolve, reject) => {
            const transaction = db.transaction("estimates", "readonly")
            const request = transaction.objectStore("estimates").get(id)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
        db.close()

        return {
            status: estimate?.status,
            paymentLink: estimate?.paymentLink,
            paymentLinkId: estimate?.paymentLinkId,
            paymentLinkType: estimate?.paymentLinkType,
            paymentCompletedAt: estimate?.paymentCompletedAt,
            customerPortalStatus: estimate?.customerPortalStatus,
            customerPortalUrl: estimate?.customerPortalUrl,
            synced: estimate?.synced,
        }
    }, estimateId)
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

test("history QuickBooks gate links ineligible users to Pro pricing context", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    await routeAuthenticatedHistoryShell(page, {
        quickBooksStatus: {
            ok: true,
            planTier: "starter",
            eligible: false,
            connected: false,
            reconnectRequired: false,
            syncStats: { syncedInvoices: 0 },
        },
    })
    await openSeededDB(page, seedEstimates)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history")

    await expect(page.getByText("QuickBooks Sync")).toBeVisible()
    await expect(page.getByText("Upgrade to Pro or Team to unlock direct QuickBooks invoice sync.")).toBeVisible()
    await expect(page.getByTestId("history-quickbooks-connect-primary")).toHaveCount(0)
    const upgradeAction = page.getByTestId("history-quickbooks-upgrade-action")
    await expect(upgradeAction).toBeVisible()
    await expect(upgradeAction).toHaveAttribute("href", "/pricing?plan=pro&source=quickbooks_sync")

    await upgradeAction.click()

    await expect(page).toHaveURL(/\/pricing\?plan=pro&source=quickbooks_sync/)
    await expect(page.getByTestId("pricing-source-context")).toContainText("QuickBooks sync")
})

test("history keeps QuickBooks status failures visible with retry and CSV fallback", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    let statusRequests = 0
    await routeAuthenticatedHistoryShell(page, {
        onQuickBooksStatusRequest: (count) => {
            statusRequests = count
        },
        quickBooksStatusResponses: [
            {
                status: 500,
                body: { error: "QuickBooks status is temporarily unavailable." },
            },
            {
                status: 200,
                body: {
                    ok: true,
                    planTier: "pro",
                    eligible: true,
                    connected: false,
                    reconnectRequired: false,
                    syncStats: { syncedInvoices: 0 },
                },
            },
        ],
    })
    await openSeededDB(page, seedEstimates)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history")

    const quickBooksIssue = page.getByTestId("history-quickbooks-panel-issue")
    await expect(quickBooksIssue).toBeVisible()
    await expect(quickBooksIssue).toContainText("QuickBooks status is unavailable")
    await expect(quickBooksIssue).toContainText("Retry the connection check or export CSV")
    await expect(page.getByTestId("history-quickbooks-status-retry-action")).toContainText("Retry status")
    await expect(page.getByTestId("history-quickbooks-panel-export-action")).toContainText("Export CSV")
    expect(statusRequests).toBe(1)

    await page.getByTestId("history-quickbooks-status-retry-action").click()

    await expect.poll(() => statusRequests).toBe(2)
    await expect(quickBooksIssue).toHaveCount(0)
    await expect(page.getByText("Not connected")).toBeVisible()
    await expect(page.getByTestId("history-quickbooks-connect-primary")).toContainText("Connect QuickBooks")
})

test("history treats sent estimates with completed payment evidence as paid", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    await routeAuthenticatedHistoryShell(page)

    let stripeStatusRequests = 0
    await page.route("**/api/payments/stripe/status?**", async (route) => {
        stripeStatusRequests += 1
        await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ ok: false, error: "Already paid-like estimates should not be polled." }),
        })
    })

    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: "estimate-stale-sent-paid",
            estimateNumber: "EST-2605-PAIDLIKE",
            status: "sent",
            clientName: "Paid Evidence Customer",
            clientEmail: "paid-evidence@example.com",
            clientPhone: "+14165550128",
            customerPortalUrl: "https://snapquote.test/q/paid-evidence",
            customerPortalStatus: "viewed",
            customerViewedAt: "2026-05-29T18:30:00.000Z",
            paymentCompletedAt: "2026-05-30T12:00:00.000Z",
        },
    ])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history?tab=paid&estimateId=estimate-stale-sent-paid")

    await expect(page.getByText("Paid Evidence Customer").first()).toBeVisible()
    await expect(page.getByTestId("history-sent-value")).toHaveText("$0.00 out")
    await expect(page.getByTestId("history-paid-value")).toHaveText("$1280.00 collected")
    await expect(page.getByTestId("history-secondary-follow-up-action")).toHaveCount(0)
    await expect(page.getByTestId("history-customer-follow-up-action")).toHaveCount(0)
    await expect.poll(async () => {
        const paymentFields = await readEstimatePaymentFields(page, "estimate-stale-sent-paid")
        return paymentFields.status
    }).toBe("paid")
    await expect.poll(async () => {
        const paymentFields = await readEstimatePaymentFields(page, "estimate-stale-sent-paid")
        return paymentFields.synced
    }).toBe(false)
    await expect.poll(async () => {
        const paymentFields = await readEstimatePaymentFields(page, "estimate-stale-sent-paid")
        return paymentFields.paymentCompletedAt
    }).toBe("2026-05-30T12:00:00.000Z")
    expect(stripeStatusRequests).toBe(0)

    await page.getByTestId("history-more-actions-toggle").click()
    const secondaryActions = page.getByTestId("history-estimate-secondary-actions")
    await expect(page.getByTestId("history-customer-portal-link-action")).toHaveCount(0)
    await expect(secondaryActions.getByRole("button", { name: "SMS" })).toHaveCount(0)
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
    await expect(page.getByTestId("history-scope-reviewed-badge")).toContainText("Scope reviewed")
    await expect(page.getByTestId("history-edit-draft-button")).toContainText("Finish pricing")
    await page.getByTestId("history-more-actions-toggle").click()
    await expect(page.getByTestId("history-review-before-sending-action")).toContainText("Finish pricing")
    await expect(page.getByRole("button", { name: "Mark Sent" })).toHaveCount(0)
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

test("history prioritizes saved field captures and resumes them from drafts", async ({ page }) => {
    await openSeededDB(page, [
        {
            id: "estimate-capture-only",
            estimateNumber: "EST-2605-CAPTURE",
            status: "draft",
            clientName: "Capture Resume Client",
            clientAddress: "88 Resume Rd",
            summary_note: "Replace leaking laundry valve, install new shutoff, test pressure, and clean work area.",
            taxRate: 8.25,
            taxAmount: 0,
            totalAmount: 0,
            createdAt: "2026-05-24T08:00:00.000Z",
            updatedAt: "2026-05-24T08:05:00.000Z",
            synced: false,
            items: [],
            attachments: {
                photos: [],
                originalTranscript: "Replace leaking laundry valve, install new shutoff, test pressure, and clean work area.",
            },
        },
        seedEstimates[0],
    ])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history")

    const nextAction = page.getByTestId("history-next-action")
    await expect(nextAction).toContainText("Turn capture into quote")
    await expect(nextAction).toContainText("Capture Resume Client")
    await expect(page.getByTestId("history-next-action-button")).toContainText("Resume capture")
    await expect(page.getByTestId("history-capture-draft-badge")).toContainText("Needs AI draft")
    await expect(page.getByTestId("history-resume-capture-button")).toContainText("Resume capture")
    await expect(page.getByTestId("history-estimate-lanes-section")).toContainText("Field capture saved")

    await page.getByTestId("history-resume-capture-button").click()

    await expect(page).toHaveURL(/\/new-estimate\?draftId=estimate-capture-only$/)
})

test("history prioritizes customer change requests for quote recovery", async ({ page }) => {
    await openSeededDB(page, [
        seedEstimates[0],
        {
            ...seedEstimates[1],
            id: "estimate-change-requested",
            estimateNumber: "EST-2605-CHANGE",
            customerPortalUrl: "https://snapquote.test/q/change-requested-token",
            customerPortalStatus: "change_requested",
            customerChangeRequestedAt: "2026-05-24T15:30:00.000Z",
            customerPortalNote: "Please add disposal haul-away before we approve.",
        },
    ])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history")

    const nextAction = page.getByTestId("history-next-action")
    await expect(nextAction).toBeVisible()
    await expect(nextAction).toContainText("Revise requested changes")
    await expect(nextAction).toContainText("Please add disposal haul-away")
    await expect(page.getByTestId("history-next-action-button")).toContainText("Start revision")

    await page.getByTestId("history-sent-tab").click()
    await expect(page.getByText("Harbor Roof Repair").first()).toBeVisible()
    await expect(page.getByTestId("history-customer-portal-status")).toContainText("Changes requested")
    await expect(page.getByTestId("history-customer-portal-status")).toContainText("Please add disposal haul-away")
    await expect(page.getByTestId("history-customer-revision-action")).toBeVisible()

    await page.getByTestId("history-more-actions-toggle").click()
    await expect(page.getByTestId("history-secondary-follow-up-action")).toHaveCount(0)
})

test("history stops promoting change requests after a revised quote is sent", async ({ page }) => {
    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: "estimate-original-superseded",
            estimateNumber: "EST-2605-OLD-CHANGE",
            clientName: "Original Revision Customer",
            customerPortalUrl: "https://snapquote.test/q/old-change-token",
            customerPortalStatus: "change_requested",
            customerChangeRequestedAt: "2026-05-24T15:30:00.000Z",
            customerPortalNote: "Please add disposal haul-away before we approve.",
            supersededByEstimateId: "estimate-revision-sent",
            supersededAt: "2026-05-24T18:00:00.000Z",
            updatedAt: "2026-05-24T17:00:00.000Z",
        },
        {
            ...seedEstimates[1],
            id: "estimate-revision-sent",
            estimateNumber: "EST-2605-REVISION",
            clientName: "Revision Sent Customer",
            summary_note: "Revised estimate with disposal haul-away included.",
            customerPortalUrl: "https://snapquote.test/q/revision-token",
            customerPortalStatus: "shared",
            updatedAt: "2026-05-24T18:05:00.000Z",
        },
    ])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history")

    const nextAction = page.getByTestId("history-next-action")
    await expect(nextAction).not.toContainText("Revise requested changes")
    await expect(nextAction).toContainText("Collect the open quote")
    await expect(nextAction).toContainText("Revision Sent Customer")

    await page.getByTestId("history-sent-tab").click()
    await expect(page.getByText("Original Revision Customer").first()).toBeVisible()
    await expect(page.getByText("Revision sent").first()).toBeVisible()
    await expect(page.getByTestId("history-customer-revision-action")).toHaveCount(0)
})

test("history cools down recently followed-up warm leads in the next action", async ({ page }) => {
    const sentAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const followedUpAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: "estimate-viewed-recent-follow-up",
            estimateNumber: "EST-2605-COOLDOWN",
            clientName: "Recently Contacted Customer",
            createdAt: sentAt,
            updatedAt: sentAt,
            sentAt,
            paymentLinkId: undefined,
            customerPortalUrl: "https://snapquote.test/q/recently-contacted",
            customerPortalStatus: "viewed",
            customerViewedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            firstFollowedUpAt: followedUpAt,
            lastFollowedUpAt: followedUpAt,
            lastFollowUpChannel: "email",
        },
    ])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history?tab=sent&estimateId=estimate-viewed-recent-follow-up")

    const nextAction = page.getByTestId("history-next-action")
    await expect(nextAction).toBeVisible()
    await expect(nextAction).not.toContainText("Follow up on viewed quote")
    await expect(nextAction).toContainText("Collect the open quote")
    await expect(nextAction).toContainText("Recently Contacted Customer")

    await expect(page.getByTestId("history-follow-up-recorded-badge")).toContainText("Followed up")
    await page.getByTestId("history-customer-follow-up-action").click()
    await expect(page.getByTestId("follow-up-recent-contact")).toContainText("Followed up recently")
    await expect(page.getByTestId("follow-up-recent-contact")).toContainText("Email follow-up")
    await expect(page.getByTestId("follow-up-recent-contact")).toContainText("Send again only if you have a new update")
})

test("history next action routes sent thin scope to review", async ({ page }) => {
    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: "estimate-next-thin-scope",
            estimateNumber: "EST-2605-NEXT-SCOPE",
            clientName: "Next Scope Customer",
            paymentLinkId: undefined,
            customerPortalUrl: "https://snapquote.test/q/next-thin-scope",
            customerPortalStatus: "viewed",
            customerViewedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            attachments: {
                photos: [],
                originalTranscript: "Fix sink",
            },
        },
    ])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history")

    const nextAction = page.getByTestId("history-next-action")
    await expect(nextAction).toBeVisible()
    await expect(nextAction).toContainText("Review sent scope")
    await expect(nextAction).toContainText("Next Scope Customer")
    await expect(page.getByTestId("history-next-action-button")).toContainText("Review scope")
    await expect(page.getByText("Follow up on viewed quote")).toHaveCount(0)

    await page.getByTestId("history-next-action-button").click()
    await expect(page).toHaveURL(/\/new-estimate\?draftId=estimate-next-thin-scope$/)
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
})

test("history focus query opens approved sent quote for collection", async ({ page }) => {
    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: "estimate-approved-focus",
            estimateNumber: "EST-2605-APPROVED",
            clientName: "Approved Focus Customer",
            summary_note: "Approved work ready for collection.",
            customerPortalUrl: "https://snapquote.test/q/approved-focus-token",
            customerPortalStatus: "approved",
            customerApprovedAt: "2026-05-24T16:30:00.000Z",
            items: [
                {
                    id: "approved-focus-item-1",
                    itemNumber: 1,
                    category: "SERVICE",
                    description: "Approved collection service",
                    quantity: 1,
                    unit: "LS",
                    unit_price: 1280,
                    total: 1280,
                },
            ],
        },
    ])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history?tab=sent&estimateId=estimate-approved-focus")

    await expect(page.getByText("Approved Focus Customer").first()).toBeVisible()
    await expect(page.getByTestId("history-customer-portal-status")).toContainText("Approved")
    await expect(page.getByText("Approved collection service")).toBeVisible()
    await expect(page.getByRole("button", { name: "Mark Paid" })).toBeVisible()
})

test("history promotes payment link copying for approved quotes", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: "estimate-approved-paid-link",
            estimateNumber: "EST-2605-PAY-LINK",
            clientName: "Approved Payment Link Customer",
            customerPortalUrl: "https://snapquote.test/q/approved-pay-link-token",
            customerPortalStatus: "approved",
            customerApprovedAt: "2026-05-24T17:30:00.000Z",
            paymentLink: "https://pay.snapquote.test/approved-payment-link",
            paymentLinkId: "plink_approved_payment_link",
        },
    ])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history?tab=sent&estimateId=estimate-approved-paid-link")

    await expect(page.getByText("Approved Payment Link Customer").first()).toBeVisible()
    await expect(page.getByTestId("history-copy-payment-link-action")).toContainText("Copy pay link")
    await page.getByTestId("history-copy-payment-link-action").click()
    await expect(page.getByTestId("toast-message-text")).toContainText("Payment link copied.")
    await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toBe("https://pay.snapquote.test/approved-payment-link")

    await page.getByTestId("history-more-actions-toggle").click()
    await expect(page.getByRole("button", { name: "Mark Paid" })).toBeVisible()
    await expect(page.getByTestId("history-secondary-follow-up-action")).toHaveCount(0)
})

test("history uses profile payment links for approved quote collection", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: "estimate-approved-profile-pay-link",
            estimateNumber: "EST-2605-PROFILE-PAY",
            clientName: "Profile Pay Customer",
            customerPortalUrl: "https://snapquote.test/q/approved-profile-pay-token",
            customerPortalStatus: "approved",
            customerApprovedAt: "2026-05-24T18:30:00.000Z",
            paymentLink: undefined,
            paymentLinkId: undefined,
        },
    ])
    await page.evaluate(() => {
        window.localStorage.setItem("snapquote_business_profile", JSON.stringify({
            business_name: "Profile Pay Electric",
            phone: "555-0101",
            email: "pay@example.test",
            address: "1 Pay Lane",
            license_number: "LIC-123",
            payment_link: "https://pay.snapquote.test/profile-payment-link",
        }))
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history?tab=sent&estimateId=estimate-approved-profile-pay-link")

    await expect(page.getByText("Profile Pay Customer").first()).toBeVisible()
    await expect(page.getByText("Profile payment link")).toBeVisible()
    await expect(page.getByTestId("history-copy-payment-link-action")).toContainText("Copy pay link")
    await page.getByTestId("history-copy-payment-link-action").click()
    await expect(page.getByTestId("toast-message-text")).toContainText("Payment link copied.")
    await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toBe("https://pay.snapquote.test/profile-payment-link")
})

test("history creates a payment link for approved quotes without one", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await seedAuthenticatedSupabaseSession(context)
    const estimateId = "00000000-0000-4000-8000-000000000123"
    await routeAuthenticatedHistoryShell(page, {
        shareLinkResponse: {
            ok: true,
            shareUrl: "https://snapquote.test/q/generated-pay-token",
            portal: {
                status: "approved",
                approvedAt: "2026-05-24T19:30:00.000Z",
            },
        },
    })

    await page.route("**/api/create-payment-link", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                url: "https://pay.snapquote.test/generated-approved-link",
                id: "plink_generated_approved",
            }),
        })
    })

    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: estimateId,
            estimateNumber: "EST-2605-GENERATE-PAY",
            clientName: "Generated Pay Customer",
            customerPortalUrl: "https://snapquote.test/q/generated-pay-token",
            customerPortalStatus: "approved",
            customerApprovedAt: "2026-05-24T19:30:00.000Z",
            paymentLink: undefined,
            paymentLinkId: undefined,
            totalAmount: 1435,
        },
    ])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/history?tab=sent&estimateId=${estimateId}`)

    await expect(page.getByText("Generated Pay Customer").first()).toBeVisible()
    await expect(page.getByText("Ready for payment link")).toBeVisible()

    const paymentLinkRequestPromise = page.waitForRequest((request) => (
        request.method() === "POST"
        && request.url().includes("/api/create-payment-link")
    ))
    const portalSnapshotRequestPromise = page.waitForRequest((request) => (
        request.method() === "POST"
        && request.url().includes(`/api/estimates/${estimateId}/share-link`)
    ))
    await page.getByTestId("history-create-payment-link-action").click()
    const paymentLinkPayload = (await paymentLinkRequestPromise).postDataJSON()
    const shareLinkPayload = (await portalSnapshotRequestPromise).postDataJSON()

    expect(paymentLinkPayload).toMatchObject({
        amount: 1435,
        customerName: "Generated Pay Customer",
        estimateNumber: "EST-2605-GENERATE-PAY",
        estimateId,
    })
    expect(shareLinkPayload).toMatchObject({
        estimate: {
            estimateNumber: "EST-2605-GENERATE-PAY",
            paymentLink: "https://pay.snapquote.test/generated-approved-link",
            paymentLinkType: "full",
        },
    })
    await expect(page.getByTestId("toast-message-text")).toContainText("Payment link created and copied.")
    await expect(page.getByTestId("history-copy-payment-link-action")).toContainText("Copy pay link")
    await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toBe("https://pay.snapquote.test/generated-approved-link")

    const paymentFields = await readEstimatePaymentFields(page, estimateId)
    expect(paymentFields).toMatchObject({
        paymentLink: "https://pay.snapquote.test/generated-approved-link",
        paymentLinkId: "plink_generated_approved",
        paymentLinkType: "full",
        customerPortalStatus: "approved",
        customerPortalUrl: "https://snapquote.test/q/generated-pay-token",
        synced: false,
    })
})

test("history keeps payment link creation failures visible with retry and Profile fallback", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await seedAuthenticatedSupabaseSession(context)
    const estimateId = "00000000-0000-4000-8000-000000000124"
    await routeAuthenticatedHistoryShell(page, {
        shareLinkResponse: {
            ok: true,
            shareUrl: "https://snapquote.test/q/retry-pay-token",
            portal: {
                status: "approved",
                approvedAt: "2026-05-24T19:30:00.000Z",
            },
        },
    })

    let paymentLinkAttempts = 0
    await page.route("**/api/create-payment-link", async (route) => {
        paymentLinkAttempts += 1

        if (paymentLinkAttempts === 1) {
            await route.fulfill({
                status: 403,
                contentType: "application/json",
                body: JSON.stringify({
                    error: "Stripe Connect account is not linked. Connect Stripe in Profile first.",
                    code: "STRIPE_CONNECT_REQUIRED",
                }),
            })
            return
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                url: "https://pay.snapquote.test/retry-generated-approved-link",
                id: "plink_retry_generated_approved",
            }),
        })
    })

    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: estimateId,
            estimateNumber: "EST-2605-RETRY-PAY",
            clientName: "Retry Pay Customer",
            customerPortalUrl: "https://snapquote.test/q/retry-pay-token",
            customerPortalStatus: "approved",
            customerApprovedAt: "2026-05-24T19:30:00.000Z",
            paymentLink: undefined,
            paymentLinkId: undefined,
            totalAmount: 1860,
        },
    ])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/history?tab=sent&estimateId=${estimateId}`)

    await expect(page.getByText("Retry Pay Customer").first()).toBeVisible()
    await page.getByTestId("history-create-payment-link-action").click()

    const paymentLinkIssue = page.getByTestId("history-payment-link-issue")
    await expect(paymentLinkIssue).toBeVisible()
    await expect(paymentLinkIssue).toContainText("Connect Stripe to get paid online")
    await expect(paymentLinkIssue).toContainText("Stripe is not connected yet.")
    await expect(page.getByTestId("history-payment-link-profile-action")).toHaveAttribute("href", "/profile#stripe-connect")
    await expect(page.getByTestId("history-payment-link-retry-action")).toContainText("Retry pay link")
    await expect(page.getByTestId("history-payment-link-export-action")).toContainText("Export CSV")
    expect(paymentLinkAttempts).toBe(1)

    await page.getByTestId("history-payment-link-retry-action").click()

    await expect.poll(() => paymentLinkAttempts).toBe(2)
    await expect(paymentLinkIssue).toHaveCount(0)
    await expect(page.getByTestId("toast-message-text")).toContainText("Payment link created and copied.")
    await expect(page.getByTestId("history-copy-payment-link-action")).toContainText("Copy pay link")
    await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toBe("https://pay.snapquote.test/retry-generated-approved-link")
})

test("history includes profile payment links when preparing customer approval links", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await seedAuthenticatedSupabaseSession(context)
    await routeAuthenticatedHistoryShell(page)

    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: "estimate-profile-link-portal",
            estimateNumber: "EST-2605-PORTAL-PROFILE-PAY",
            clientName: "Portal Profile Pay Customer",
            paymentLink: undefined,
            paymentLinkId: undefined,
        },
    ])
    await page.evaluate(() => {
        window.localStorage.setItem("snapquote_business_profile", JSON.stringify({
            business_name: "Portal Profile Pay Electric",
            phone: "555-0102",
            email: "portal-pay@example.test",
            address: "2 Portal Pay Lane",
            license_number: "LIC-456",
            payment_link: "https://pay.snapquote.test/profile-portal-payment-link",
        }))
    })

    await page.goto("/history?tab=sent&estimateId=estimate-profile-link-portal")
    await expect(page.getByText("Portal Profile Pay Customer").first()).toBeVisible()

    await page.getByTestId("history-more-actions-toggle").click()
    const shareLinkRequestPromise = page.waitForRequest((request) => (
        request.method() === "POST"
        && request.url().includes("/api/estimates/estimate-profile-link-portal/share-link")
    ))
    await page.getByTestId("history-customer-portal-link-action").click()
    const shareLinkPayload = (await shareLinkRequestPromise).postDataJSON()
    await expect(page.getByTestId("toast-message-text")).toContainText("Customer approval link copied.")
    expect(shareLinkPayload).toMatchObject({
        estimate: {
            paymentLink: "https://pay.snapquote.test/profile-portal-payment-link",
            paymentLinkType: "custom",
        },
    })
})

test("history opens the follow-up modal from warm lead deep links", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedAuthenticatedSupabaseSession(context)
    await routeAuthenticatedHistoryShell(page)

    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: "estimate-follow-up-deep-link",
            estimateNumber: "EST-2605-DEEP-LINK",
            clientName: "Deep Link Follow Up",
            clientEmail: "deep-link-follow-up@example.com",
            paymentLinkId: undefined,
            customerPortalUrl: "https://snapquote.test/q/deep-link-follow-up",
            customerPortalStatus: "viewed",
            customerViewedAt: "2026-05-29T18:00:00.000Z",
        },
    ])

    await page.goto("/history?tab=sent&estimateId=estimate-follow-up-deep-link&action=follow-up")

    const dialog = page.getByRole("dialog", { name: "Send Follow-up" })
    await expect(dialog).toBeVisible()
    await expect(page.getByText("Deep Link Follow Up").first()).toBeVisible()
    await expect(page.getByTestId("follow-up-portal-status")).toContainText("Quote viewed")
    await expect(page.getByTestId("follow-up-portal-status")).toContainText("Warm lead")
    await expect(page.getByLabel("Client Email *")).toHaveValue("deep-link-follow-up@example.com")
    await expect(page.getByLabel("Message")).toHaveValue(/EST-2605-DEEP-LINK/)
    await expect(page.getByLabel("Message")).toHaveValue(/approve it or request changes/)
    await expect(page.getByLabel("Message")).toHaveValue(/https:\/\/snapquote\.test\/q\/deep-link-follow-up/)
})

test("history records sent follow-up emails locally", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedAuthenticatedSupabaseSession(context)
    await routeAuthenticatedHistoryShell(page)

    let emailPayload: Record<string, unknown> = {}
    await page.route("**/api/send-email", async (route) => {
        emailPayload = route.request().postDataJSON()
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true }),
        })
    })

    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: "estimate-follow-up-email-recorded",
            estimateNumber: "EST-2605-FOLLOW-UP-RECORDED",
            clientName: "Recorded Email Customer",
            clientEmail: "recorded-follow-up@example.com",
            paymentLinkId: undefined,
            customerPortalUrl: "https://snapquote.test/q/email-recorded",
            customerPortalStatus: "viewed",
            customerViewedAt: "2026-05-29T18:15:00.000Z",
        },
    ])

    await page.goto("/history?tab=sent&estimateId=estimate-follow-up-email-recorded&action=follow-up")

    const dialog = page.getByRole("dialog", { name: "Send Follow-up" })
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: "Send Follow-up" }).click()

    await expect(page.getByTestId("toast-message-text")).toContainText("Follow-up email sent.")
    const storedEstimate = await readEstimateFollowUpFields(page, "estimate-follow-up-email-recorded")
    const sentEmail = typeof emailPayload.email === "string" ? emailPayload.email : ""
    expect(sentEmail).toBe("recorded-follow-up@example.com")
    expect(storedEstimate.lastFollowUpChannel).toBe("email")
    expect(typeof storedEstimate.firstFollowedUpAt).toBe("string")
    expect(typeof storedEstimate.lastFollowedUpAt).toBe("string")
    expect(storedEstimate.synced).toBe(false)
})

test("history opens the SMS modal from warm lead deep links", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedAuthenticatedSupabaseSession(context)
    await routeAuthenticatedHistoryShell(page)

    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: "estimate-sms-deep-link",
            estimateNumber: "EST-2605-SMS-DEEP-LINK",
            clientName: "SMS Deep Link Customer",
            clientPhone: "+14165550125",
            paymentLinkId: undefined,
            customerPortalUrl: "https://snapquote.test/q/sms-deep-link",
            customerPortalStatus: "viewed",
            customerViewedAt: "2026-05-29T18:30:00.000Z",
        },
    ])

    await page.goto("/history?tab=sent&estimateId=estimate-sms-deep-link&action=sms")

    const dialog = page.getByRole("dialog", { name: "Send via SMS" })
    await expect(dialog).toBeVisible()
    await expect(page.getByText("SMS Deep Link Customer").first()).toBeVisible()
    await expect(page.getByLabel("Customer Phone *")).toHaveValue("+14165550125")
    await expect(page.getByTestId("sms-approval-link-status")).toContainText("Viewed")
    await expect(page.getByTestId("sms-approval-link-helper")).toContainText("Customer opened the review link")
    await expect(page.getByLabel("Message")).toHaveValue(/approve or request changes/)
    await expect(page.getByLabel("Message")).toHaveValue(/https:\/\/snapquote\.test\/q\/sms-deep-link/)
})

test("history blocks customer delivery actions until sent thin scope is reviewed", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedAuthenticatedSupabaseSession(context)
    await routeAuthenticatedHistoryShell(page)

    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: "estimate-sent-thin-scope",
            estimateNumber: "EST-2605-THIN-SENT",
            clientName: "Sent Thin Scope",
            clientEmail: "thin-scope@example.com",
            clientPhone: "+14165550127",
            paymentLinkId: undefined,
            customerPortalUrl: "https://snapquote.test/q/thin-scope",
            customerPortalStatus: "viewed",
            customerViewedAt: "2026-05-29T19:00:00.000Z",
            attachments: {
                photos: [],
                originalTranscript: "Fix sink",
            },
        },
    ])

    await page.goto("/history?tab=sent&estimateId=estimate-sent-thin-scope")

    await expect(page.getByText("Sent Thin Scope").first()).toBeVisible()
    await expect(page.getByTestId("history-scope-review-needed-badge")).toContainText("Scope review needed")
    await expect(page.getByTestId("history-review-scope-before-delivery-action")).toContainText("Review scope")

    await page.getByTestId("history-more-actions-toggle").click()
    const secondaryActions = page.getByTestId("history-estimate-secondary-actions")
    await expect(page.getByTestId("history-secondary-review-scope-action")).toContainText("Review scope")
    await expect(page.getByTestId("history-customer-portal-link-action")).toHaveCount(0)
    await expect(page.getByTestId("history-secondary-follow-up-action")).toHaveCount(0)
    await expect(secondaryActions.getByRole("button", { name: "SMS" })).toHaveCount(0)

    await page.getByTestId("history-review-scope-before-delivery-action").click()
    await expect(page).toHaveURL(/\/new-estimate\?draftId=estimate-sent-thin-scope$/)
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
})

test("history records warm lead SMS follow-ups locally", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedAuthenticatedSupabaseSession(context)
    await routeAuthenticatedHistoryShell(page)

    let smsPayload: Record<string, unknown> = {}
    await page.route("**/api/send-sms", async (route) => {
        smsPayload = route.request().postDataJSON()
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, messageId: "SM_RECORDED", creditsRemaining: 4 }),
        })
    })

    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: "estimate-follow-up-sms-recorded",
            estimateNumber: "EST-2605-SMS-RECORDED",
            clientName: "Recorded SMS Customer",
            clientPhone: "+14165550126",
            paymentLinkId: undefined,
            customerPortalUrl: "https://snapquote.test/q/sms-recorded",
            customerPortalStatus: "viewed",
            customerViewedAt: "2026-05-29T18:45:00.000Z",
        },
    ])

    await page.goto("/history?tab=sent&estimateId=estimate-follow-up-sms-recorded&action=sms")

    const dialog = page.getByRole("dialog", { name: "Send via SMS" })
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: "Send SMS" }).click()

    await expect(page.getByTestId("toast-message-text")).toContainText("SMS sent.")
    const storedEstimate = await readEstimateFollowUpFields(page, "estimate-follow-up-sms-recorded")
    const sentSmsMessage = typeof smsPayload.message === "string" ? smsPayload.message : ""
    expect(sentSmsMessage).toContain("https://snapquote.test/q/sms-recorded")
    expect(storedEstimate.lastFollowUpChannel).toBe("sms")
    expect(typeof storedEstimate.firstFollowedUpAt).toBe("string")
    expect(typeof storedEstimate.lastFollowedUpAt).toBe("string")
    expect(storedEstimate.synced).toBe(false)
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
            customerPortalUrl: "https://snapquote.test/q/followup-approval-link",
            customerPortalStatus: "viewed",
            customerViewedAt: "2026-05-29T17:30:00.000Z",
        },
    ])

    await page.goto("/history")
    await page.getByTestId("history-sent-tab").click()
    await expect(page.getByText("Long Follow Up Customer").first()).toBeVisible()

    await page.getByTestId("history-customer-follow-up-action").click()

    const dialog = page.getByRole("dialog", { name: "Send Follow-up" })
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId("follow-up-summary")).toBeVisible()
    await expect(page.getByTestId("follow-up-portal-status")).toContainText("Quote viewed")
    await expect(page.getByTestId("follow-up-portal-status")).toContainText("Warm lead")
    await expect(page.getByTestId("follow-up-portal-status-helper")).toContainText("Customer opened the approval link")
    await expect(page.getByLabel("Client Email *")).toHaveValue("long-follow-up@example.com")
    await expect(page.getByLabel("Message")).toHaveValue(/Hi Long Follow Up Customer/)
    await expect(page.getByLabel("Message")).toHaveValue(/EST-2605-FOLLOW-UP-LONG-REFERENCE/)
    await expect(page.getByLabel("Message")).toHaveValue(/https:\/\/snapquote\.test\/q\/followup-approval-link/)
    await expect(page.getByLabel("Message")).toHaveValue(/approve it or request changes/)

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
    await expect(page.getByTestId("follow-up-delivery-action")).toHaveAttribute("href", "/pricing?source=send_email_quota")
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

test("history SMS modal reflects viewed quote status and customer phone", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    await routeAuthenticatedHistoryShell(page)

    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: "estimate-sms-viewed",
            estimateNumber: "EST-2605-SMS-VIEWED",
            clientName: "Viewed SMS Customer",
            clientPhone: "+14165550123",
            paymentLinkId: undefined,
            customerPortalUrl: "https://snapquote.test/q/sms-viewed-token",
            customerPortalStatus: "viewed",
            customerViewedAt: "2026-05-29T17:30:00.000Z",
        },
    ])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history?tab=sent&estimateId=estimate-sms-viewed")

    await expect(page.getByText("Viewed SMS Customer").first()).toBeVisible()
    await page.getByTestId("history-more-actions-toggle").click()
    await page.getByRole("button", { name: "SMS" }).click()

    const dialog = page.getByRole("dialog", { name: "Send via SMS" })
    await expect(dialog).toBeVisible()
    await expect(page.getByLabel("Customer Phone *")).toHaveValue("+14165550123")
    await expect(page.getByTestId("sms-recipient-status")).toHaveText("Ready")
    await expect(page.getByTestId("sms-approval-link-status")).toHaveText("Viewed")
    await expect(page.getByTestId("sms-approval-link-helper")).toContainText("Customer opened the review link")
    await expect(page.getByLabel("Message")).toHaveValue(/approve or request changes/)
    await expect(page.getByLabel("Message")).toHaveValue(/https:\/\/snapquote\.test\/q\/sms-viewed-token/)
})

test("history approved SMS does not append another approval link", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await seedAuthenticatedSupabaseSession(context)
    await routeAuthenticatedHistoryShell(page)

    let smsPayload: Record<string, unknown> = {}
    await page.route("**/api/send-sms", async (route) => {
        smsPayload = route.request().postDataJSON()
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, success: true, sid: "SM_APPROVED", creditsRemaining: 4 }),
        })
    })

    await openSeededDB(page, [
        {
            ...seedEstimates[1],
            id: "estimate-sms-approved",
            estimateNumber: "EST-2605-SMS-APPROVED",
            clientName: "Approved SMS Customer",
            clientPhone: "+14165550124",
            customerPortalUrl: "https://snapquote.test/q/sms-approved-token",
            customerPortalStatus: "approved",
            customerApprovedAt: "2026-05-29T18:30:00.000Z",
            paymentLink: "https://pay.snapquote.test/approved-sms-payment",
            paymentLinkId: "plink_sms_approved",
        },
    ])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/history?tab=sent&estimateId=estimate-sms-approved")

    await expect(page.getByText("Approved SMS Customer").first()).toBeVisible()
    await page.getByTestId("history-more-actions-toggle").click()
    await page.getByRole("button", { name: "SMS" }).click()

    const dialog = page.getByRole("dialog", { name: "Send via SMS" })
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId("sms-approval-link-status")).toHaveText("Approved")
    await expect(page.getByTestId("sms-approval-link-helper")).toContainText("payment, scheduling")
    await expect(page.getByLabel("Message")).toHaveValue(/Your estimate is approved/)
    await expect(page.getByLabel("Message")).toHaveValue(/https:\/\/pay\.snapquote\.test\/approved-sms-payment/)
    await expect(page.getByLabel("Message")).not.toHaveValue(/sms-approved-token/)

    await dialog.getByRole("button", { name: "Send SMS" }).click()
    await expect(page.getByTestId("toast-message-text")).toContainText("SMS sent.")
    const sentSmsMessage = typeof smsPayload.message === "string" ? smsPayload.message : ""
    expect(sentSmsMessage).toContain("https://pay.snapquote.test/approved-sms-payment")
    expect(sentSmsMessage).not.toContain("sms-approved-token")
    const storedEstimate = await readEstimateFollowUpFields(page, "estimate-sms-approved")
    expect(storedEstimate.lastFollowUpChannel).toBeUndefined()
    expect(storedEstimate.lastFollowedUpAt).toBeUndefined()
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

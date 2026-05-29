import { expect, test, type Page } from "@playwright/test"

type SeedDraftEstimate = {
    id: string
    estimateNumber: string
    status: "draft" | "sent" | "paid"
    clientName: string
    clientAddress: string
    summary_note: string
    taxRate: number
    taxAmount: number
    totalAmount: number
    createdAt: string
    updatedAt: string
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

const seedDrafts: SeedDraftEstimate[] = [
    {
        id: "estimate-draft-1",
        estimateNumber: "EST-2605-201",
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
        id: "estimate-draft-2",
        estimateNumber: "EST-2605-202",
        status: "draft",
        clientName: "Bright Laundry Hookup",
        clientAddress: "88 Wash Lane",
        summary_note: "Install laundry supply box and test drain connection.",
        taxRate: 8.25,
        taxAmount: 42.9,
        totalAmount: 562.9,
        createdAt: "2026-05-22T08:00:00.000Z",
        updatedAt: "2026-05-22T12:00:00.000Z",
        synced: true,
        items: [
            {
                id: "draft-item-3",
                itemNumber: 1,
                category: "SERVICE",
                description: "Laundry box install",
                quantity: 1,
                unit: "LS",
                unit_price: 520,
                total: 520,
            },
        ],
    },
]

async function openSeededDB(page: Page, estimates: SeedDraftEstimate[]) {
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

        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("snapquote-db", 6)
            request.onerror = () => reject(request.error)
            request.onupgradeneeded = () => {
                const db = request.result
                const createStore = (
                    name: string,
                    indexes: Array<{ name: string; keyPath: string }>
                ) => {
                    const store = db.objectStoreNames.contains(name)
                        ? request.transaction!.objectStore(name)
                        : db.createObjectStore(name, { keyPath: "id" })

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

        const transaction = database.transaction("estimates", "readwrite")
        const store = transaction.objectStore("estimates")
        await Promise.all(records.map((estimate) => requestToPromise(store.put(estimate))))
        await new Promise<void>((resolve, reject) => {
            transaction.onerror = () => reject(transaction.error)
            transaction.oncomplete = () => resolve()
        })
        database.close()
    }, estimates)
}

test("drafts mobile workbench surfaces next action, search, and sent handoff", async ({ page }) => {
    await openSeededDB(page, seedDrafts)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/drafts")

    await expect(page).toHaveURL(/\/drafts$/)
    await expect(page.getByTestId("drafts-page")).toBeVisible()
    await expect(page.getByTestId("drafts-open-count")).toHaveText("2")
    await expect(page.getByTestId("drafts-pricing-needed")).toHaveText("1")
    await expect(page.getByTestId("drafts-count-badge")).toHaveText("2 of 2")
    await expect(page.getByTestId("drafts-next-action")).toContainText("Next up: finish draft pricing")
    await expect(page.getByTestId("drafts-next-action")).toContainText("Apex Kitchen Remodel")
    await expect(page.getByTestId("drafts-next-action-button")).toContainText("Finish pricing")
    await expect(page.getByTestId("sync-status-button")).toHaveCount(0)

    const newEstimateLinkBox = await page.getByTestId("drafts-new-estimate-link").boundingBox()
    expect(newEstimateLinkBox).not.toBeNull()
    expect(newEstimateLinkBox!.width).toBeGreaterThanOrEqual(44)
    expect(newEstimateLinkBox!.height).toBeGreaterThanOrEqual(44)

    const apexDraft = page.getByTestId("drafts-card").filter({ hasText: "Apex Kitchen Remodel" })
    await expect(apexDraft.getByRole("heading", { name: "Apex Kitchen Remodel" })).toBeVisible()
    await expect(apexDraft.getByTestId("drafts-edit-button")).toContainText("Finish pricing")
    const apexTitleBox = await apexDraft.getByRole("heading", { name: "Apex Kitchen Remodel" }).boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()
    expect(apexTitleBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(apexTitleBox!.y + apexTitleBox!.height).toBeLessThanOrEqual(navBox!.y - 8)

    await page.getByTestId("drafts-search-input").fill("laundry")
    await expect(page.getByTestId("drafts-count-badge")).toHaveText("1 of 2")
    const clearSearchBox = await page.getByTestId("drafts-clear-search").boundingBox()
    expect(clearSearchBox).not.toBeNull()
    expect(clearSearchBox!.width).toBeGreaterThanOrEqual(44)
    expect(clearSearchBox!.height).toBeGreaterThanOrEqual(44)
    await expect(page.getByTestId("drafts-queue-section").getByText("Bright Laundry Hookup")).toBeVisible()
    await expect(page.getByTestId("drafts-queue-section").getByText("Apex Kitchen Remodel")).toHaveCount(0)

    const laundryDraft = page.getByTestId("drafts-card").filter({ hasText: "Bright Laundry Hookup" })
    await expect(laundryDraft).toBeVisible()
    await expect(laundryDraft.getByTestId("drafts-edit-button")).toContainText("Review draft")
    await laundryDraft.getByTestId("drafts-mark-sent-button").click()
    await expect(page.getByText("Bright Laundry Hookup moved to Sent.")).toBeVisible()
    await expect(page.getByTestId("drafts-open-count")).toHaveText("1")
    await expect(page.getByTestId("drafts-count-badge")).toHaveText("0 of 1")
    await expect(page.getByTestId("drafts-empty-state")).toContainText("No open drafts match \"laundry\".")

    await page.getByTestId("drafts-clear-search").click()
    await expect(page.getByTestId("drafts-count-badge")).toHaveText("1 of 1")
    await expect(page.getByTestId("drafts-queue-section").getByText("Apex Kitchen Remodel")).toBeVisible()

    await page.getByTestId("drafts-next-action-button").click()
    await expect(page).toHaveURL(/\/new-estimate\?draftId=estimate-draft-1/)
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
})

test("drafts mobile cards keep long customer names inside the workbench", async ({ page }) => {
    await openSeededDB(page, [
        {
            ...seedDrafts[0],
            id: "estimate-long-draft-name",
            estimateNumber: "EST-2605-299",
            clientName: "SupercalifragilisticexpialidociousBasementRestorationDivision",
        },
    ])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/drafts")
    await expect(page.getByText("SupercalifragilisticexpialidociousBasementRestorationDivision").first()).toBeVisible()

    const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    const cardTitleFits = await page
        .getByTestId("drafts-card-title")
        .first()
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    const nextActionDescriptionFits = await page
        .getByTestId("drafts-next-action-description")
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    const editButtonBox = await page.getByTestId("drafts-mobile-edit-button").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(pageFits).toBe(true)
    expect(cardTitleFits).toBe(true)
    expect(nextActionDescriptionFits).toBe(true)
    expect(editButtonBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(editButtonBox!.y + editButtonBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("drafts desktop title typography is not clipped", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/drafts")

    await expect(page.getByTestId("drafts-page-title")).toHaveText("Draft workbench")
    const titleFits = await page.getByTestId("drafts-page-title").evaluate((element) => {
        return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
    })

    expect(titleFits).toBe(true)
})

test("drafts desktop uses a two-column workbench for queue and next action", async ({ page }) => {
    await openSeededDB(page, seedDrafts)

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/drafts")

    await expect(page.getByTestId("drafts-workbench")).toBeVisible()
    await expect(page.getByTestId("drafts-queue-section")).toBeVisible()
    await expect(page.getByTestId("drafts-side-panel")).toBeVisible()
    await expect(page.getByTestId("drafts-next-action")).toContainText("Next up: finish draft pricing")
    await expect(page.getByTestId("drafts-next-action")).toContainText("Apex Kitchen Remodel")

    const workbenchBox = await page.getByTestId("drafts-workbench").boundingBox()
    const queueBox = await page.getByTestId("drafts-queue-section").boundingBox()
    const sidePanelBox = await page.getByTestId("drafts-side-panel").boundingBox()
    const nextActionBox = await page.getByTestId("drafts-next-action").boundingBox()
    const firstDraftTitleBox = await page.getByTestId("drafts-card")
        .filter({ hasText: "Apex Kitchen Remodel" })
        .getByRole("heading", { name: "Apex Kitchen Remodel" })
        .boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(workbenchBox).not.toBeNull()
    expect(queueBox).not.toBeNull()
    expect(sidePanelBox).not.toBeNull()
    expect(nextActionBox).not.toBeNull()
    expect(firstDraftTitleBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(workbenchBox!.width).toBeGreaterThan(900)
    expect(queueBox!.x).toBeLessThan(sidePanelBox!.x)
    expect(Math.abs(queueBox!.y - sidePanelBox!.y)).toBeLessThanOrEqual(2)
    expect(queueBox!.width).toBeGreaterThan(620)
    expect(sidePanelBox!.width).toBeGreaterThan(300)
    expect(nextActionBox!.x).toBeGreaterThanOrEqual(sidePanelBox!.x)
    expect(firstDraftTitleBox!.y + firstDraftTitleBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("drafts delete flow removes a local draft and leaves a recovery state", async ({ page }) => {
    await openSeededDB(page, [seedDrafts[0]])

    await page.goto("/drafts")
    await expect(page.getByTestId("drafts-open-count")).toHaveText("1")

    const apexDraft = page.getByTestId("drafts-card").filter({ hasText: "Apex Kitchen Remodel" })
    await apexDraft.getByTestId("drafts-delete-button").click()

    const deleteDialog = page.getByRole("dialog", { name: "Delete draft?" })
    await expect(deleteDialog).toBeVisible()
    await deleteDialog.getByRole("button", { name: "Delete draft" }).click()

    await expect(page.getByTestId("drafts-open-count")).toHaveText("0")
    await expect(page.getByTestId("drafts-empty-state")).toContainText("No local drafts yet")
    await expect(page.getByTestId("drafts-empty-state")).toContainText("New estimate")
})

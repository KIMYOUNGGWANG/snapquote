import { expect, test, type Page } from "@playwright/test"

type StoredEstimate = {
    id: string
    estimateNumber: string
    status: "draft" | "sent" | "paid"
    clientName?: string
    totalAmount?: number
    paymentCompletedAt?: string
    lastPaymentSessionId?: string
}

const seededPaymentEstimate = {
    id: "payment-success-estimate-1",
    estimateNumber: "EST-2605-901",
    status: "sent" as const,
    clientName: "Payment Success Customer",
    clientAddress: "42 Oak Street",
    summary_note: "Replace leaking shutoff valve and test operation.",
    taxRate: 8.25,
    taxAmount: 26.81,
    totalAmount: 351.81,
    createdAt: "2026-05-23T08:00:00.000Z",
    updatedAt: "2026-05-23T10:00:00.000Z",
    sentAt: "2026-05-23T11:00:00.000Z",
    paymentLinkId: "plink_payment_success",
    synced: true,
    items: [
        {
            id: "item-1",
            itemNumber: 1,
            category: "SERVICE",
            description: "Emergency shutoff valve replacement",
            quantity: 1,
            unit: "ea",
            unit_price: 325,
            total: 325,
        },
    ],
}

type SeedPaymentEstimate = typeof seededPaymentEstimate & {
    paymentCompletedAt?: string
    lastPaymentSessionId?: string
}

async function seedStoredEstimate(page: Page, estimate: SeedPaymentEstimate = seededPaymentEstimate) {
    await page.goto("/")

    await page.evaluate(async (estimate) => {
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
        await requestToPromise(store.clear())
        await requestToPromise(store.put(estimate))
        await new Promise<void>((resolve, reject) => {
            transaction.onerror = () => reject(transaction.error)
            transaction.oncomplete = () => resolve()
        })
        db.close()
    }, estimate)
}

async function readStoredEstimates(page: Page) {
    return await page.evaluate(async () => {
        return await new Promise<StoredEstimate[]>((resolve, reject) => {
            const request = indexedDB.open("snapquote-db")
            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
                const db = request.result
                const tx = db.transaction("estimates", "readonly")
                const store = tx.objectStore("estimates")
                const getAll = store.getAll()
                getAll.onerror = () => reject(getAll.error)
                getAll.onsuccess = () => resolve(getAll.result as StoredEstimate[])
            }
        })
    })
}

async function mockStripePaymentStatus(
    page: Page,
    input: {
        paid: boolean
        checkoutSessionId?: string
        paidAt?: string
        expectedPaymentLinkId?: string
        expectedSessionId?: string
    }
) {
    await page.route("**/api/payments/stripe/status?**", async (route) => {
        const requestUrl = new URL(route.request().url())
        if (input.expectedPaymentLinkId) {
            expect(requestUrl.searchParams.get("paymentLinkId")).toBe(input.expectedPaymentLinkId)
        }
        if (input.expectedSessionId) {
            expect(requestUrl.searchParams.get("sessionId")).toBe(input.expectedSessionId)
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: true,
                paid: input.paid,
                checkoutSessionId: input.checkoutSessionId,
                paidAt: input.paidAt,
            }),
        })
    })
}

test.describe("Payment success page", () => {
    test("matching local estimate is marked paid after Stripe success", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 })
        await seedStoredEstimate(page)

        const [estimate] = await readStoredEstimates(page)
        expect(estimate).toBeTruthy()
        expect(estimate.status).toBe("sent")

        const sessionId = "cs_test_payment_success_1234567890"
        await mockStripePaymentStatus(page, {
            paid: true,
            checkoutSessionId: sessionId,
            paidAt: "2026-05-23T12:00:00.000Z",
            expectedPaymentLinkId: "plink_payment_success",
            expectedSessionId: sessionId,
        })
        await page.goto(`/payment-success?estimateId=${estimate.id}&estimateNumber=${estimate.estimateNumber}&session_id=${sessionId}`)

        const localStatus = page.getByTestId("payment-success-local-status")
        await expect(localStatus).toBeVisible()
        await expect(localStatus).toContainText("Local history updated to paid")
        await expect(localStatus).toContainText("Paid lane")
        await expect(page.getByTestId("payment-success-paid-summary")).toContainText("Payment Success Customer")
        await expect(page.getByTestId("payment-success-paid-summary")).toContainText("$")
        await expect(page.getByTestId("payment-success-handoff-card")).toContainText("Payment handoff")
        await expect(page.getByTestId("payment-success-handoff-card")).toContainText("Stripe webhook sync")
        await expect(page.getByTestId("payment-success-next-steps")).toBeVisible()
        await expect(page.getByTestId("payment-success-reference-grid")).toContainText(estimate.estimateNumber)
        await expect(page.getByTestId("payment-success-history-link")).toHaveAttribute(
            "href",
            `/history?payment=success&estimateId=${estimate.id}&estimateNumber=${estimate.estimateNumber}`
        )

        const workbenchBox = await page.getByTestId("payment-success-workbench").boundingBox()
        const commandCenterBox = await page.getByTestId("payment-success-command-center").boundingBox()
        const nextStepsBox = await page.getByTestId("payment-success-next-steps").boundingBox()
        const actionsPanelBox = await page.getByTestId("payment-success-actions-panel").boundingBox()
        const handoffBox = await page.getByTestId("payment-success-handoff-card").boundingBox()

        expect(workbenchBox).toBeTruthy()
        expect(commandCenterBox).toBeTruthy()
        expect(nextStepsBox).toBeTruthy()
        expect(actionsPanelBox).toBeTruthy()
        expect(handoffBox).toBeTruthy()
        expect(workbenchBox!.width).toBeGreaterThan(800)
        expect(nextStepsBox!.x).toBeGreaterThan(commandCenterBox!.x)
        expect(actionsPanelBox!.x).toBeGreaterThan(handoffBox!.x)

        const [updatedEstimate] = await readStoredEstimates(page)
        expect(updatedEstimate.status).toBe("paid")
        expect(updatedEstimate.lastPaymentSessionId).toBe(sessionId)
        expect(updatedEstimate.paymentCompletedAt).toBeTruthy()

        await page.getByTestId("payment-success-history-link").click()
        await expect(page).toHaveURL(new RegExp(`/history\\?payment=success&estimateId=${estimate.id}&estimateNumber=${estimate.estimateNumber}`))
        await expect(page.getByTestId("history-payment-return-banner")).toContainText("Payment matched in History")
        await expect(page.getByTestId("history-payment-return-banner")).toContainText(updatedEstimate.estimateNumber)
        await expect(page.getByTestId("history-payment-return-estimate")).toContainText("Paid")
        await expect(page.getByTestId("history-payment-return-estimate")).toContainText("Emergency shutoff valve replacement")

        const bannerBox = await page.getByTestId("history-payment-return-banner").boundingBox()
        const localModeBox = await page.getByTestId("history-local-mode-banner").boundingBox()
        expect(bannerBox).toBeTruthy()
        expect(localModeBox).toBeTruthy()
        expect(bannerBox!.y).toBeLessThan(localModeBox!.y)

        const lanesBox = await page.getByTestId("history-estimate-lanes-section").boundingBox()
        const summaryBox = await page.getByTestId("history-summary-panel").boundingBox()
        expect(lanesBox).toBeTruthy()
        expect(summaryBox).toBeTruthy()
        expect(lanesBox!.y).toBeLessThan(summaryBox!.y)
    })

    test("unverified success URL does not mark a local estimate paid", async ({ page }) => {
        await seedStoredEstimate(page)

        const [estimate] = await readStoredEstimates(page)
        const sessionId = "cs_test_forged_payment_success"
        await mockStripePaymentStatus(page, {
            paid: false,
            expectedPaymentLinkId: "plink_payment_success",
            expectedSessionId: sessionId,
        })

        await page.goto(`/payment-success?estimateId=${estimate.id}&estimateNumber=${estimate.estimateNumber}&session_id=${sessionId}`)

        const localStatus = page.getByTestId("payment-success-local-status")
        await expect(localStatus).toBeVisible()
        await expect(localStatus).toContainText("Payment status needs a History check")
        await expect(localStatus).toContainText("Stripe did not confirm")

        const [updatedEstimate] = await readStoredEstimates(page)
        expect(updatedEstimate.status).toBe("sent")
        expect(updatedEstimate.lastPaymentSessionId).toBeUndefined()
        expect(updatedEstimate.paymentCompletedAt).toBeUndefined()
    })

    test("payment success trusts existing local payment evidence without rechecking Stripe", async ({ page }) => {
        const paidAt = "2026-05-23T12:00:00.000Z"
        await seedStoredEstimate(page, {
            ...seededPaymentEstimate,
            status: "sent",
            paymentCompletedAt: paidAt,
        })

        const [estimate] = await readStoredEstimates(page)
        expect(estimate.status).toBe("sent")
        expect(estimate.paymentCompletedAt).toBe(paidAt)

        let stripeStatusRequests = 0
        await page.route("**/api/payments/stripe/status?**", async (route) => {
            stripeStatusRequests += 1
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: false,
                    paid: false,
                }),
            })
        })

        await page.goto(`/payment-success?estimateId=${estimate.id}&estimateNumber=${estimate.estimateNumber}&session_id=cs_unverified_already_paid`)

        const localStatus = page.getByTestId("payment-success-local-status")
        await expect(localStatus).toBeVisible()
        await expect(localStatus).toContainText("Local history already showed paid")
        await expect(localStatus).toContainText("Paid lane")
        expect(stripeStatusRequests).toBe(0)

        const [updatedEstimate] = await readStoredEstimates(page)
        expect(updatedEstimate.status).toBe("paid")
        expect(updatedEstimate.paymentCompletedAt).toBe(paidAt)
        expect(updatedEstimate.lastPaymentSessionId).toBeUndefined()
    })

    test("success URL without a checkout session id does not mark a local estimate paid", async ({ page }) => {
        await seedStoredEstimate(page)

        const [estimate] = await readStoredEstimates(page)
        let stripeStatusRequests = 0
        await page.route("**/api/payments/stripe/status?**", async (route) => {
            stripeStatusRequests += 1
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: true,
                    paid: true,
                    checkoutSessionId: "cs_paid_without_return_session",
                    paidAt: "2026-05-23T12:00:00.000Z",
                }),
            })
        })

        await page.goto(`/payment-success?estimateId=${estimate.id}&estimateNumber=${estimate.estimateNumber}`)

        const localStatus = page.getByTestId("payment-success-local-status")
        const historyLink = page.getByTestId("payment-success-history-link")
        await expect(localStatus).toBeVisible()
        await expect(localStatus).toContainText("Payment status needs a History check")
        await expect(localStatus).toContainText("checkout session id was not included")
        await expect(historyLink).toHaveText(/Check History/)
        await expect(historyLink).toHaveAttribute(
            "href",
            `/history?payment=success&estimateId=${estimate.id}&estimateNumber=${estimate.estimateNumber}&paymentStatus=missing_session`
        )
        expect(stripeStatusRequests).toBe(0)

        const [updatedEstimate] = await readStoredEstimates(page)
        expect(updatedEstimate.status).toBe("sent")
        expect(updatedEstimate.lastPaymentSessionId).toBeUndefined()
        expect(updatedEstimate.paymentCompletedAt).toBeUndefined()

        await historyLink.click()
        await expect(page).toHaveURL(new RegExp(`/history\\?payment=success&estimateId=${estimate.id}&estimateNumber=${estimate.estimateNumber}&paymentStatus=missing_session`))
        await expect(page.getByTestId("history-payment-return-banner")).toContainText("Payment confirmation needed")
        await expect(page.getByTestId("history-payment-return-banner")).toContainText("checkout session id")
    })

    test("customer-device success explains that cloud history will sync", async ({ page }) => {
        await page.goto("/payment-success?estimateId=11111111-1111-4111-8111-111111111111&estimateNumber=EST-404&session_id=cs_test_missing_local")

        const localStatus = page.getByTestId("payment-success-local-status")
        await expect(localStatus).toBeVisible()
        await expect(localStatus).toContainText("Payment confirmed, local estimate not found")
        await expect(localStatus).toContainText("open History on the contractor device")
        await expect(page.getByTestId("payment-success-history-link")).toHaveAttribute(
            "href",
            "/history?payment=success&estimateId=11111111-1111-4111-8111-111111111111&estimateNumber=EST-404"
        )

        await page.getByTestId("payment-success-history-link").click()
        await expect(page.getByTestId("history-payment-return-banner")).toContainText("Payment received, local estimate not found")
        await expect(page.getByTestId("history-payment-return-banner")).toContainText("EST-404")
        await expect(page.getByText("No paid estimates")).toBeVisible()

        const bannerBox = await page.getByTestId("history-payment-return-banner").boundingBox()
        const localModeBox = await page.getByTestId("history-local-mode-banner").boundingBox()
        expect(bannerBox).toBeTruthy()
        expect(localModeBox).toBeTruthy()
        expect(bannerBox!.y).toBeLessThan(localModeBox!.y)

        const lanesBox = await page.getByTestId("history-estimate-lanes-section").boundingBox()
        const summaryBox = await page.getByTestId("history-summary-panel").boundingBox()
        expect(lanesBox).toBeTruthy()
        expect(summaryBox).toBeTruthy()
        expect(lanesBox!.y).toBeLessThan(summaryBox!.y)
    })

    test("missing return reference sends users to History without promising a specific paid estimate", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto("/payment-success")

        const localStatus = page.getByTestId("payment-success-local-status")
        const historyLink = page.getByTestId("payment-success-history-link")

        await expect(localStatus).toBeVisible()
        await expect(localStatus).toContainText("No estimate reference was included")
        await expect(historyLink).toHaveText(/Open History/)
        await expect(historyLink).not.toHaveText(/View paid estimate/)
        await expect(historyLink).toHaveAttribute("href", "/history?payment=success")
        await expect(page.getByTestId("payment-success-handoff-card")).toContainText("Open History to check the latest Stripe sync status")

        const historyLinkBox = await historyLink.boundingBox()
        const actionsPanelBox = await page.getByTestId("payment-success-actions-panel").boundingBox()
        const handoffBox = await page.getByTestId("payment-success-handoff-card").boundingBox()
        const navBox = await page.getByTestId("bottom-navigation").boundingBox()

        expect(historyLinkBox).toBeTruthy()
        expect(actionsPanelBox).toBeTruthy()
        expect(handoffBox).toBeTruthy()
        expect(navBox).toBeTruthy()
        expect(historyLinkBox!.height).toBeGreaterThanOrEqual(44)
        expect(actionsPanelBox!.y + actionsPanelBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
        expect(handoffBox!.y).toBeGreaterThan(actionsPanelBox!.y)
    })

    test("long paid estimate references stay readable on mobile", async ({ page }) => {
        const longEstimate = {
            ...seededPaymentEstimate,
            id: "payment-success-long-estimate-1",
            estimateNumber: "EST-2026-NORTH-SHORE-COMMERCIAL-EMERGENCY-DISPATCH-000184",
            clientName: "Very Long Commercial Facilities Customer With Multiple Service Buildings",
            totalAmount: 12948.72,
        }
        const sessionId = "cs_test_payment_success_with_a_long_reference_0000000000001234567890"

        await page.setViewportSize({ width: 390, height: 844 })
        await seedStoredEstimate(page, longEstimate)
        const [seededEstimate] = await readStoredEstimates(page)
        expect(seededEstimate.id).toBe(longEstimate.id)
        expect(seededEstimate.estimateNumber).toBe(longEstimate.estimateNumber)
        await mockStripePaymentStatus(page, {
            paid: true,
            checkoutSessionId: sessionId,
            paidAt: "2026-05-23T12:00:00.000Z",
            expectedPaymentLinkId: "plink_payment_success",
            expectedSessionId: sessionId,
        })
        await page.goto(`/payment-success?estimateId=${longEstimate.id}&estimateNumber=${longEstimate.estimateNumber}&session_id=${sessionId}`)

        const referenceGrid = page.getByTestId("payment-success-reference-grid")
        const estimateReference = page.getByTestId("payment-success-reference-estimate")
        const paidClient = page.getByTestId("payment-success-paid-client")
        const historyLink = page.getByTestId("payment-success-history-link")

        await expect(page.getByTestId("payment-success-local-status")).toContainText("Local history updated to paid")
        await expect(estimateReference).toContainText("NORTH-SHORE-COMMERCIAL")
        await expect(paidClient).toContainText("Multiple Service Buildings")
        await expect(page.getByTestId("sync-status-button")).toHaveCount(0)
        await expect(historyLink).toHaveAttribute(
            "href",
            `/history?payment=success&estimateId=${longEstimate.id}&estimateNumber=${longEstimate.estimateNumber}`
        )

        const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
        const estimateReferenceFits = await estimateReference.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
        const paidClientFits = await paidClient.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
        const referenceGridBox = await referenceGrid.boundingBox()
        const historyLinkBox = await historyLink.boundingBox()
        const navBox = await page.getByTestId("bottom-navigation").boundingBox()

        expect(pageFits).toBe(true)
        expect(estimateReferenceFits).toBe(true)
        expect(paidClientFits).toBe(true)
        expect(referenceGridBox).not.toBeNull()
        expect(historyLinkBox).not.toBeNull()
        expect(navBox).not.toBeNull()
        expect(referenceGridBox!.width).toBeGreaterThan(300)
        expect(historyLinkBox!.height).toBeGreaterThanOrEqual(44)
        expect(historyLinkBox!.y + historyLinkBox!.height).toBeLessThanOrEqual(navBox!.y - 8)

        const [updatedEstimate] = await readStoredEstimates(page)
        expect(updatedEstimate.status).toBe("paid")
        expect(updatedEstimate.lastPaymentSessionId).toBe(sessionId)
    })
})

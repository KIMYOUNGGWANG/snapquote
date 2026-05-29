import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local", quiet: true })

const MOCK_ESTIMATE_RESPONSE = {
    items: [
        {
            id: "item-1",
            itemNumber: 1,
            category: "PARTS",
            description: "Install 200A main panel",
            quantity: 1,
            unit: "ea",
            unit_price: 450,
            total: 450,
        },
        {
            id: "item-2",
            itemNumber: 2,
            category: "LABOR",
            description: "Panel installation and inspection",
            quantity: 4,
            unit: "hr",
            unit_price: 110,
            total: 440,
        },
    ],
    summary_note: "Upgrade main electrical panel to 200A service.",
    payment_terms: "50% deposit required before work begins.",
    closing_note: "Licensed and insured. Permit pulled same day.",
    warnings: [],
}

const SECTION_ESTIMATE_RESPONSE = {
    items: [],
    sections: [
        {
            id: "section-1",
            name: "Rough-in",
            divisionCode: "16",
            items: [
                {
                    id: "section-item-1",
                    itemNumber: 1,
                    category: "PARTS",
                    description: "Install feeder cable",
                    quantity: 40,
                    unit: "LF",
                    unit_price: 8,
                    total: 320,
                },
                {
                    id: "section-item-2",
                    itemNumber: 2,
                    category: "LABOR",
                    description: "Rough-in and terminate circuit",
                    quantity: 3,
                    unit: "hr",
                    unit_price: 110,
                    total: 330,
                },
            ],
        },
    ],
    summary_note: "Section-based electrical rough-in estimate.",
    payment_terms: "Due on completion.",
    closing_note: "Thank you for choosing us.",
    warnings: [],
}

function getSupabaseAuthStorageKey() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0]
    return `sb-${projectRef}-auth-token`
}

async function seedAuthenticatedSupabaseSession(
    context: BrowserContext,
    options: { accessToken?: string } = {}
) {
    await context.addInitScript(({ storageKey, accessToken }) => {
        window.localStorage.setItem(
            storageKey,
            JSON.stringify({
                access_token: accessToken,
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
    }, { storageKey: getSupabaseAuthStorageKey(), accessToken: options.accessToken ?? "test-access-token" })
}

async function mockBillingSubscription(page: Page, planTier: "free" | "starter" | "pro" | "team" = "pro") {
    await page.route("**/api/billing/subscription", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: true,
                planTier,
                subscribed: planTier !== "free",
                status: planTier === "free" ? null : "active",
                cancelAtPeriodEnd: false,
            }),
        })
    })
}

async function fillResultClientName(page: Page, clientName: string) {
    const clientNameInput = page.getByTestId("result-client-name-input")

    if (await clientNameInput.count() === 0) {
        await expect(page.getByTestId("result-client-details-collapsed")).toBeVisible()
        await page.getByTestId("result-client-details-button").click()
    }

    await expect(clientNameInput).toBeVisible()
    await clientNameInput.fill(clientName)
}

async function seedUnsyncedDraft(page: Page) {
    await page.evaluate(async () => {
        window.localStorage.setItem("snapquote_onboarding_completed", "true")

        function requestToPromise<T>(request: IDBRequest<T>) {
            return new Promise<T>((resolve, reject) => {
                request.onerror = () => reject(request.error)
                request.onsuccess = () => resolve(request.result)
            })
        }

        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("snapquote-db", 6)
            request.onerror = () => reject(request.error)
            request.onupgradeneeded = () => {
                const db = request.result
                const createStore = (name: string, indexes: Array<{ name: string; keyPath: string }>) => {
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
        await requestToPromise(transaction.objectStore("estimates").put({
            id: "sync-failure-draft",
            estimateNumber: "EST-2605-909",
            status: "draft",
            clientName: "Sync Failure Customer",
            clientAddress: "44 Local Lane",
            summary_note: "Local draft should remain calm during background sync failure.",
            taxRate: 8.25,
            taxAmount: 0,
            totalAmount: 180,
            createdAt: "2026-05-23T08:00:00.000Z",
            updatedAt: "2026-05-23T10:00:00.000Z",
            synced: false,
            items: [
                {
                    id: "sync-failure-item-1",
                    itemNumber: 1,
                    category: "SERVICE",
                    description: "Local-only repair scope",
                    quantity: 1,
                    unit: "LS",
                    unit_price: 180,
                    total: 180,
                },
            ],
        }))
        await new Promise<void>((resolve, reject) => {
            transaction.onerror = () => reject(transaction.error)
            transaction.oncomplete = () => resolve()
        })
        database.close()
    })
}

test.describe("Estimate generation and PDF download", () => {
    test("voice → AI estimate → save and download PDF flow", async ({ page }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill(
            "Upgrade main electrical panel to 200A service, pull permit, install breakers."
        )
        await page.getByTestId("generate-estimate-button").click()

        // Verify estimate draft rendered
        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await expect(page.getByRole("button", { name: /save estimate/i })).toBeVisible()
        await expect(page.getByRole("button", { name: /download pdf/i })).toBeVisible()

        // Save estimate
        await page.getByRole("button", { name: /save estimate/i }).click()
    })

    test("AI generation fails with 500 - shows error state", async ({ page }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ error: "AI service temporarily unavailable" }),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Install new hot water heater.")
        await page.getByTestId("generate-estimate-button").click()

        // Should not render result step on error
        await expect(page.getByTestId("estimate-draft-title")).not.toBeVisible({ timeout: 5000 })
    })

    test("AI generation returns rate limit 429 - shows retry message", async ({ page }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 429,
                contentType: "application/json",
                body: JSON.stringify({ error: "Rate limit exceeded. Please try again in 30 seconds." }),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Install new hot water heater.")
        await page.getByTestId("generate-estimate-button").click()

        // Verify user sees an error/toast notification
        await expect(page.getByTestId("estimate-draft-title")).not.toBeVisible({ timeout: 5000 })
    })
})

test.describe("Payment link flow", () => {
    test("payment link card explains signed-out setup before redirecting to login", async ({ page }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Upgrade electrical panel.")
        await expect(page.getByTestId("generate-estimate-button")).toBeEnabled()
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")

        await expect(page.getByTestId("payment-link-card")).toBeVisible()
        await expect(page.getByTestId("payment-link-status")).toHaveText("Not attached")
        await expect(page.getByTestId("payment-link-helper")).toContainText("Add a card payment link")

        const paymentSwitch = page.getByRole("switch", { name: "Add payment link" })
        await expect(paymentSwitch).toHaveAttribute("aria-checked", "false")
        await paymentSwitch.click()

        await expect(page).toHaveURL(/\/login\?next=%2Fnew-estimate%3FdraftId%3D[^&]+&intent=payment-link/, { timeout: 10000 })
        await expect(page.getByTestId("login-return-target")).toHaveText(/payment link setup/i)
    })

    test("payment link card disables setup while offline", async ({ page, context }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Upgrade electrical panel.")
        await expect(page.getByTestId("generate-estimate-button")).toBeEnabled()
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")

        await context.setOffline(true)
        await page.evaluate(() => {
            Object.defineProperty(window.navigator, "onLine", {
                configurable: true,
                get: () => false,
            })
            window.dispatchEvent(new Event("offline"))
        })

        await expect(page.getByTestId("payment-link-status")).toHaveText("Offline")
        await expect(page.getByTestId("payment-link-helper")).toContainText("Go online")
        await expect(page.getByRole("switch", { name: "Add payment link" })).toBeDisabled()

        await context.setOffline(false)
    })

    test("payment option modal validates custom amounts before creating a link", async ({ page, context }) => {
        await page.setViewportSize({ width: 390, height: 740 })
        await seedAuthenticatedSupabaseSession(context)
        let paymentLinkRequest: { amount?: number; customerName?: string } | null = null

        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })
        await page.route("**/api/create-payment-link", async (route) => {
            paymentLinkRequest = route.request().postDataJSON()
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    url: "https://buy.stripe.com/test_custom",
                    id: "plink_test_custom",
                }),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Upgrade electrical panel.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await fillResultClientName(page, "Acme Electric")
        await page.getByRole("switch", { name: "Add payment link" }).click()

        const paymentDialog = page.getByRole("dialog", { name: "Payment Link Options" })
        await expect(paymentDialog).toBeVisible()
        await expect(page.getByTestId("payment-option-summary")).toBeVisible()
        await expect(page.getByTestId("payment-option-request-summary")).toHaveText("Full payment")
        await expect(page.getByTestId("payment-request-total")).toHaveText("$1005.70")

        const fullPaymentRadioBox = await page.getByRole("radio", { name: "Full Payment" }).boundingBox()
        const depositRadioBox = await page.getByRole("radio", { name: "50% Deposit" }).boundingBox()
        const customRadioBox = await page.getByRole("radio", { name: "Custom Amount" }).boundingBox()
        expect(fullPaymentRadioBox).not.toBeNull()
        expect(depositRadioBox).not.toBeNull()
        expect(customRadioBox).not.toBeNull()
        expect(fullPaymentRadioBox!.width).toBeGreaterThanOrEqual(44)
        expect(fullPaymentRadioBox!.height).toBeGreaterThanOrEqual(44)
        expect(depositRadioBox!.width).toBeGreaterThanOrEqual(44)
        expect(depositRadioBox!.height).toBeGreaterThanOrEqual(44)
        expect(customRadioBox!.width).toBeGreaterThanOrEqual(44)
        expect(customRadioBox!.height).toBeGreaterThanOrEqual(44)

        const paymentFooterBox = await page.getByTestId("payment-option-footer").boundingBox()
        expect(paymentFooterBox).not.toBeNull()
        expect(paymentFooterBox!.y + paymentFooterBox!.height).toBeLessThanOrEqual(740)

        await page.getByText("Custom Amount").click()
        await expect(page.getByTestId("payment-option-request-summary")).toHaveText("Custom amount")
        await page.getByTestId("custom-payment-amount-input").fill("1200")

        await expect(page.getByTestId("custom-payment-amount-help")).toHaveText("Custom amount cannot exceed the estimate total.")
        await expect(page.getByTestId("custom-payment-amount-input")).toHaveAttribute("aria-invalid", "true")
        await expect(page.getByTestId("create-payment-link-button")).toHaveAttribute("aria-disabled", "true")

        await page.getByTestId("custom-payment-amount-input").fill("250")

        await expect(page.getByTestId("custom-payment-amount-help")).toHaveText("Use this for a partial deposit or milestone payment.")
        await expect(page.getByTestId("payment-request-total")).toHaveText("$250.00")
        await expect(page.getByTestId("create-payment-link-button")).toBeEnabled()
        await page.getByTestId("create-payment-link-button").click()

        await expect(page.getByTestId("payment-link-status")).toHaveText("Attached")
        await expect(page.getByTestId("payment-link-card").getByText("Custom amount")).toBeVisible()
        await expect(page.getByTestId("handoff-actions-helper")).toHaveText("PDF includes payment and final line items.")
        await expect(page.getByTestId("handoff-payment-status")).toHaveText("Custom")
        expect(paymentLinkRequest).toEqual(expect.objectContaining({
            amount: 250,
            customerName: "Acme Electric",
        }))
    })

    test("payment link card keeps Stripe setup failures visible with recovery actions", async ({ page, context }) => {
        await seedAuthenticatedSupabaseSession(context)

        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })
        await page.route("**/api/create-payment-link", async (route) => {
            await route.fulfill({
                status: 403,
                contentType: "application/json",
                body: JSON.stringify({
                    error: "Stripe Connect account is not linked. Connect Stripe in Profile first.",
                    code: "STRIPE_CONNECT_REQUIRED",
                }),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Upgrade electrical panel.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await fillResultClientName(page, "Acme Electric")
        await page.getByRole("switch", { name: "Add payment link" }).click()

        const paymentDialog = page.getByRole("dialog", { name: "Payment Link Options" })
        await expect(paymentDialog).toBeVisible()
        await page.getByTestId("create-payment-link-button").click()
        await expect(paymentDialog).not.toBeVisible()

        await expect(page.getByTestId("payment-link-status")).toHaveText("Setup needed")
        await expect(page.getByTestId("payment-link-helper")).toContainText("Stripe is not connected yet")
        await expect(page.getByTestId("payment-link-switch")).toHaveAttribute("aria-checked", "false")

        const paymentIssue = page.getByTestId("payment-link-issue")
        await expect(paymentIssue).toBeVisible()
        await expect(paymentIssue).toContainText("Connect Stripe to get paid online")
        await expect(paymentIssue).toContainText("Open Profile, connect Stripe")
        await expect(page.getByTestId("payment-link-profile-action")).toHaveAttribute("href", "/profile#stripe-connect")

        await page.getByTestId("payment-link-retry-action").click()
        await expect(page.getByRole("dialog", { name: "Payment Link Options" })).toBeVisible()
    })

    test("payment link setup keeps narrow mobile errors readable", async ({ page, context }) => {
        await page.setViewportSize({ width: 320, height: 700 })
        await seedAuthenticatedSupabaseSession(context)
        const longPaymentError = [
            "PAYMENT_PROCESSOR_CONFIGURATION_FAILURE_FOR_FIELD_CREWS_WITH_LONG_ACCOUNT_REFERENCE",
            "Connect the right Stripe destination before sending this estimate.",
        ].join(" ")

        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })
        await page.route("**/api/create-payment-link", async (route) => {
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({
                    error: longPaymentError,
                    code: "PAYMENT_PROVIDER_FAILURE",
                }),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Upgrade electrical panel.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await fillResultClientName(page, "ACME-SERVICE-CUSTOMER-WITH-A-LONG-UNBROKEN-FIELD-NAME")
        await page.getByRole("switch", { name: "Add payment link" }).click()

        const paymentDialog = page.getByRole("dialog", { name: "Payment Link Options" })
        await expect(paymentDialog).toBeVisible()
        await expect(page.getByTestId("payment-option-summary")).toBeVisible()

        const dialogBox = await paymentDialog.boundingBox()
        const footerBox = await page.getByTestId("payment-option-footer").boundingBox()
        const createButtonBox = await page.getByTestId("create-payment-link-button").boundingBox()
        const createButtonLabelFits = await page.getByTestId("create-payment-link-button")
            .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
        const modalFitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

        expect(dialogBox).not.toBeNull()
        expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
        expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(320)
        expect(footerBox).not.toBeNull()
        expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(700)
        expect(createButtonBox).not.toBeNull()
        expect(createButtonBox!.height).toBeGreaterThanOrEqual(44)
        expect(createButtonLabelFits).toBe(true)
        expect(modalFitsViewport).toBe(true)

        await page.getByTestId("create-payment-link-button").click()

        const issueCard = page.getByTestId("payment-link-issue")
        const issueMessage = page.getByTestId("payment-link-issue-message")
        const issueActions = page.getByTestId("payment-link-issue-actions")

        await expect(issueCard).toBeVisible()
        await expect(page.getByTestId("payment-link-status")).toHaveText("Failed")
        await expect(issueMessage).toContainText("PAYMENT_PROCESSOR_CONFIGURATION_FAILURE")
        await expect(page.getByTestId("payment-link-switch")).toHaveAttribute("aria-checked", "false")
        await expect(page.getByTestId("toast-message")).toHaveCount(0)

        const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
        const issueFits = await issueCard.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
        const issueMessageFits = await issueMessage.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
        const issueActionsBox = await issueActions.boundingBox()
        const retryButtonBox = await page.getByTestId("payment-link-retry-action").boundingBox()

        expect(pageFits).toBe(true)
        expect(issueFits).toBe(true)
        expect(issueMessageFits).toBe(true)
        expect(issueActionsBox).not.toBeNull()
        expect(issueActionsBox!.x).toBeGreaterThanOrEqual(0)
        expect(issueActionsBox!.x + issueActionsBox!.width).toBeLessThanOrEqual(320)
        expect(retryButtonBox).not.toBeNull()
        expect(retryButtonBox!.height).toBeGreaterThanOrEqual(44)

        await page.getByTestId("payment-link-retry-action").click()
        await expect(page.getByRole("dialog", { name: "Payment Link Options" })).toBeVisible()
    })
})

test.describe("Offline handling", () => {
    test("offline banner appears when network is unavailable", async ({ page, context }) => {
        await page.goto("/new-estimate")
        await page.waitForFunction(() => document.documentElement.dataset.snapquoteOfflineMonitor === "ready")

        // Simulate going offline
        await context.setOffline(true)
        await page.evaluate(() => {
            Object.defineProperty(window.navigator, "onLine", {
                configurable: true,
                get: () => false,
            })
            window.dispatchEvent(new Event("offline"))
        })

        // The offline banner should appear
        await expect(page.getByText(/you're offline|some features may be limited/i)).toBeVisible({ timeout: 5000 })

        // Restore connectivity
        await context.setOffline(false)
        await page.evaluate(() => {
            Object.defineProperty(window.navigator, "onLine", {
                configurable: true,
                get: () => true,
            })
            window.dispatchEvent(new Event("online"))
        })

        await expect(page.getByTestId("offline-status-banner")).toContainText(/no local changes are waiting/i)
        await expect(page.getByText(/local changes are ready to sync/i)).toHaveCount(0)
    })

    test("offline banner stacks below an active toast without overlap", async ({ page, context }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.goto("/new-estimate")
        await page.waitForFunction(() => document.documentElement.dataset.snapquoteOfflineMonitor === "ready")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Upgrade electrical panel.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await expect(page.getByTestId("result-generation-status")).toContainText("Draft ready")
        await page.getByTestId("result-referral-link-button").click()
        await expect(page.getByTestId("toast-message")).toContainText("Log in first to generate your referral link.")

        await context.setOffline(true)
        await page.evaluate(() => {
            Object.defineProperty(window.navigator, "onLine", {
                configurable: true,
                get: () => false,
            })
            window.dispatchEvent(new Event("offline"))
        })

        const offlineBanner = page.getByTestId("offline-status-banner")
        const toastMessage = page.getByTestId("toast-message")
        const bottomNavigation = page.getByTestId("bottom-navigation")

        await expect(offlineBanner).toBeVisible()
        await expect(toastMessage).toBeVisible()
        await expect(bottomNavigation).toBeVisible()

        await expect.poll(async () => {
            const bannerBox = await offlineBanner.boundingBox()
            const toastBox = await toastMessage.boundingBox()
            const navBox = await bottomNavigation.boundingBox()

            if (!bannerBox || !toastBox || !navBox) return true

            const toastOverlapsBanner = !(
                toastBox.x + toastBox.width <= bannerBox.x ||
                bannerBox.x + bannerBox.width <= toastBox.x ||
                toastBox.y + toastBox.height <= bannerBox.y ||
                bannerBox.y + bannerBox.height <= toastBox.y
            )
            const bannerOverlapsNav = !(
                bannerBox.x + bannerBox.width <= navBox.x ||
                navBox.x + navBox.width <= bannerBox.x ||
                bannerBox.y + bannerBox.height <= navBox.y ||
                navBox.y + navBox.height <= bannerBox.y
            )
            const toastOverlapsNav = !(
                toastBox.x + toastBox.width <= navBox.x ||
                navBox.x + navBox.width <= toastBox.x ||
                toastBox.y + toastBox.height <= navBox.y ||
                navBox.y + navBox.height <= toastBox.y
            )

            return toastOverlapsBanner || bannerOverlapsNav || toastOverlapsNav
        }).toBe(false)
        await context.setOffline(false)
    })

    test("background sync failure stays in the sync pill until manual retry", async ({ page, context }) => {
        await seedAuthenticatedSupabaseSession(context, { accessToken: "header.payload.signature" })
        await page.route("**/auth/v1/user", async (route) => {
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
        await page.route("**/rest/v1/estimates**", async (route) => {
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ message: "Synthetic sync outage" }),
            })
        })

        await page.goto("/")
        await seedUnsyncedDraft(page)
        await page.reload()

        await expect(page.getByTestId("sync-status-button")).toContainText(/retry 1/i)
        await expect(page.getByText("Sync failed. Tap to retry.")).toHaveCount(0)
        await expect(page.getByText("Sync failed. Changes are still saved locally.")).toHaveCount(0)

        await page.getByTestId("sync-status-button").click()
        await expect(page.getByText("Sync failed. Changes are still saved locally.")).toBeVisible()
    })

    test("malformed saved session does not surface sync failure chrome", async ({ page, context }) => {
        const consoleErrors: string[] = []
        page.on("console", (message) => {
            if (message.type() === "error") consoleErrors.push(message.text())
        })

        await seedAuthenticatedSupabaseSession(context)

        await page.goto("/")
        await seedUnsyncedDraft(page)
        await page.reload()
        await page.waitForTimeout(500)

        await expect(page.getByTestId("sync-status-button")).toHaveCount(0)
        await expect(page.getByText(/sync failed/i)).toHaveCount(0)
        expect(consoleErrors.some((message) => message.includes("Expected 3 parts in JWT"))).toBe(false)
    })

    test("estimate can be saved offline and persists to localStorage", async ({ page, context }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Upgrade electrical panel.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")

        // Go offline before saving
        await context.setOffline(true)

        // Save should still work (saves to localStorage)
        const saveBtn = page.getByRole("button", { name: /save estimate/i })
        if (await saveBtn.isVisible()) {
            await saveBtn.click()
        }

        // Restore connectivity
        await context.setOffline(false)
    })
})

test.describe("History page", () => {
    test("history page loads and shows tabs", async ({ page }) => {
        await page.goto("/history")
        await expect(page.getByTestId("history-local-mode-banner")).toBeVisible({ timeout: 5000 })
        await expect(page.getByRole("button", { name: /drafts/i })).toBeVisible()
    })

    test("saved local draft is visible in history without sign-in", async ({ page }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill(
            "Upgrade main electrical panel to 200A service, pull permit, install breakers."
        )
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await fillResultClientName(page, "Acme Local Draft")
        await page.getByRole("button", { name: /save estimate/i }).click()

        await expect(page).toHaveURL(/\/history/, { timeout: 10000 })
        await expect(page.getByTestId("toast-stack")).toBeVisible()
        await expect(page.getByTestId("history-local-mode-banner")).toBeVisible()

        const toastBox = await page.getByTestId("toast-stack").boundingBox()
        const localModeBannerBox = await page.getByTestId("history-local-mode-banner").boundingBox()

        expect(toastBox).not.toBeNull()
        expect(localModeBannerBox).not.toBeNull()

        const toastOverlapsLocalModeBanner = !(
            toastBox!.x + toastBox!.width <= localModeBannerBox!.x ||
            localModeBannerBox!.x + localModeBannerBox!.width <= toastBox!.x ||
            toastBox!.y + toastBox!.height <= localModeBannerBox!.y ||
            localModeBannerBox!.y + localModeBannerBox!.height <= toastBox!.y
        )

        expect(toastOverlapsLocalModeBanner).toBe(false)
        await expect(page.getByText("Acme Local Draft").first()).toBeVisible()
        await expect(page.getByText(/Upgrade main electrical panel/i)).toBeVisible()
        await expect(page.getByTestId("sync-status-button")).toHaveCount(0)

        await page.getByTestId("history-edit-draft-button").first().click()

        await expect(page).toHaveURL(/\/new-estimate\?draftId=/)
        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await expect(page.getByTestId("result-client-name-input")).toHaveValue("Acme Local Draft")

        await page.getByTestId("result-client-name-input").fill("Acme Revised Draft")
        await page.getByRole("button", { name: /save estimate/i }).click()

        await expect(page).toHaveURL(/\/history/, { timeout: 10000 })
        await expect(page.getByText("Acme Revised Draft").first()).toBeVisible()
        await expect(page.getByText("Acme Local Draft")).toHaveCount(0)

        await page.getByTestId("history-local-signin-link").click()
        await expect(page).toHaveURL(/\/login\?next=%2Fhistory/)
    })

    test("history preview includes section-based line items", async ({ page }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(SECTION_ESTIMATE_RESPONSE),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Build a section-based electrical rough-in estimate.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await fillResultClientName(page, "Section Client")
        await page.getByRole("button", { name: /save estimate/i }).click()

        await expect(page).toHaveURL(/\/history/, { timeout: 10000 })
        await expect(page.getByText("Section Client").first()).toBeVisible()
        await expect(page.getByText("2 items").first()).toBeVisible()

        await page.getByTestId("history-estimate-preview-action").click()
        await expect(page.getByRole("dialog", { name: "PDF Preview" })).toBeVisible()
        await expect(page.getByTestId("pdf-preview-review-line-item")).toHaveCount(2)
        await expect(page.getByText("Install feeder cable")).toBeVisible()
        await expect(page.getByText("Rough-in and terminate circuit")).toBeVisible()
    })

    test("history mobile cards prioritize primary estimate actions", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Install a service disconnect and label the panel.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await fillResultClientName(page, "Mobile Action Customer")
        await page.getByRole("button", { name: /save estimate/i }).click()

        await expect(page).toHaveURL(/\/history/, { timeout: 10000 })
        await expect(page.getByText("Mobile Action Customer").first()).toBeVisible()
        await page.getByText("Mobile Action Customer").first().scrollIntoViewIfNeeded()

        const primaryActions = page.getByTestId("history-estimate-primary-actions").first()
        await expect(primaryActions).toBeVisible()
        await expect(primaryActions.getByRole("button", { name: "Preview" })).toBeVisible()
        await expect(primaryActions.getByRole("button", { name: "PDF" })).toBeVisible()
        await expect(primaryActions.getByRole("button", { name: "Review draft" })).toBeVisible()
        await expect(page.getByTestId("sync-status-button")).toHaveCount(0)
        await expect(page.getByTestId("history-estimate-secondary-actions").first()).toBeHidden()

        await page.getByTestId("history-more-actions-toggle").first().click()
        await expect(page.getByTestId("history-estimate-secondary-actions").first()).toBeVisible()
        await expect(page.getByRole("button", { name: "Mark Sent" })).toBeVisible()

        const primaryActionsBox = await primaryActions.boundingBox()
        expect(primaryActionsBox).not.toBeNull()
        expect(primaryActionsBox!.width).toBeLessThanOrEqual(390)
    })

    test("history PDF download failure stays on the estimate with recovery actions", async ({ page }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Replace leaking shutoff valve.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await fillResultClientName(page, "PDF Recovery Customer")
        await page.getByRole("button", { name: /save estimate/i }).click()

        await expect(page).toHaveURL(/\/history/, { timeout: 10000 })
        await expect(page.getByText("PDF Recovery Customer").first()).toBeVisible()

        await page.evaluate(() => {
            const originalCreateObjectUrl = URL.createObjectURL.bind(URL)
            ;(window as Window & { __restoreCreateObjectURL?: () => void }).__restoreCreateObjectURL = () => {
                URL.createObjectURL = originalCreateObjectUrl
            }
            URL.createObjectURL = () => {
                throw new Error("Simulated PDF export failure")
            }
        })

        await page.getByRole("button", { name: /^PDF$/ }).click()

        const pdfIssue = page.getByTestId("history-pdf-issue")
        await expect(pdfIssue).toBeVisible()
        await expect(pdfIssue).toContainText("PDF was not downloaded")
        await expect(pdfIssue).toContainText("Retry the PDF download")
        await expect(page.getByTestId("history-pdf-retry-action")).toBeVisible()
        await expect(page.getByTestId("history-pdf-preview-action")).toBeVisible()

        await page.getByTestId("history-pdf-retry-action").click()
        await expect(pdfIssue).toBeVisible()

        await page.evaluate(() => {
            ;(window as Window & { __restoreCreateObjectURL?: () => void }).__restoreCreateObjectURL?.()
        })

        await page.getByTestId("history-pdf-preview-action").click()
        await expect(page.getByRole("dialog", { name: "PDF Preview" })).toBeVisible()
    })

    test("QuickBooks connect failure stays in the sync panel with fallback actions", async ({ page, context }) => {
        await seedAuthenticatedSupabaseSession(context)
        await mockBillingSubscription(page)

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

        await page.route("**/api/quickbooks/connect/start", async (route) => {
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ error: { message: "Unable to create auth URL" } }),
            })
        })

        await page.goto("/history")

        await expect(page.getByText("QuickBooks Sync")).toBeVisible()
        await expect(page.getByText("Not connected")).toBeVisible()

        await page.getByRole("button", { name: "Connect QuickBooks" }).click()

        const panelIssue = page.getByTestId("history-quickbooks-panel-issue")
        await expect(panelIssue).toBeVisible()
        await expect(panelIssue).toContainText("QuickBooks connection did not start")
        await expect(panelIssue).toContainText("Retry the connection")
        await expect(page.getByTestId("history-quickbooks-connect-retry-action")).toBeVisible()
        await expect(page.getByTestId("history-quickbooks-panel-export-action")).toBeVisible()

        await page.getByTestId("history-quickbooks-connect-retry-action").click()
        await expect(panelIssue).toBeVisible()
    })

    test("QuickBooks sync failure stays on the estimate with retry and CSV fallback", async ({ page, context }) => {
        await seedAuthenticatedSupabaseSession(context)
        await mockBillingSubscription(page)

        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
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
                    connected: true,
                    realmId: "1234567890",
                    reconnectRequired: false,
                    syncStats: { syncedInvoices: 0 },
                }),
            })
        })

        await page.route("**/api/quickbooks/invoices/sync", async (route) => {
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ error: { message: "QuickBooks request failed" } }),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Install subpanel and label circuits.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await fillResultClientName(page, "QuickBooks Recovery Customer")
        await page.getByRole("button", { name: /save estimate/i }).click()

        await expect(page).toHaveURL(/\/history/, { timeout: 10000 })
        await expect(page.getByText("QuickBooks Recovery Customer").first()).toBeVisible()

        await page.getByTestId("history-more-actions-toggle").first().click()
        await page.getByRole("button", { name: /^QuickBooks$/ }).click()

        const quickBooksIssue = page.getByTestId("history-quickbooks-issue")
        await expect(quickBooksIssue).toBeVisible()
        await expect(quickBooksIssue).toContainText("QuickBooks sync failed")
        await expect(quickBooksIssue).toContainText("Retry QuickBooks sync")
        await expect(page.getByTestId("history-quickbooks-retry-action")).toBeVisible()
        await expect(page.getByTestId("history-quickbooks-export-action")).toBeVisible()

        await page.getByTestId("history-quickbooks-retry-action").click()
        await expect(quickBooksIssue).toBeVisible()
    })
})

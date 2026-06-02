import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local", quiet: true })

const tinyProfileImageDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

function getSupabaseAuthStorageKey() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co"
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

async function mockProfileNetwork(
    page: Page,
    options: {
        logoUrl?: string
        estimateTemplateUrl?: string
        planTier?: "starter" | "pro" | "team"
        stripeConnectStatus?: {
            connected: boolean
            accountId?: string
            detailsSubmitted?: boolean
            chargesEnabled?: boolean
            payoutsEnabled?: boolean
        }
    } = {}
) {
    await page.route("**/auth/v1/token**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
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
            }),
        })
    })

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

    await page.route("**/rest/v1/profiles**", async (route) => {
        await route.fulfill({
            status: route.request().method() === "GET" ? 200 : 201,
            contentType: "application/json",
            body: JSON.stringify({
                business_name: "North Shore Plumbing",
                phone: "(555) 111-2222",
                email: "office@example.com",
                address: "120 Main St",
                license_number: "LIC-123",
                tax_rate: 8.25,
                logo_url: options.logoUrl ?? "",
                state_province: "CA",
                payment_link: "https://pay.example/north-shore",
                estimate_template_url: options.estimateTemplateUrl ?? "",
            }),
        })
    })

    await page.route("**/rest/v1/estimates**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([]),
        })
    })

    await page.route("**/api/billing/subscription", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: true,
                planTier: options.planTier ?? "starter",
                subscribed: true,
                status: "active",
                cancelAtPeriodEnd: false,
            }),
        })
    })

    await page.route("**/api/stripe/connect/status", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(options.stripeConnectStatus ?? { connected: false }),
        })
    })

    await page.route("**/api/referrals/status", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: true,
                token: "abc12345",
                shareUrl: "https://snapquote.app/?ref=abc12345",
                shareMessages: {
                    en: "Try SnapQuote",
                    es: "Prueba SnapQuote",
                    ko: "SnapQuote를 사용해 보세요",
                },
                metrics: {
                    visits: 0,
                    shareClicks: 0,
                    signupStarts: 0,
                    successfulClaims: 0,
                },
                rewards: {
                    activeReward: null,
                    pendingCreditMonths: 0,
                    totalCreditMonths: 0,
                },
                recentClaims: [],
            }),
        })
    })
}

async function seedProfilePriceList(
    page: Page,
    item: {
        id?: string
        name?: string
        price?: number
        unit?: string
        category?: "PARTS" | "LABOR" | "SERVICE"
        keywords?: string[]
    } = {}
) {
    await page.goto("/")

    const seededItem = {
        id: item.id || "profile-panel-diagnostic",
        name: item.name || "Panel Diagnostic",
        price: item.price ?? 180,
        unit: item.unit || "ea",
        category: item.category || "SERVICE",
        keywords: item.keywords || ["panel", "diagnostic"],
    }

    await page.evaluate(async (priceItem) => {
        const request = indexedDB.open("snapquote-db", 6)

        await new Promise<void>((resolve, reject) => {
            request.onupgradeneeded = () => {
                const db = request.result
                const createStore = (name: string, indexes: Array<[string, string]> = []) => {
                    if (db.objectStoreNames.contains(name)) return

                    const store = db.createObjectStore(name, { keyPath: "id" })
                    indexes.forEach(([indexName, keyPath]) => store.createIndex(indexName, keyPath))
                }

                createStore("estimates", [["by-date", "createdAt"], ["by-status", "status"]])
                createStore("photos", [["by-estimate", "estimateId"]])
                createStore("pendingAudio", [["by-date", "createdAt"], ["by-processed", "processed"]])
                createStore("priceList", [["by-category", "category"], ["by-name", "name"]])
                createStore("receipts", [["by-date", "date"]])
                createStore("timeEntries", [["by-date", "date"]])
                createStore("clients", [["by-name", "name"]])
            }
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve()
        })

        const db = request.result
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction("priceList", "readwrite")
            const store = transaction.objectStore("priceList")
            store.clear()
            store.put({
                id: priceItem.id,
                name: priceItem.name,
                price: priceItem.price,
                unit: priceItem.unit,
                category: priceItem.category,
                keywords: priceItem.keywords,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                usageCount: 2,
            })
            transaction.oncomplete = () => {
                db.close()
                resolve()
            }
            transaction.onerror = () => reject(transaction.error)
        })
    }, seededItem)
}

async function expectTouchTarget(locator: Locator) {
    const box = await locator.boundingBox()

    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
}

test("profile mobile shows setup readiness and jumps to business details", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    await mockProfileNetwork(page)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/profile")

    const setupGuide = page.getByTestId("profile-setup-guide")
    await expect(setupGuide).toBeVisible()
    await expect(setupGuide).toContainText("3/4 quote-ready settings complete")
    await expect(page.getByTestId("profile-setup-business-details")).toContainText("Ready")
    await expect(page.getByTestId("profile-setup-payments")).toContainText("Ready")
    await expect(page.getByTestId("profile-setup-price-list")).toContainText("Empty")

    const guideBox = await setupGuide.boundingBox()
    const bottomNavBox = await page.getByTestId("bottom-navigation").boundingBox()
    const finishSetupBox = await page.getByRole("link", { name: "Finish setup" }).boundingBox()

    expect(guideBox).not.toBeNull()
    expect(bottomNavBox).not.toBeNull()
    expect(finishSetupBox).not.toBeNull()
    expect(guideBox!.y + guideBox!.height).toBeLessThanOrEqual(bottomNavBox!.y - 8)
    expect(finishSetupBox!.height).toBeGreaterThanOrEqual(44)

    await page.getByRole("link", { name: "Finish setup" }).click()
    await expect(page.getByLabel("Business Name *")).toBeInViewport()

    await page.getByTestId("profile-setup-price-list").click()
    await expect(page.getByText("My Price List")).toBeInViewport()
})

test("profile desktop prioritizes business details in a two-column workbench", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    await mockProfileNetwork(page)

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/profile")

    const commandCenter = page.getByTestId("profile-command-center")
    const workbench = page.getByTestId("profile-workbench")
    const primaryColumn = page.getByTestId("profile-primary-column")
    const operationsPanel = page.getByTestId("profile-operations-panel")
    const businessDetails = page.getByTestId("business-details-card")
    const pdfBranding = page.getByTestId("pdf-branding-card")
    const stripeConnect = page.getByTestId("stripe-connect-card")
    const priceList = page.getByTestId("price-list-card")
    const nav = page.getByTestId("bottom-navigation")

    await expect(commandCenter).toBeVisible()
    await expect(workbench).toBeVisible()
    await expect(primaryColumn).toBeVisible()
    await expect(operationsPanel).toBeVisible()
    await expect(businessDetails).toBeVisible()
    await expect(pdfBranding).toBeVisible()
    await expect(stripeConnect).toBeVisible()
    await expect(priceList).toBeVisible()
    await expect(businessDetails).toContainText("Business Details")
    await expect(operationsPanel).toContainText("Stripe Connect")

    const commandBox = await commandCenter.boundingBox()
    const workbenchBox = await workbench.boundingBox()
    const primaryBox = await primaryColumn.boundingBox()
    const operationsBox = await operationsPanel.boundingBox()
    const businessBox = await businessDetails.boundingBox()
    const pdfBox = await pdfBranding.boundingBox()
    const stripeBox = await stripeConnect.boundingBox()
    const navBox = await nav.boundingBox()

    expect(commandBox).not.toBeNull()
    expect(workbenchBox).not.toBeNull()
    expect(primaryBox).not.toBeNull()
    expect(operationsBox).not.toBeNull()
    expect(businessBox).not.toBeNull()
    expect(pdfBox).not.toBeNull()
    expect(stripeBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(commandBox!.width).toBeGreaterThan(900)
    expect(workbenchBox!.width).toBeGreaterThan(900)
    expect(primaryBox!.x).toBeLessThan(operationsBox!.x)
    expect(Math.abs(primaryBox!.y - operationsBox!.y)).toBeLessThanOrEqual(2)
    expect(primaryBox!.width).toBeGreaterThan(580)
    expect(operationsBox!.width).toBeGreaterThan(320)
    expect(businessBox!.y).toBeLessThan(pdfBox!.y)
    expect(businessBox!.y).toBeLessThan(navBox!.y - 120)
    expect(stripeBox!.y).toBeLessThan(navBox!.y - 120)
})

test("profile keeps Stripe onboarding failures visible with retry and refresh", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    await mockProfileNetwork(page)

    let onboardAttempts = 0
    await page.route("**/api/stripe/connect/onboard", async (route) => {
        onboardAttempts += 1
        await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Stripe onboarding temporarily unavailable." }),
        })
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/profile#stripe-connect")

    const stripeConnect = page.getByTestId("stripe-connect-card")
    await expect(stripeConnect).toBeVisible()
    await page.getByTestId("profile-stripe-connect-action").click()

    const stripeIssue = page.getByTestId("profile-stripe-connect-issue")
    await expect(stripeIssue).toBeVisible()
    await expect(stripeIssue).toContainText("Stripe setup could not start")
    await expect(stripeIssue).toContainText("Stripe onboarding temporarily unavailable.")
    await expect(page.getByTestId("profile-stripe-connect-retry-action")).toContainText("Retry Stripe")
    await expect(page.getByTestId("profile-stripe-connect-refresh-action")).toContainText("Refresh status")
    expect(onboardAttempts).toBe(1)

    await page.getByTestId("profile-stripe-connect-retry-action").click()
    await expect(stripeIssue).toBeVisible()
    await expect.poll(() => onboardAttempts).toBe(2)

    await page.getByTestId("profile-stripe-connect-refresh-action").click()
    await expect(stripeIssue).toHaveCount(0)
})

test("profile keeps Stripe dashboard failures visible with retry and refresh", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    await mockProfileNetwork(page, {
        stripeConnectStatus: {
            connected: true,
            accountId: "acct_profile_dashboard_failure",
            detailsSubmitted: true,
            chargesEnabled: true,
            payoutsEnabled: true,
        },
    })

    let dashboardAttempts = 0
    await page.route("**/api/stripe/connect/dashboard-link", async (route) => {
        dashboardAttempts += 1
        await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Stripe dashboard links are temporarily unavailable." }),
        })
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/profile#stripe-connect")

    const stripeConnect = page.getByTestId("stripe-connect-card")
    await expect(stripeConnect).toBeVisible()
    await expect(stripeConnect).toContainText("Connected and ready to accept card payments.")
    await page.getByTestId("profile-stripe-dashboard-action").click()

    const stripeIssue = page.getByTestId("profile-stripe-connect-issue")
    await expect(stripeIssue).toBeVisible()
    await expect(stripeIssue).toContainText("Stripe dashboard could not open")
    await expect(stripeIssue).toContainText("Stripe dashboard links are temporarily unavailable.")
    await expect(page.getByTestId("profile-stripe-dashboard-retry-action")).toContainText("Retry dashboard")
    await expect(page.getByTestId("profile-stripe-connect-refresh-action")).toContainText("Refresh status")
    expect(dashboardAttempts).toBe(1)

    await page.getByTestId("profile-stripe-dashboard-retry-action").click()
    await expect(stripeIssue).toBeVisible()
    await expect.poll(() => dashboardAttempts).toBe(2)

    await page.getByTestId("profile-stripe-connect-refresh-action").click()
    await expect(stripeIssue).toHaveCount(0)
})

test("profile price list and payment controls are reachable on mobile", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    await mockProfileNetwork(page)

    await page.setViewportSize({ width: 390, height: 844 })
    await seedProfilePriceList(page)
    await page.goto("/profile")

    const priceItem = page.getByText("Panel Diagnostic")
    await expect(priceItem).toBeVisible()
    await priceItem.scrollIntoViewIfNeeded()

    await expectTouchTarget(page.getByRole("button", { name: "Edit Panel Diagnostic" }))
    await expectTouchTarget(page.getByRole("button", { name: "Delete Panel Diagnostic" }))
    await expect(page.getByLabel("Business Logo")).toBeVisible()
    await expect(page.getByLabel("Estimate Template Background")).toBeVisible()
    await expect(page.getByRole("button", { name: "Open Stripe dashboard" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Refresh Stripe status" })).toBeVisible()
})

test("profile mobile keeps long price list entries readable", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    await mockProfileNetwork(page)

    await page.setViewportSize({ width: 390, height: 844 })
    await seedProfilePriceList(page, {
        id: "profile-long-commercial-service",
        name: "Commercial Emergency Diagnostic And After Hours Dispatch Coordination",
        price: 485,
        unit: "visit",
        category: "SERVICE",
        keywords: [
            "commercial-emergency-diagnostic-after-hours",
            "dispatch-coordination",
            "panel-troubleshooting",
        ],
    })
    await page.goto("/profile")

    const priceList = page.getByTestId("price-list-card")
    const longItem = page.getByText("Commercial Emergency Diagnostic", { exact: false })
    await longItem.scrollIntoViewIfNeeded()
    await expect(longItem).toBeVisible()
    await expect(priceList).toContainText("commercial-emergency-diagnostic-after-hours")

    const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    const longItemFits = await longItem.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    const priceListBox = await priceList.boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()
    const editButtonBox = await page.getByRole("button", { name: "Edit Commercial Emergency Diagnostic And After Hours Dispatch Coordination" }).boundingBox()
    const deleteButtonBox = await page.getByRole("button", { name: "Delete Commercial Emergency Diagnostic And After Hours Dispatch Coordination" }).boundingBox()

    expect(pageFits).toBe(true)
    expect(longItemFits).toBe(true)
    expect(priceListBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(editButtonBox).not.toBeNull()
    expect(deleteButtonBox).not.toBeNull()
    expect(priceListBox!.y + priceListBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
    expect(editButtonBox!.height).toBeGreaterThanOrEqual(44)
    expect(deleteButtonBox!.height).toBeGreaterThanOrEqual(44)
})

test("profile image remove controls are reachable on mobile", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    await mockProfileNetwork(page, {
        logoUrl: tinyProfileImageDataUrl,
        estimateTemplateUrl: tinyProfileImageDataUrl,
        planTier: "team",
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/profile")

    const removeLogoButton = page.getByRole("button", { name: "Remove business logo" })
    const removeTemplateButton = page.getByRole("button", { name: "Remove estimate template background" })

    await expect(removeLogoButton).toBeVisible()
    await expect(removeTemplateButton).toBeVisible()
    await expectTouchTarget(removeLogoButton)
    await expectTouchTarget(removeTemplateButton)

    await removeLogoButton.click()
    await expect(removeLogoButton).toHaveCount(0)
    await removeTemplateButton.click()
    await expect(removeTemplateButton).toHaveCount(0)
})

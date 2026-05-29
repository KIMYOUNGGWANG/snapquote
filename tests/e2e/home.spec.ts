import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local", quiet: true })

const tinySetupLogoPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
)

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

async function seedQuickQuotePriceList(page: Page, item = {
    id: "quick-panel-diagnostic",
    name: "Panel Diagnostic",
    price: 180,
    unit: "ea",
    category: "SERVICE",
    keywords: ["panel", "diagnostic"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 5,
}) {
    await page.evaluate(async (priceListItem) => {
        const request = indexedDB.open("snapquote-db", 6)

        await new Promise<void>((resolve, reject) => {
            request.onupgradeneeded = () => {
                const db = request.result
                if (!db.objectStoreNames.contains("estimates")) {
                    const store = db.createObjectStore("estimates", { keyPath: "id" })
                    store.createIndex("by-date", "createdAt")
                    store.createIndex("by-status", "status")
                }
                if (!db.objectStoreNames.contains("photos")) {
                    const store = db.createObjectStore("photos", { keyPath: "id" })
                    store.createIndex("by-estimate", "estimateId")
                }
                if (!db.objectStoreNames.contains("pendingAudio")) {
                    const store = db.createObjectStore("pendingAudio", { keyPath: "id" })
                    store.createIndex("by-date", "createdAt")
                    store.createIndex("by-processed", "processed")
                }
                if (!db.objectStoreNames.contains("priceList")) {
                    const store = db.createObjectStore("priceList", { keyPath: "id" })
                    store.createIndex("by-category", "category")
                    store.createIndex("by-name", "name")
                }
                if (!db.objectStoreNames.contains("receipts")) {
                    const store = db.createObjectStore("receipts", { keyPath: "id" })
                    store.createIndex("by-date", "date")
                }
                if (!db.objectStoreNames.contains("timeEntries")) {
                    const store = db.createObjectStore("timeEntries", { keyPath: "id" })
                    store.createIndex("by-date", "date")
                }
                if (!db.objectStoreNames.contains("clients")) {
                    const store = db.createObjectStore("clients", { keyPath: "id" })
                    store.createIndex("by-name", "name")
                }
            }
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve()
        })

        const db = request.result
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction("priceList", "readwrite")
            transaction.objectStore("priceList").put(priceListItem)
            transaction.oncomplete = () => {
                db.close()
                resolve()
            }
            transaction.onerror = () => reject(transaction.error)
        })
    }, item)
}

async function seedHomeDraft(page: Page) {
    await page.evaluate(async () => {
        const request = indexedDB.open("snapquote-db", 6)

        await new Promise<void>((resolve, reject) => {
            request.onupgradeneeded = () => {
                const db = request.result
                if (!db.objectStoreNames.contains("estimates")) {
                    const store = db.createObjectStore("estimates", { keyPath: "id" })
                    store.createIndex("by-date", "createdAt")
                    store.createIndex("by-status", "status")
                }
                if (!db.objectStoreNames.contains("photos")) {
                    const store = db.createObjectStore("photos", { keyPath: "id" })
                    store.createIndex("by-estimate", "estimateId")
                }
                if (!db.objectStoreNames.contains("pendingAudio")) {
                    const store = db.createObjectStore("pendingAudio", { keyPath: "id" })
                    store.createIndex("by-date", "createdAt")
                    store.createIndex("by-processed", "processed")
                }
                if (!db.objectStoreNames.contains("priceList")) {
                    const store = db.createObjectStore("priceList", { keyPath: "id" })
                    store.createIndex("by-category", "category")
                    store.createIndex("by-name", "name")
                }
                if (!db.objectStoreNames.contains("receipts")) {
                    const store = db.createObjectStore("receipts", { keyPath: "id" })
                    store.createIndex("by-date", "date")
                }
                if (!db.objectStoreNames.contains("timeEntries")) {
                    const store = db.createObjectStore("timeEntries", { keyPath: "id" })
                    store.createIndex("by-date", "date")
                }
                if (!db.objectStoreNames.contains("clients")) {
                    const store = db.createObjectStore("clients", { keyPath: "id" })
                    store.createIndex("by-name", "name")
                }
            }
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve()
        })

        const now = new Date().toISOString()
        const db = request.result
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction("estimates", "readwrite")
            transaction.objectStore("estimates").put({
                id: "home-draft-active",
                estimateNumber: "EST-HOME-001",
                clientName: "Home Queue Customer",
                clientAddress: "42 Field Ave",
                summary_note: "Panel repair and labeled circuits.",
                taxRate: 0,
                taxAmount: 0,
                totalAmount: 2100,
                status: "draft",
                synced: false,
                createdAt: now,
                updatedAt: now,
                items: [
                    {
                        id: "home-draft-item-1",
                        itemNumber: 1,
                        category: "LABOR",
                        description: "Panel repair labor",
                        quantity: 1,
                        unit: "LS",
                        unit_price: 0,
                        total: 0,
                    },
                    {
                        id: "home-draft-item-2",
                        itemNumber: 2,
                        category: "PARTS",
                        description: "Breaker kit",
                        quantity: 1,
                        unit: "ea",
                        unit_price: 2100,
                        total: 2100,
                    },
                ],
            })
            transaction.oncomplete = () => {
                db.close()
                resolve()
            }
            transaction.onerror = () => reject(transaction.error)
        })

        window.dispatchEvent(new CustomEvent("snapquote:offline-queue-changed"))
    })
}

async function seedHomeFollowUp(page: Page) {
    await page.evaluate(async () => {
        const request = indexedDB.open("snapquote-db", 6)

        await new Promise<void>((resolve, reject) => {
            request.onupgradeneeded = () => {
                const db = request.result
                if (!db.objectStoreNames.contains("estimates")) {
                    const store = db.createObjectStore("estimates", { keyPath: "id" })
                    store.createIndex("by-date", "createdAt")
                    store.createIndex("by-status", "status")
                }
                if (!db.objectStoreNames.contains("photos")) {
                    const store = db.createObjectStore("photos", { keyPath: "id" })
                    store.createIndex("by-estimate", "estimateId")
                }
                if (!db.objectStoreNames.contains("pendingAudio")) {
                    const store = db.createObjectStore("pendingAudio", { keyPath: "id" })
                    store.createIndex("by-date", "createdAt")
                    store.createIndex("by-processed", "processed")
                }
                if (!db.objectStoreNames.contains("priceList")) {
                    const store = db.createObjectStore("priceList", { keyPath: "id" })
                    store.createIndex("by-category", "category")
                    store.createIndex("by-name", "name")
                }
                if (!db.objectStoreNames.contains("receipts")) {
                    const store = db.createObjectStore("receipts", { keyPath: "id" })
                    store.createIndex("by-date", "date")
                }
                if (!db.objectStoreNames.contains("timeEntries")) {
                    const store = db.createObjectStore("timeEntries", { keyPath: "id" })
                    store.createIndex("by-date", "date")
                }
                if (!db.objectStoreNames.contains("clients")) {
                    const store = db.createObjectStore("clients", { keyPath: "id" })
                    store.createIndex("by-name", "name")
                }
            }
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve()
        })

        const sentAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
        const db = request.result
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction("estimates", "readwrite")
            transaction.objectStore("estimates").put({
                id: "home-follow-up-sent",
                estimateNumber: "EST-FOLLOW-001",
                clientName: "Follow Up Customer",
                clientAddress: "12 Reminder Rd",
                summary_note: "Sent estimate needing follow-up.",
                taxRate: 0,
                taxAmount: 0,
                totalAmount: 950,
                status: "sent",
                synced: true,
                createdAt: sentAt,
                updatedAt: sentAt,
                items: [
                    {
                        id: "home-follow-up-item-1",
                        itemNumber: 1,
                        category: "SERVICE",
                        description: "Follow-up service",
                        quantity: 1,
                        unit: "LS",
                        unit_price: 950,
                        total: 950,
                    },
                ],
            })
            transaction.oncomplete = () => {
                db.close()
                resolve()
            }
            transaction.onerror = () => reject(transaction.error)
        })
    })
}

async function openMoreMenu(page: Page) {
    const moreButton = page.getByTestId("bottom-nav-more")
    const menuDialog = page.getByTestId("more-menu-dialog")

    await expect(moreButton).toBeVisible()

    for (let attempt = 0; attempt < 3; attempt += 1) {
        await moreButton.click()
        try {
            await expect(menuDialog).toBeVisible({ timeout: 1_500 })
            return menuDialog
        } catch {
            await page.waitForTimeout(150)
        }
    }

    await expect(menuDialog).toBeVisible()
    return menuDialog
}

async function expectTouchTarget(locator: Locator) {
    const box = await locator.boundingBox()

    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
}

test("signed-out home pushes visitors into either the workflow tour or free trial", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(() => {
        window.localStorage.setItem("snapquote_onboarding_completed", "true")
    })

    await page.goto("/")

    await expect(page.getByRole("heading", { name: /quote the job before you drive off/i })).toBeVisible()
    await expect(page.getByTestId("home-offline-status")).toContainText("Offline ready")
    await expect(page.getByTestId("home-auth-link")).toBeVisible()
    await expect(page.getByTestId("home-signed-out-workflow")).toBeVisible()
    await expect(page.getByTestId("home-empty-drafts")).toContainText("No local drafts yet")
    await expect(page.getByTestId("home-empty-drafts")).toContainText("Saved drafts will appear here")
    await expect(page.getByTestId("home-empty-drafts-action")).toHaveAttribute("href", "/new-estimate?capture=type")
    await expect(page.getByTestId("home-sample-draft")).toHaveCount(0)
    const heroTitleFits = await page.getByTestId("home-hero-title").evaluate((element) => {
        return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
    })
    await expect(page.getByTestId("home-try-free-cta")).toBeVisible()

    const headerAuthBox = await page.getByTestId("home-auth-link").boundingBox()
    const brandBox = await page.getByLabel("SnapQuote home").boundingBox()
    const tourBox = await page.getByTestId("home-primary-marketing-cta").boundingBox()
    const pricingBox = await page.getByTestId("home-pricing-link").boundingBox()
    const emptyDraftBox = await page.getByTestId("home-empty-drafts").boundingBox()
    const emptyDraftActionBox = await page.getByTestId("home-empty-drafts-action").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()
    expect(headerAuthBox).not.toBeNull()
    expect(brandBox).not.toBeNull()
    expect(tourBox).not.toBeNull()
    expect(pricingBox).not.toBeNull()
    expect(emptyDraftBox).not.toBeNull()
    expect(emptyDraftActionBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(heroTitleFits).toBe(true)
    expect(headerAuthBox!.height).toBeGreaterThanOrEqual(44)
    expect(brandBox!.height).toBeGreaterThanOrEqual(44)
    expect(tourBox!.height).toBeGreaterThanOrEqual(44)
    expect(pricingBox!.height).toBeGreaterThanOrEqual(44)
    expect(emptyDraftActionBox!.height).toBeGreaterThanOrEqual(40)
    expect(headerAuthBox!.x + headerAuthBox!.width).toBeLessThanOrEqual(390 - 16)
    expect(emptyDraftBox!.y + emptyDraftBox!.height).toBeLessThanOrEqual(navBox!.y - 8)

    await page.getByTestId("home-primary-marketing-cta").click()
    await expect(page).toHaveURL(/\/landing$/)
})

test("desktop home uses the wide workspace for capture and draft context", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.addInitScript(() => {
        window.localStorage.setItem("snapquote_onboarding_completed", "true")
    })

    await page.goto("/")

    const workspaceBox = await page.getByTestId("home-workspace").boundingBox()
    const commandCenterBox = await page.getByTestId("home-command-center").boundingBox()
    const signedOutWorkflowBox = await page.getByTestId("home-signed-out-workflow").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(workspaceBox).not.toBeNull()
    expect(commandCenterBox).not.toBeNull()
    expect(signedOutWorkflowBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(workspaceBox!.width).toBeGreaterThan(800)
    expect(commandCenterBox!.x + commandCenterBox!.width).toBeLessThanOrEqual(signedOutWorkflowBox!.x - 12)
    expect(Math.abs(commandCenterBox!.y - signedOutWorkflowBox!.y)).toBeLessThanOrEqual(4)
    expect(commandCenterBox!.y + commandCenterBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
    expect(signedOutWorkflowBox!.y + signedOutWorkflowBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("home surfaces real local drafts instead of the empty draft prompt", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(() => {
        window.localStorage.setItem("snapquote_onboarding_completed", "true")
    })

    await page.goto("/")
    await seedHomeDraft(page)

    const draftQueue = page.getByTestId("home-draft-queue")
    await expect(draftQueue).toBeVisible()
    await expect(draftQueue).toContainText("Next quote to finish")
    await expect(page.getByTestId("home-draft-next-title")).toHaveText("Home Queue Customer")
    await expect(page.getByTestId("home-draft-value")).toHaveText("$2,100")
    await expect(page.getByTestId("home-draft-needs-pricing")).toHaveText("1 price")
    await expect(page.getByTestId("home-draft-edit-action")).toHaveAttribute("href", "/new-estimate?draftId=home-draft-active")
    await expect(page.getByTestId("home-draft-edit-action")).toContainText("Finish pricing")
    await expect(page.getByTestId("home-draft-workbench-action")).toHaveAttribute("href", "/drafts")
    await expect(page.getByTestId("sync-status-button")).toHaveCount(0)
    await expect(page.getByTestId("home-primary-marketing-cta")).toHaveCount(0)
    await expect(page.getByTestId("home-signed-out-workflow")).toHaveCount(0)

    const draftBox = await draftQueue.boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()
    expect(draftBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(draftBox!.y + draftBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("signed-in home follow-up action remains reachable on mobile", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedAuthenticatedSupabaseSession(context)
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
    await page.route("**/rest/v1/profiles**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ business_name: "Follow Up Electric" }),
        })
    })
    await page.route("**/api/stripe/connect/status", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ connected: true, detailsSubmitted: true, chargesEnabled: true }),
        })
    })

    await page.goto("/")
    await seedHomeFollowUp(page)
    await page.reload()

    await expect(page.getByText("Follow Up Needed")).toBeVisible()
    await expect(page.getByText("Follow Up Customer")).toBeVisible()
    await expectTouchTarget(page.getByRole("button", { name: "Copy Message" }))
})

test("desktop signed-in home uses a wide operations dashboard", async ({ page, context }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await seedAuthenticatedSupabaseSession(context)
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
    await page.route("**/rest/v1/profiles**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ business_name: "Wide Ops Electric" }),
        })
    })
    await page.route("**/api/stripe/connect/status", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ connected: true, detailsSubmitted: true, chargesEnabled: true }),
        })
    })
    await page.route("**/api/analytics/funnel", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                draft_saved: 12,
                quote_sent: 8,
                payment_link_created: 5,
                payment_completed: 3,
                send_rate: 67,
                payment_rate: 38,
            }),
        })
    })
    await page.route("**/api/billing/usage", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                planTier: "pro",
                periodStart: "2026-05-01T00:00:00.000Z",
                usage: { generate: 7, transcribe: 3, send_email: 4 },
                limits: { generate: 100, transcribe: 100, send_email: 100 },
                remaining: { generate: 93, transcribe: 97, send_email: 96 },
                usageRatePct: { generate: 7, transcribe: 3, send_email: 4 },
                openaiPromptTokens: 1200,
                openaiCompletionTokens: 400,
                estimatedCosts: { openai: 0.12, resend: 0.04, total: 0.16 },
            }),
        })
    })

    await page.goto("/")
    await seedQuickQuotePriceList(page)
    await page.reload()

    await expect(page.getByTestId("home-signed-in-dashboard")).toBeVisible()
    await expect(page.getByTestId("home-quick-items-section")).toBeVisible()
    await expect(page.getByText("Conversion Funnel (30d)")).toBeVisible()
    await expect(page.getByText("Plan & Usage")).toBeVisible()
    await expect(page.getByRole("button", { name: /Panel Diagnostic/ })).toBeVisible()

    const dashboardBox = await page.getByTestId("home-signed-in-dashboard").boundingBox()
    const overviewBox = await page.getByTestId("home-overview-section").boundingBox()
    const healthBox = await page.getByTestId("home-health-section").boundingBox()
    const quickItemsBox = await page.getByTestId("home-quick-items-section").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(dashboardBox).not.toBeNull()
    expect(overviewBox).not.toBeNull()
    expect(healthBox).not.toBeNull()
    expect(quickItemsBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(dashboardBox!.width).toBeGreaterThan(800)
    expect(overviewBox!.x + overviewBox!.width).toBeLessThanOrEqual(healthBox!.x - 12)
    expect(Math.abs(overviewBox!.y - healthBox!.y)).toBeLessThanOrEqual(4)
    expect(quickItemsBox!.x).toBeGreaterThanOrEqual(overviewBox!.x)
    expect(quickItemsBox!.x + quickItemsBox!.width).toBeLessThanOrEqual(overviewBox!.x + overviewBox!.width)
    expect(quickItemsBox!.y + quickItemsBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("first-login setup wizard offers a practice quote before full setup", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)

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
    await page.route("**/rest/v1/profiles**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                business_name: null,
                default_tax_rate: null,
                logo_url: null,
            }),
        })
    })

    await page.goto("/")

    await expect(page.getByTestId("setup-wizard-step-1")).toBeVisible()
    const readinessCard = page.getByTestId("setup-first-quote-readiness")
    await expect(readinessCard).toContainText("First quote readiness")
    await expect(readinessCard).toContainText("Needs setup")
    await expect(readinessCard).toContainText("Can wait")

    await page.getByTestId("setup-business-name-input").fill("Composer Electric")
    await expect(readinessCard).toContainText("Ready")

    await page.getByTestId("setup-demo-quote-action").click()
    await expect(page).toHaveURL(/\/new-estimate\?tutorial=1$/)
    await expect(page.getByTestId("demo-tutorial-banner")).toBeVisible()
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
})

test("first-login setup wizard carries a starter kit into the quote handoff", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)

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
    await page.route("**/rest/v1/profiles**", async (route) => {
        if (route.request().method() === "GET") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    business_name: null,
                    default_tax_rate: null,
                    logo_url: null,
                }),
            })
            return
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([]),
        })
    })

    await page.goto("/")
    await page.getByTestId("setup-business-name-input").fill("Composer Electric")
    await page.getByTestId("setup-continue-action").click()

    await expect(page.getByTestId("setup-wizard-step-2")).toBeVisible()
    await page.getByLabel("Business logo").setInputFiles({
        name: "setup-logo.png",
        mimeType: "image/png",
        buffer: tinySetupLogoPng,
    })
    await expect(page.getByAltText("Business logo preview")).toBeVisible()
    await expectTouchTarget(page.getByRole("button", { name: "Remove business logo preview" }))
    await page.getByRole("button", { name: "Remove business logo preview" }).click()
    await expect(page.getByAltText("Business logo preview")).toHaveCount(0)
    await page.getByTestId("setup-save-profile-action").click()

    await expect(page.getByTestId("setup-wizard-step-3")).toBeVisible()
    await page.getByTestId("setup-trade-electrician").click()
    await expect(page.getByTestId("setup-starter-preview")).toContainText("Electrician starter pack")
    await expect(page.getByTestId("setup-starter-preview")).toContainText("Breaker 15A")

    await page.getByTestId("setup-starter-item-name").fill("Emergency after-hours visit")
    await page.getByTestId("setup-starter-item-price").fill("225")
    await page.getByTestId("setup-save-starter-kit-action").click()

    await expect(page.getByTestId("setup-wizard-step-4")).toBeVisible()
    await expect(page.getByTestId("setup-final-demo-action")).toContainText("Open practice quote")

    await page.getByTestId("setup-final-demo-action").click()
    await expect(page).toHaveURL(/\/new-estimate\?tutorial=1$/)
    await expect(page.getByTestId("demo-tutorial-banner")).toBeVisible()
})

test("home capture shortcuts preserve the selected entry mode", async ({ page }) => {
    await page.addInitScript(() => {
        window.localStorage.setItem("snapquote_onboarding_completed", "true")
    })

    await page.goto("/")
    await expect(page.getByTestId("home-command-center")).toContainText("Start voice quote")
    await page.getByTestId("home-try-free-cta").click()
    await expect(page).toHaveURL(/\/new-estimate\?capture=voice$/)
    await expect(page.getByTestId("capture-intent-status")).toHaveText("Voice-first capture")
    await expect(page.getByTestId("voice-capture-action")).toHaveAttribute("aria-pressed", "true")

    await page.goto("/")
    await page.getByTestId("home-photo-cta").click()

    await expect(page).toHaveURL(/\/new-estimate\?capture=photos$/)
    await expect(page.getByTestId("capture-intent-status")).toHaveText("Photo-first capture")
    await expect(page.getByTestId("photo-capture-action")).toHaveAttribute("aria-pressed", "true")

    await page.goto("/")
    await page.getByTestId("home-type-cta").click()

    await expect(page).toHaveURL(/\/new-estimate\?capture=type$/)
    await expect(page.getByTestId("capture-intent-status")).toHaveText("Typed notes capture")
    await expect(page.getByTestId("job-description-input")).toBeFocused()
})

test("more menu restart tutorial opens the practice estimate", async ({ page }) => {
    await page.goto("/")

    await openMoreMenu(page)
    await page.getByTestId("more-menu-restart-tutorial").click()

    await expect(page).toHaveURL(/\/new-estimate\?tutorial=1$/)
    await expect(page.getByTestId("demo-tutorial-banner")).toBeVisible()
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
})

test("more menu exposes operational shortcuts and opens time tracking", async ({ page }) => {
    await page.goto("/")

    await openMoreMenu(page)

    const menuBox = await page.getByTestId("more-menu-dialog").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(menuBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(navBox!.y - 8)

    await expect(page.getByRole("link", { name: /Draft Workbench/ })).toBeVisible()
    await expect(page.getByRole("link", { name: /Clients/ })).toBeVisible()
    await expect(page.getByRole("link", { name: /History/ })).toBeVisible()
    await expect(page.getByRole("link", { name: /Time Tracking/ })).toBeVisible()
    await expect(page.getByRole("link", { name: /Team Workspace/ })).toBeVisible()
    await expect(page.getByRole("link", { name: /Upgrade \/ Billing/ })).toBeVisible()
    await expect(page.getByRole("link", { name: /Settings/ })).toBeVisible()
    await expectTouchTarget(page.getByRole("link", { name: /Sign In \/ Sign Up/ }))
    await expectTouchTarget(page.getByTestId("more-menu-feedback"))
    await expectTouchTarget(page.getByTestId("more-menu-restart-tutorial"))
    await expectTouchTarget(page.getByTestId("more-menu-theme-toggle"))

    await page.getByRole("link", { name: /Time Tracking/ }).click()
    await expect(page).toHaveURL(/\/time-tracking$/, { timeout: 30_000 })
    await expect(page.getByRole("heading", { name: "Time Tracking" })).toBeVisible()
    await expect(page.getByTestId("bottom-nav-more")).toHaveAttribute("aria-current", "page")
})

test("more menu prioritizes field work shortcuts on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/")

    await openMoreMenu(page)

    const menuDialog = page.getByTestId("more-menu-dialog")
    const draftLink = page.getByTestId("more-menu-drafts-link")
    const workShortcuts = page.getByTestId("more-menu-work-shortcuts")
    const accountCard = page.getByTestId("more-menu-account-card")
    const timeLink = page.getByTestId("more-menu-time-tracking-link")
    const adminShortcuts = page.getByTestId("more-menu-admin-shortcuts")

    await expect(menuDialog).toBeVisible()
    await expect(draftLink).toBeVisible()
    await expect(workShortcuts).toBeVisible()
    await expect(timeLink).toBeVisible()
    await expect(adminShortcuts).toBeVisible()
    await expect(draftLink).toContainText("Draft Workbench")
    await expect(timeLink).toContainText("Job hours")

    const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    const menuBox = await menuDialog.boundingBox()
    const draftBox = await draftLink.boundingBox()
    const workBox = await workShortcuts.boundingBox()
    const accountBox = await accountCard.boundingBox()
    const timeBox = await timeLink.boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(pageFits).toBe(true)
    expect(menuBox).not.toBeNull()
    expect(draftBox).not.toBeNull()
    expect(workBox).not.toBeNull()
    expect(accountBox).not.toBeNull()
    expect(timeBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
    expect(draftBox!.y).toBeLessThan(workBox!.y)
    expect(workBox!.y).toBeLessThan(accountBox!.y)
    expect(timeBox!.y + timeBox!.height).toBeLessThan(accountBox!.y)
    await expectTouchTarget(draftLink)
    await expectTouchTarget(timeLink)
})

test("more menu opens an accessible feedback dialog", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/")

    await openMoreMenu(page)
    await page.getByTestId("more-menu-feedback").click()

    await expect(page.getByTestId("more-menu-dialog")).toBeHidden()
    await expect(page.getByRole("dialog", { name: "Send Feedback" })).toBeVisible()
    await expect(page.getByText("Help us improve SnapQuote.")).toBeVisible()
    await expect(page.getByLabel("Feedback category")).toBeVisible()

    const threeStarRating = page.getByRole("radio", { name: "3 out of 5 stars" })
    await expectTouchTarget(threeStarRating)
    await threeStarRating.click()
    await expect(threeStarRating).toHaveAttribute("aria-checked", "true")
    await threeStarRating.press("ArrowRight")
    await expect(page.getByRole("radio", { name: "4 out of 5 stars" })).toHaveAttribute("aria-checked", "true")

    await expect(page.getByRole("button", { name: "Submit" })).toBeDisabled()
    await page.getByLabel("Message").fill("The field menu feedback path is easier to reach.")
    await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled()
})

test("more menu opens the dedicated draft workbench", async ({ page }) => {
    await page.goto("/")

    await openMoreMenu(page)

    await expect(page.getByTestId("more-menu-drafts-link")).toBeVisible()
    await page.getByTestId("more-menu-drafts-link").click()

    await expect(page).toHaveURL(/\/drafts$/, { timeout: 30_000 })
    await expect(page.getByTestId("drafts-page")).toBeVisible()
    await expect(page.getByTestId("bottom-nav-more")).toHaveAttribute("aria-current", "page")
})

test("quick quote keeps Stripe setup failure visible with recovery actions", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)

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
    await page.route("**/rest/v1/profiles**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ business_name: "Composer Electric" }),
        })
    })
    await page.route("**/api/stripe/connect/status", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ connected: false }),
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

    await page.goto("/")
    await seedQuickQuotePriceList(page)
    await page.reload()

    await expect(page.getByText("Quick Items")).toBeVisible()
    await page.getByRole("button", { name: /Panel Diagnostic/ }).click()

    await expect(page.getByRole("heading", { name: "Quick Quote" })).toBeVisible()
    await page.getByRole("button", { name: "Add Payment Link" }).click()

    const paymentIssue = page.getByTestId("quick-quote-payment-issue")
    await expect(paymentIssue).toBeVisible()
    await expect(paymentIssue).toContainText("Connect Stripe to get paid online")
    await expect(paymentIssue).toContainText("Open Profile, connect Stripe")
    await expect(page.getByTestId("quick-quote-profile-action")).toHaveAttribute("href", "/profile#stripe-connect")

    await page.getByTestId("quick-quote-retry-action").click()
    await expect(paymentIssue).toBeVisible()
    await expect(page.getByRole("button", { name: "Add Payment Link" })).toBeEnabled()
})

test("quick quote keeps long payment failures readable on narrow mobile", async ({ page, context }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await seedAuthenticatedSupabaseSession(context)

    const longItemName = "CommercialRoofDrainEmergencyRepairForNorthWarehouseLoadingDockWithNoSpaces"
    const longPaymentError = [
        "PAYMENT_PROVIDER_LINK_CREATION_FAILURE_FOR_FIELD_QUICK_QUOTE_WITH_LONG_REFERENCE",
        "Stripe returned an unexpected payment link setup error after the quick quote total was prepared.",
    ].join(" ")

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
    await page.route("**/rest/v1/profiles**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ business_name: "Composer Electric" }),
        })
    })
    await page.route("**/api/stripe/connect/status", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ connected: true, detailsSubmitted: true, chargesEnabled: true }),
        })
    })
    await page.route("**/api/create-payment-link", async (route) => {
        await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
                error: longPaymentError,
                code: "PAYMENT_LINK_PROVIDER_FAILURE",
            }),
        })
    })

    await page.goto("/")
    await seedQuickQuotePriceList(page, {
        id: "quick-long-payment-failure",
        name: longItemName,
        price: 1288.75,
        unit: "ea",
        category: "SPECIALTY-COMMERCIAL-ROOF-DRAIN-EMERGENCY",
        keywords: ["commercial", "roof", "drain"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: 2,
    })
    await page.reload()

    await expect(page.getByText("Quick Items")).toBeVisible()
    await page.getByRole("button", { name: /CommercialRoofDrainEmergency/ }).click()

    const dialog = page.getByRole("dialog", { name: "Quick Quote" })
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId("quick-quote-item-name")).toContainText("CommercialRoofDrainEmergency")

    const itemNameFits = await page.getByTestId("quick-quote-item-name").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    const footerBox = await page.getByTestId("quick-quote-modal-footer").boundingBox()
    const addPaymentButtonBox = await dialog.getByRole("button", { name: "Add Payment Link" }).boundingBox()
    const dialogFits = await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    expect(itemNameFits).toBe(true)
    expect(footerBox).not.toBeNull()
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(700)
    expect(addPaymentButtonBox).not.toBeNull()
    expect(addPaymentButtonBox!.height).toBeGreaterThanOrEqual(44)
    expect(dialogFits).toBe(true)

    await dialog.getByRole("button", { name: "Add Payment Link" }).click()

    const paymentIssue = page.getByTestId("quick-quote-payment-issue")
    const paymentIssueMessage = page.getByTestId("quick-quote-payment-issue-message")
    await expect(paymentIssue).toBeVisible()
    await expect(paymentIssueMessage).toContainText("PAYMENT_PROVIDER_LINK_CREATION_FAILURE")
    await expect(page.getByTestId("quick-quote-profile-action")).toHaveCount(0)
    await expect(page.getByTestId("toast-message")).toHaveCount(0)

    const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    const issueFits = await paymentIssue.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    const messageFits = await paymentIssueMessage.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    const retryButtonBox = await page.getByTestId("quick-quote-retry-action").boundingBox()
    expect(pageFits).toBe(true)
    expect(issueFits).toBe(true)
    expect(messageFits).toBe(true)
    expect(retryButtonBox).not.toBeNull()
    expect(retryButtonBox!.height).toBeGreaterThanOrEqual(44)
    await expect.poll(async () => {
        const issueBox = await paymentIssue.boundingBox()
        const latestFooterBox = await page.getByTestId("quick-quote-modal-footer").boundingBox()

        return Boolean(issueBox && latestFooterBox && issueBox.y + issueBox.height <= latestFooterBox.y + 1)
    }).toBe(true)
})

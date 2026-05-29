import { expect, test, type Locator, type Page } from "@playwright/test"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local", quiet: true })

const tinySitePhotoPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
)

async function expectTouchTarget(locator: Locator) {
    const box = await locator.boundingBox()

    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
}

async function expectVisibleActionLabel(locator: Locator) {
    const box = await locator.boundingBox()
    const fits = await locator.evaluate((element) => element.scrollWidth <= element.clientWidth)

    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(24)
    expect(box!.height).toBeGreaterThanOrEqual(14)
    expect(fits).toBe(true)
}

async function readStoredEstimateApprovals(page: Page) {
    return page.evaluate(async () => {
        type StoredEstimateApproval = {
            clientName?: string
            clientSignature?: string
            sentAt?: string
            signedAt?: string
            status?: string
        }

        function requestToPromise<T>(request: IDBRequest<T>) {
            return new Promise<T>((resolve, reject) => {
                request.onerror = () => reject(request.error)
                request.onsuccess = () => resolve(request.result)
            })
        }

        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("snapquote-db")
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })

        const transaction = database.transaction("estimates", "readonly")
        const estimates = await requestToPromise<StoredEstimateApproval[]>(
            transaction.objectStore("estimates").getAll()
        )
        database.close()
        return estimates
    })
}

function getSupabaseAuthStorageKey() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co"
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0]
    return `sb-${projectRef}-auth-token`
}

async function seedAuthenticatedSupabaseSession(page: Page) {
    await page.evaluate(({ storageKey }) => {
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

async function mockSignedInBilling(page: Page, planTier: "free" | "starter" | "pro" | "team" = "pro") {
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

    await page.route("**/api/billing/usage", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                planTier,
                periodStart: "2026-05-01T00:00:00.000Z",
                usage: { generate: 0, transcribe: 0, send_email: 0 },
                limits: { generate: 100, transcribe: 100, send_email: 100 },
                remaining: { generate: 100, transcribe: 100, send_email: 100 },
                usageRatePct: { generate: 0, transcribe: 0, send_email: 0 },
                openaiPromptTokens: 0,
                openaiCompletionTokens: 0,
                estimatedCosts: { openai: 0, resend: 0, total: 0 },
            }),
        })
    })
}

async function mockGeneratedEstimate(page: Page) {
    await page.route("**/api/generate", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                items: [
                    {
                        id: "item-1",
                        itemNumber: 1,
                        category: "PARTS",
                        description: "Replace shower cartridge",
                        quantity: 1,
                        unit: "ea",
                        unit_price: 120,
                        total: 120,
                    },
                    {
                        id: "item-2",
                        itemNumber: 2,
                        category: "LABOR",
                        description: "Remove trim, install new cartridge, and test",
                        quantity: 1,
                        unit: "LS",
                        unit_price: 60,
                        total: 60,
                    },
                ],
                summary_note: "Includes cleanup and functional test before departure.",
                payment_terms: "Due on approval.",
                closing_note: "Thank you for the opportunity.",
                warnings: [],
            }),
        })
    })
}

test("field capture input enables generation and renders a generated draft", async ({ page }) => {
    await mockGeneratedEstimate(page)

    await page.goto("/new-estimate")
    await page.getByTestId("job-description-input").fill(
        "Replace leaking shower cartridge, test valve operation, and clean the work area."
    )

    await expect(page.getByTestId("generate-estimate-button")).toBeEnabled()
    await page.getByTestId("generate-estimate-button").click()

    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("line-item-description-0")).toHaveValue("Replace shower cartridge")
})

test("mobile voice capture puts recording before notes and clear of bottom navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(() => {
        class MockMediaRecorder extends EventTarget {
            ondataavailable: ((event: BlobEvent) => void) | null = null
            onstop: (() => void) | null = null

            start() {}

            stop() {
                const data = new Blob(["voice note"], { type: "audio/webm" })
                this.ondataavailable?.({ data } as BlobEvent)
                this.onstop?.()
            }
        }

        class MockAudioContext {
            createMediaStreamSource() {
                return { connect: () => undefined }
            }

            createAnalyser() {
                return {
                    fftSize: 64,
                    frequencyBinCount: 32,
                    getByteFrequencyData: (array: Uint8Array) => array.fill(8),
                }
            }

            close() {
                return Promise.resolve()
            }
        }

        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: {
                getUserMedia: async () => ({
                    getTracks: () => [{ stop: () => undefined }],
                }),
            },
        })
        Object.defineProperty(window, "MediaRecorder", { configurable: true, value: MockMediaRecorder })
        Object.defineProperty(window, "AudioContext", { configurable: true, value: MockAudioContext })
        Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: MockAudioContext })
    })
    await page.route("**/api/transcribe", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 250))
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ text: "Replace leaking shower cartridge and test valve operation." }),
        })
    })
    await page.goto("/new-estimate")

    const captureSwitcherBox = await page.getByTestId("capture-switcher").boundingBox()
    const notesBox = await page.getByTestId("job-description-input").boundingBox()
    const recordButtonBox = await page.getByRole("button", { name: "Record voice note" }).boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()
    const addClientButtonBox = await page.getByTestId("input-add-client-details-button").boundingBox()
    const loadClientButtonBox = await page.getByTestId("input-load-client-button").boundingBox()
    const collapsedClientBox = await page.getByTestId("input-client-details-collapsed").boundingBox()
    const captureSettingsSummaryBox = await page.getByTestId("input-capture-settings-summary").boundingBox()
    const collapsedClientDescriptionFits = await page.getByTestId("input-client-details-collapsed-description").evaluate((element) => {
        return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
    })

    expect(captureSwitcherBox).not.toBeNull()
    expect(notesBox).not.toBeNull()
    expect(recordButtonBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(addClientButtonBox).not.toBeNull()
    expect(loadClientButtonBox).not.toBeNull()
    expect(collapsedClientBox).not.toBeNull()
    expect(captureSettingsSummaryBox).not.toBeNull()
    expect(collapsedClientDescriptionFits).toBe(true)
    expect(addClientButtonBox!.height).toBeGreaterThanOrEqual(44)
    expect(loadClientButtonBox!.height).toBeGreaterThanOrEqual(44)
    expect(captureSwitcherBox!.y + captureSwitcherBox!.height).toBeLessThanOrEqual(recordButtonBox!.y - 8)
    expect(recordButtonBox!.y + recordButtonBox!.height).toBeLessThanOrEqual(notesBox!.y - 8)
    expect(notesBox!.y + notesBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
    expect(collapsedClientBox!.y + collapsedClientBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
    expect(captureSettingsSummaryBox!.y).toBeGreaterThanOrEqual(navBox!.y + navBox!.height)
    const recordButton = page.getByRole("button", { name: "Record voice note" })
    await expect(recordButton).toBeVisible()
    await expectTouchTarget(recordButton)

    await recordButton.click()
    const stopButton = page.getByRole("button", { name: "Stop recording voice note" })
    await expect(stopButton).toBeVisible()
    await expectTouchTarget(stopButton)
    await stopButton.click()
    await expect(page.getByText("Processing Audio...")).toBeVisible()
    await page.goto("/new-estimate")

    await page.getByTestId("input-capture-settings-summary").scrollIntoViewIfNeeded()
    const visibleCaptureSettingsSummaryBox = await page.getByTestId("input-capture-settings-summary").boundingBox()
    expect(visibleCaptureSettingsSummaryBox).not.toBeNull()
    expect(visibleCaptureSettingsSummaryBox!.height).toBeGreaterThanOrEqual(44)

    await page.getByTestId("type-capture-action").click()
    await expect(page).toHaveURL(/\/new-estimate\?capture=type$/)
    await expect(page.getByTestId("type-capture-action")).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByRole("button", { name: "Record voice note" })).toHaveCount(0)
    await expect(page.getByTestId("job-description-input")).toBeFocused()
})

test("desktop composer uses the available shell width and keeps generate controls visible", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto("/new-estimate")

    const capturePanelBox = await page.getByTestId("input-capture-panel").boundingBox()
    const workflowPanelBox = await page.getByTestId("input-workflow-panel").boundingBox()
    const generateButtonBox = await page.getByTestId("generate-estimate-button").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    await expect(page.getByTestId("input-readiness-card")).toBeVisible()
    await expect(page.getByTestId("input-readiness-scope-status")).toHaveText("Record or type scope")
    await expect(page.getByTestId("input-readiness-client-status")).toHaveText("Client later")
    await expect(page.getByTestId("input-readiness-delivery-status")).toHaveText("Before sending")
    expect(capturePanelBox).not.toBeNull()
    expect(workflowPanelBox).not.toBeNull()
    expect(generateButtonBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(capturePanelBox!.width + workflowPanelBox!.width).toBeGreaterThan(800)
    expect(capturePanelBox!.x + capturePanelBox!.width).toBeLessThanOrEqual(workflowPanelBox!.x - 12)
    expect(Math.abs(capturePanelBox!.y - workflowPanelBox!.y)).toBeLessThanOrEqual(8)
    expect(generateButtonBox!.y + generateButtonBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("typed capture shows disabled quick generate guidance before the bottom navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")

    const emptyState = page.getByTestId("quick-generate-empty-state")
    await expect(emptyState).toBeVisible()
    await expect(page.getByTestId("quick-generate-disabled-button")).toBeDisabled()
    await expect(page.getByTestId("generate-estimate-button")).toHaveText("Add scope first")
    await expect(page.getByRole("button", { name: "Record voice note" })).toHaveCount(0)
    await expect(page.getByTestId("voice-capture-action")).toBeVisible()
    await expect(page.getByTestId("type-capture-action")).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByTestId("type-capture-action")).toContainText("Type")
    await expect(page.getByTestId("capture-switcher")).not.toContainText("Manual")
    await expect(page.getByTestId("input-client-details-collapsed")).toBeVisible()
    await expect(page.getByTestId("input-client-details-fields")).toHaveCount(0)

    const emptyBox = await emptyState.boundingBox()
    const collapsedClientBox = await page.getByTestId("input-client-details-collapsed").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(emptyBox).not.toBeNull()
    expect(collapsedClientBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(emptyBox!.y + emptyBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
    expect(collapsedClientBox!.y + collapsedClientBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("photo capture previews attachments with a reachable remove control", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=photos")

    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByTestId("photo-capture-action").click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles({
        name: "site-photo.png",
        mimeType: "image/png",
        buffer: tinySitePhotoPng,
    })

    await expect(page.getByAltText("Site photo 1")).toBeVisible()
    await expect(page.getByTestId("quick-generate-button")).toBeVisible()
    await expectTouchTarget(page.getByLabel("Remove site photo 1"))

    await page.getByLabel("Remove site photo 1").click()
    await expect(page.getByAltText("Site photo 1")).toHaveCount(0)
    await expect(page.getByTestId("quick-generate-button")).toHaveCount(0)
    await expect(page.getByTestId("generate-estimate-button")).toBeDisabled()
})

test("typed capture shows a quick generate action before the bottom navigation", async ({ page }) => {
    await mockGeneratedEstimate(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")

    await page.getByTestId("job-description-input").fill(
        "Replace leaking shower cartridge, test valve operation, and clean the work area."
    )

    const quickGenerateButton = page.getByTestId("quick-generate-button")
    await expect(quickGenerateButton).toBeVisible()
    await expect(page.getByTestId("input-readiness-scope-status")).toHaveText("Scope ready")

    const quickBox = await quickGenerateButton.boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(quickBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(quickBox!.y + quickBox!.height).toBeLessThanOrEqual(navBox!.y - 8)

    await quickGenerateButton.click()
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("result-generation-status")).toContainText("Draft ready")
    await expect(page.getByTestId("result-readiness-strip")).toContainText("Client needed")
    await expect(page.getByTestId("result-readiness-strip")).toContainText("2 lines")
    await expect(page.getByTestId("result-readiness-strip")).toContainText("Payment optional")
    await expect(page.getByTestId("result-readiness-actions")).toBeVisible()
    await expect(page.getByTestId("result-review-lines-button")).toHaveText("Review 2 lines")
    await expect(page.getByTestId("result-payment-link-button")).toHaveText("Add payment")
    await expectTouchTarget(page.getByTestId("result-review-lines-button"))
    await expectTouchTarget(page.getByTestId("result-payment-link-button"))
    await expect(page.getByTestId("result-quick-sms-label")).toHaveText("Text quote")
    await expect(page.getByTestId("result-quick-preview-label")).toHaveText("Preview")
    await expect(page.getByTestId("result-quick-pdf-label")).toHaveText("Download")
    await expect(page.getByTestId("result-quick-sign-label")).toHaveText("Sign")
    await expectVisibleActionLabel(page.getByTestId("result-quick-sms-label"))
    await expectVisibleActionLabel(page.getByTestId("result-quick-preview-label"))
    await expectVisibleActionLabel(page.getByTestId("result-quick-pdf-label"))
    await expectVisibleActionLabel(page.getByTestId("result-quick-sign-label"))
    await expect(page.getByTestId("result-quick-actions")).toContainText("Add customer details, then send the quote.")
    await expect(page.getByTestId("sync-status-button")).toHaveCount(0)
    await expect(page.getByTestId("result-client-details-button")).toHaveText("Add customer")
    await expect(page.getByTestId("result-client-details-collapsed")).toBeVisible()
    await expect(page.getByTestId("result-client-name-input")).toHaveCount(0)
    await expect(page.getByTestId("result-quick-send-button")).toHaveCount(0)
    await expect(page.getByTestId("toast-message")).toHaveCount(0)

    const quickActionsBox = await page.getByTestId("result-quick-actions").boundingBox()
    const collapsedClientBox = await page.getByTestId("result-client-details-collapsed").boundingBox()
    const primaryActionsBox = await page.getByTestId("result-primary-actions").boundingBox()
    const secondaryActionsBox = await page.getByTestId("result-secondary-actions").boundingBox()
    const saveButtonBox = await page.getByTestId("result-quick-save-button").boundingBox()
    const addCustomerButtonBox = await page.getByTestId("result-client-details-button").boundingBox()
    expect(quickActionsBox).not.toBeNull()
    expect(collapsedClientBox).not.toBeNull()
    expect(primaryActionsBox).not.toBeNull()
    expect(secondaryActionsBox).not.toBeNull()
    expect(saveButtonBox).not.toBeNull()
    expect(addCustomerButtonBox).not.toBeNull()
    expect(saveButtonBox!.width).toBeGreaterThanOrEqual((primaryActionsBox!.width - 8) / 2 - 1)
    expect(addCustomerButtonBox!.width).toBeGreaterThanOrEqual((primaryActionsBox!.width - 8) / 2 - 1)
    expect(addCustomerButtonBox!.x).toBeGreaterThan(saveButtonBox!.x)
    expect(collapsedClientBox!.height).toBeLessThanOrEqual(70)
    expect(collapsedClientBox!.y + collapsedClientBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
    expect(secondaryActionsBox!.height).toBeLessThanOrEqual(96)
    expect(quickActionsBox!.y + quickActionsBox!.height).toBeLessThanOrEqual(navBox!.y - 8)

    await page.getByTestId("result-client-details-button").click()
    await expect(page.getByTestId("toast-message")).toHaveCount(0)
    await expect(page.getByTestId("result-client-details-collapsed")).toHaveCount(0)
    await expect(page.getByTestId("result-client-name-input")).toBeFocused()
    await expectTouchTarget(page.getByTestId("result-client-name-input"))
    await expectTouchTarget(page.getByTestId("result-client-address-input"))
    await expectTouchTarget(page.getByTestId("result-client-email-input"))
    await expectTouchTarget(page.getByTestId("result-client-phone-input"))
    await page.waitForFunction(() => {
        const clientCard = document.querySelector('[data-testid="result-client-details-card"]')
        const nav = document.querySelector('[data-testid="bottom-navigation"]')
        if (!clientCard || !nav) return false
        const clientCardBox = clientCard.getBoundingClientRect()
        const navBox = nav.getBoundingClientRect()
        return clientCardBox.bottom <= navBox.top - 8
    })

    await page.getByTestId("result-review-lines-button").click()
    await expect(page.getByTestId("toast-message")).toHaveCount(0)
    await page.waitForFunction(() => {
        const firstLineCard = document.querySelector('[data-testid="line-item-row-0"]')
        const nav = document.querySelector('[data-testid="bottom-navigation"]')
        if (!firstLineCard || !nav) return false
        const lineCardBox = firstLineCard.getBoundingClientRect()
        const navBox = nav.getBoundingClientRect()
        const lineEditingBlock = document.querySelector('[data-testid="line-items-editing-block"]')
        if (!lineEditingBlock) return false
        const visibleLineControls = Array.from(lineEditingBlock.querySelectorAll(
            'button, input, textarea, select'
        )).filter((element) => {
            const box = element.getBoundingClientRect()
            return box.bottom > 0 && box.top < window.innerHeight
        })
        const lineControlsClearOfNav = visibleLineControls.every((element) => {
            const box = element.getBoundingClientRect()
            return box.bottom <= navBox.top - 8 || box.top >= navBox.bottom
        })

        return lineCardBox.top >= 16 && lineCardBox.bottom <= navBox.top - 8 && lineControlsClearOfNav
    })

    const firstLineCard = page.getByTestId("line-item-row-0")
    const firstDescriptionInput = page.getByTestId("line-item-description-0")
    const firstMetaGrid = page.getByTestId("line-item-meta-grid-0")
    const firstMetaTotal = page.getByTestId("line-item-meta-total-0")
    const firstCategorySelect = page.getByTestId("line-item-category-0")
    const firstQuantityInput = page.getByTestId("line-item-quantity-0")
    const firstUnitSelect = page.getByTestId("line-item-unit-0")
    const firstUnitPriceInput = page.getByTestId("line-item-unit-price-0")
    const firstDeleteButton = page.getByRole("button", { name: "Delete line item 1" })
    await expect(firstLineCard).toBeVisible()
    await expect(firstDescriptionInput).toBeVisible()
    await expect(firstMetaGrid).toBeVisible()
    await expect(firstMetaTotal).toHaveText("$120.00")

    const lineCardBox = await firstLineCard.boundingBox()
    const descriptionBox = await firstDescriptionInput.boundingBox()
    const metaGridBox = await firstMetaGrid.boundingBox()
    const categoryBox = await firstCategorySelect.boundingBox()
    const quantityBox = await firstQuantityInput.boundingBox()
    const unitBox = await firstUnitSelect.boundingBox()
    const unitPriceBox = await firstUnitPriceInput.boundingBox()
    const deleteButtonBox = await firstDeleteButton.boundingBox()
    const totalTextFits = await firstMetaTotal.evaluate((element) => element.scrollWidth <= element.clientWidth)
    expect(lineCardBox).not.toBeNull()
    expect(descriptionBox).not.toBeNull()
    expect(metaGridBox).not.toBeNull()
    expect(categoryBox).not.toBeNull()
    expect(quantityBox).not.toBeNull()
    expect(unitBox).not.toBeNull()
    expect(unitPriceBox).not.toBeNull()
    expect(deleteButtonBox).not.toBeNull()
    expect(lineCardBox!.height).toBeLessThanOrEqual(215)
    expect(metaGridBox!.height).toBeLessThanOrEqual(76)
    expect(categoryBox!.height).toBeGreaterThanOrEqual(44)
    expect(quantityBox!.height).toBeGreaterThanOrEqual(44)
    expect(unitBox!.height).toBeGreaterThanOrEqual(44)
    expect(unitPriceBox!.height).toBeGreaterThanOrEqual(44)
    expect(deleteButtonBox!.width).toBeGreaterThanOrEqual(44)
    expect(deleteButtonBox!.height).toBeGreaterThanOrEqual(44)
    expect(totalTextFits).toBe(true)
    expect(descriptionBox!.width).toBeGreaterThanOrEqual(lineCardBox!.width - 28)

    await page.getByTestId("handoff-actions-card").scrollIntoViewIfNeeded()
    await page.waitForFunction(() => {
        const paymentCard = document.querySelector('[data-testid="payment-link-card"]')
        const handoffCard = document.querySelector('[data-testid="handoff-actions-card"]')
        const referralButton = document.querySelector('[data-testid="result-referral-link-button"]')
        const nav = document.querySelector('[data-testid="bottom-navigation"]')
        if (!paymentCard || !handoffCard || !referralButton || !nav) return false

        const paymentBox = paymentCard.getBoundingClientRect()
        const handoffBox = handoffCard.getBoundingClientRect()
        const referralBox = referralButton.getBoundingClientRect()
        const navBox = nav.getBoundingClientRect()

        return (
            paymentBox.height <= 155
            && handoffBox.height <= 260
            && referralBox.bottom <= navBox.top - 8
        )
    })
    await expect(page.getByTestId("handoff-actions-summary")).toBeVisible()
    await expect(page.getByTestId("handoff-referral-signin")).toContainText("Sign in to copy invites")
    await expect(page.getByTestId("result-share-pdf-button")).toContainText("Share PDF")
    await expect(page.getByTestId("result-referral-link-button")).toContainText("Copy invite")
    await expect(page.getByTestId("result-quick-save-label")).toHaveText("Save quote")
    await expectVisibleActionLabel(page.getByTestId("result-quick-save-label"))
    const handoffTextFits = await page.evaluate(() => {
        return [
            "handoff-actions-helper",
            "handoff-referral-signin",
            "result-share-pdf-button",
            "result-referral-link-button",
        ].every((testId) => {
            const element = document.querySelector(`[data-testid="${testId}"]`)
            return element instanceof HTMLElement && element.scrollWidth <= element.clientWidth
        })
    })
    expect(handoffTextFits).toBe(true)

    await expect(page.getByTestId("toast-message")).toHaveCount(0)
})

test("material import upload controls are keyboard reachable from line review", async ({ page }) => {
    await mockGeneratedEstimate(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")

    await page.getByTestId("job-description-input").fill("Replace shower cartridge and import material costs.")
    await page.getByTestId("quick-generate-button").click()
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")

    await page.getByTestId("result-review-lines-button").click()
    await expect(page.getByTestId("line-items-review-summary")).toBeVisible()

    await page.getByRole("button", { name: "Scan Receipt" }).click()
    await expect(page.getByRole("dialog", { name: "AI Material Receipt Scanner" })).toBeVisible()
    await expectTouchTarget(page.getByRole("button", { name: /Click to upload receipt or material list/ }))
    await page.getByRole("button", { name: "Cancel" }).click()

    await page.getByRole("button", { name: "CSV" }).click()
    await expect(page.getByRole("dialog", { name: "Import from CSV" })).toBeVisible()
    await expectTouchTarget(page.getByRole("button", { name: /Click to upload a CSV file/ }))
})

test("result with client name but no contact prompts for delivery contact before sending", async ({ page }) => {
    await mockGeneratedEstimate(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")

    await page.getByTestId("input-add-client-details-button").click()
    await page.getByPlaceholder("Client name").fill("Contact Needed Client")
    await page.getByTestId("job-description-input").fill("Replace shower cartridge and verify delivery CTA.")
    await expect(page.getByTestId("input-client-generate-button")).toContainText("Generate for Contact Needed Client")
    await page.getByTestId("input-client-generate-button").click()

    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("result-readiness-strip")).toContainText("Client ready")
    await expect(page.getByTestId("result-readiness-strip")).toContainText("Contact needed")
    await expect(page.getByTestId("result-add-contact-button")).toBeVisible()
    await expect(page.getByTestId("result-quick-send-button")).toHaveCount(0)

    await page.getByTestId("result-add-contact-button").click()
    await expect(page.getByTestId("result-client-email-input")).toBeFocused()
    await expectTouchTarget(page.getByTestId("result-client-email-input"))
    await expectTouchTarget(page.getByTestId("result-client-phone-input"))
})

test("line review gate flags incomplete manual line items before sending", async ({ page }) => {
    await mockGeneratedEstimate(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")

    await page.getByTestId("job-description-input").fill("Replace shower cartridge and add a missing material line.")
    await page.getByTestId("quick-generate-button").click()
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("line-review-status")).toHaveText("Ready for customer copy")

    await page.getByRole("button", { name: "Add Item" }).click()

    await expect(page.getByTestId("line-review-status")).toHaveText("2 fixes before sending")
    await expect(page.getByTestId("line-review-description-status")).toHaveText("1 missing")
    await expect(page.getByTestId("line-review-pricing-status")).toHaveText("1 zero price")
    await expect(page.getByTestId("line-review-quantity-status")).toHaveText("Checked")

    const qualityGateBox = await page.getByTestId("line-review-quality-gate").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(qualityGateBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(qualityGateBox!.y + qualityGateBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("signature capture marks the estimate signed and persists approval", async ({ page }) => {
    await mockGeneratedEstimate(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")

    await page.getByTestId("job-description-input").fill("Replace shower cartridge and capture customer approval.")
    await page.getByTestId("quick-generate-button").click()
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await page.getByTestId("result-client-details-button").click()
    await page.getByTestId("result-client-name-input").fill("Signed Approval Client")

    await page.getByTestId("result-quick-sign-button").click()
    const signatureDialog = page.getByRole("dialog", { name: "Sign Estimate" })
    await expect(signatureDialog).toBeVisible()
    await expect(page.getByTestId("signature-status")).toHaveText("Needed")
    await expect(page.getByTestId("signature-accept-button")).toBeDisabled()

    const canvas = page.getByTestId("signature-canvas")
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + 34, box!.y + 88)
    await page.mouse.down()
    await page.mouse.move(box!.x + 160, box!.y + 132, { steps: 6 })
    await page.mouse.move(box!.x + 300, box!.y + 86, { steps: 6 })
    await page.mouse.up()

    await expect(page.getByTestId("signature-status")).toHaveText("Ready")
    await expect(page.getByTestId("signature-accept-button")).toBeEnabled()
    await page.getByTestId("signature-accept-button").click()

    await expect(signatureDialog).toBeHidden()
    await expect(page.getByTestId("result-quick-sign-label")).toHaveText("Signed")
    await expect(page.getByText("Signature captured and estimate marked sent.")).toBeVisible()

    const storedEstimates = await readStoredEstimateApprovals(page)
    expect(storedEstimates).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                clientName: "Signed Approval Client",
                status: "sent",
                clientSignature: expect.stringMatching(/^data:image\/png;base64,/),
                signedAt: expect.any(String),
                sentAt: expect.any(String),
            }),
        ])
    )
})

test("download PDF uses an estimate and customer specific filename", async ({ page }) => {
    await mockGeneratedEstimate(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")

    await page.getByTestId("job-description-input").fill("Replace shower cartridge and download the customer PDF.")
    await page.getByTestId("quick-generate-button").click()
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await page.getByTestId("result-client-details-button").click()
    await page.getByTestId("result-client-name-input").fill("Download Ready Client")

    const downloadPromise = page.waitForEvent("download")
    await page.getByTestId("result-quick-pdf-button").click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/^EST-\d{4}-\d{3}-download-ready-client-estimate\.pdf$/)
    await expect(page.getByText(/PDF downloaded as EST-\d{4}-\d{3}-download-ready-client-estimate\.pdf\./)).toBeVisible()
})

test("share PDF fallback downloads a named PDF and persists sent status", async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, "share", { value: undefined, configurable: true })
        Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true })
    })
    await mockGeneratedEstimate(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")

    await page.getByTestId("job-description-input").fill("Replace shower cartridge and share the customer PDF.")
    await page.getByTestId("quick-generate-button").click()
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await page.getByTestId("result-client-details-button").click()
    await page.getByTestId("result-client-name-input").fill("Share Ready Client")

    const downloadPromise = page.waitForEvent("download")
    await page.getByTestId("result-share-pdf-button").click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/^EST-\d{4}-\d{3}-share-ready-client-estimate\.pdf$/)
    await expect(page.getByText("PDF downloaded for sharing. Estimate marked sent.")).toBeVisible()

    const storedEstimates = await readStoredEstimateApprovals(page)
    expect(storedEstimates).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                clientName: "Share Ready Client",
                status: "sent",
                sentAt: expect.any(String),
            }),
        ])
    )
})

test("result payment quick action starts payment setup from the handoff card", async ({ page }) => {
    await mockGeneratedEstimate(page)

    await page.goto("/new-estimate?capture=type")
    await page.getByTestId("job-description-input").fill(
        "Replace leaking shower cartridge, test valve operation, and clean the work area."
    )
    await expect(page.getByTestId("generate-estimate-button")).toBeEnabled()
    await page.getByTestId("generate-estimate-button").click()

    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("result-payment-link-button")).toHaveText("Add payment")
    await page.getByTestId("result-payment-link-button").click()

    await expect(page).toHaveURL(/\/login\?next=%2Fnew-estimate%3FdraftId%3D[^&]+&intent=payment-link/, { timeout: 10000 })
    await expect(page.getByTestId("login-return-target")).toHaveText(/payment link setup/i)

    const paymentNextPath = new URL(page.url()).searchParams.get("next")
    if (!paymentNextPath) throw new Error("Expected payment login to include a return path")
    await seedAuthenticatedSupabaseSession(page)
    await mockSignedInBilling(page)
    await page.goto(`${paymentNextPath}&intent=payment-link`)
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("payment-option-summary")).toBeVisible()
    await expect(page.getByTestId("toast-message")).toContainText("Continue payment link setup")
})

test("typed capture can load a saved client before generating", async ({ page }) => {
    await mockGeneratedEstimate(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/clients")
    await page.getByRole("button", { name: "New" }).click()
    await page.getByPlaceholder("Customer name").fill("Composer Client")
    await page.getByPlaceholder("(555) 123-4567").fill("+14165550199")
    await page.getByPlaceholder("client@example.com").fill("composer@example.com")
    await page.getByPlaceholder("Service address").fill("55 Composer Court")
    await page.getByRole("button", { name: "Save Client" }).click()
    await page.getByRole("button", { name: "New" }).click()
    await page.getByPlaceholder("Customer name").fill("Roof Referral Client")
    await page.getByPlaceholder("(555) 123-4567").fill("+14165550177")
    await page.getByPlaceholder("client@example.com").fill("roof@example.com")
    await page.getByPlaceholder("Service address").fill("91 Ridge Road")
    await page.getByRole("button", { name: "Save Client" }).click()

    await page.goto("/new-estimate?capture=type")
    await page.getByTestId("input-load-client-button").click()

    const clientDialog = page.getByRole("dialog", { name: "Select Client" })
    await expect(clientDialog).toBeVisible()
    await expect(page.getByTestId("client-load-count")).toHaveText("2 of 2 saved clients")
    await page.getByTestId("client-load-search-input").fill("composer@example.com")
    await expect(page.getByTestId("client-load-count")).toHaveText("1 of 2 saved clients")
    const clearSearchButton = page.getByTestId("client-load-clear-search")
    await expect(clearSearchButton).toBeVisible()
    await expect.poll(async () => {
        const clearSearchBox = await clearSearchButton.boundingBox()
        if (!clearSearchBox) return 0

        return Math.min(clearSearchBox.width, clearSearchBox.height)
    }).toBeGreaterThanOrEqual(44)
    await expect(clientDialog.getByText("+14165550199")).toBeVisible()
    await expect(clientDialog.getByText("composer@example.com")).toBeVisible()
    await expect(clientDialog.getByText("Roof Referral Client")).toHaveCount(0)
    await page.getByRole("button", { name: /Composer Client/ }).click()

    await expect(clientDialog).toBeHidden()
    await expect(page.getByTestId("input-client-details-summary")).toContainText("Composer Client")
    await expect(page.getByTestId("input-client-details-summary")).toContainText("55 Composer Court")
    await expect(page.getByTestId("input-client-details-fields")).toHaveCount(0)
    await page.getByTestId("input-edit-client-details-button").click()
    await expect(page.getByPlaceholder("Client name")).toHaveValue("Composer Client")
    await expect(page.getByPlaceholder("Job address")).toHaveValue("55 Composer Court")
    await expect(page.getByText("Loaded Composer Client.")).toBeVisible()

    await page.getByTestId("job-description-input").fill(
        "Replace leaking shower cartridge, test valve operation, and clean the work area."
    )
    await expect(page.getByTestId("input-client-generate-button")).toContainText("Generate for Composer Client")
    await expect(page.getByTestId("generate-estimate-button")).toHaveCount(0)
    await page.getByTestId("input-client-generate-button").click()
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("result-readiness-strip")).toContainText("Client ready")
    await expect(page.getByTestId("result-readiness-strip")).toContainText("Contact ready")
    await expect(page.getByTestId("result-client-delivery-summary")).toContainText("composer@example.com")
    await expect(page.getByTestId("result-client-delivery-summary")).toContainText("+14165550199")
    await expect(page.getByTestId("result-client-email-input")).toHaveCount(0)
    await expect(page.getByTestId("result-client-phone-input")).toHaveCount(0)
    await page.getByTestId("result-edit-delivery-contact-button").click()
    await expect(page.getByTestId("result-client-email-input")).toHaveValue("composer@example.com")
    await expect(page.getByTestId("result-client-phone-input")).toHaveValue("+14165550199")
    await expectTouchTarget(page.getByTestId("result-client-email-input"))
    await expectTouchTarget(page.getByTestId("result-client-phone-input"))

    await page.getByRole("button", { name: /send to customer/i }).click()
    await expect(page.getByLabel(/customer email/i)).toHaveValue("composer@example.com")
    await page.getByRole("button", { name: /cancel/i }).click()

    await page.getByRole("button", { name: /send via sms/i }).click()
    await expect(page.getByLabel(/customer phone/i)).toHaveValue("+14165550199")
})

test("result can load a saved client and return to delivery actions", async ({ page }) => {
    await mockGeneratedEstimate(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/clients")
    await page.getByRole("button", { name: "New" }).click()
    await page.getByPlaceholder("Customer name").fill("Result Delivery Client")
    await page.getByPlaceholder("(555) 123-4567").fill("+14165550222")
    await page.getByPlaceholder("client@example.com").fill("result-delivery@example.com")
    await page.getByPlaceholder("Service address").fill("77 Result Lane")
    await page.getByRole("button", { name: "Save Client" }).click()
    await page.getByRole("button", { name: "New" }).click()
    await page.getByPlaceholder("Customer name").fill("Result Other Client")
    await page.getByPlaceholder("(555) 123-4567").fill("+14165550333")
    await page.getByPlaceholder("client@example.com").fill("other-result@example.com")
    await page.getByPlaceholder("Service address").fill("88 Other Street")
    await page.getByRole("button", { name: "Save Client" }).click()

    await page.goto("/new-estimate?capture=type")
    await page.getByTestId("job-description-input").fill(
        "Replace leaking shower cartridge, test valve operation, and clean the work area."
    )
    await page.getByTestId("quick-generate-button").click()

    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("result-client-details-button")).toHaveText("Add customer")
    await page.getByTestId("result-client-details-button").click()
    await page.getByTestId("result-load-client-button").click()

    const clientDialog = page.getByRole("dialog", { name: "Select Client" })
    await expect(clientDialog).toBeVisible()
    await expect(page.getByTestId("client-load-count")).toHaveText("2 of 2 saved clients")
    await page.getByTestId("client-load-search-input").fill("result-delivery@example.com")
    await expect(page.getByTestId("client-load-count")).toHaveText("1 of 2 saved clients")
    await expect(clientDialog.getByText("result-delivery@example.com")).toBeVisible()
    await expect(clientDialog.getByText("Result Other Client")).toHaveCount(0)
    await page.getByRole("button", { name: /Result Delivery Client/ }).click()

    await expect(clientDialog).toBeHidden()
    await expect(page.getByText("Loaded Result Delivery Client. Delivery actions are ready.")).toBeVisible()
    await expect(page.getByTestId("result-readiness-strip")).toContainText("Client ready")
    await expect(page.getByTestId("result-readiness-strip")).toContainText("Contact ready")
    await expect(page.getByTestId("result-client-delivery-summary")).toContainText("result-delivery@example.com")
    await expect(page.getByTestId("result-client-delivery-summary")).toContainText("+14165550222")
    await expect(page.getByTestId("result-client-email-input")).toHaveCount(0)
    await expect(page.getByTestId("result-client-phone-input")).toHaveCount(0)
    await expect(page.getByTestId("result-quick-send-button")).toBeVisible()
    await expect(page.getByTestId("result-quick-send-button")).toContainText("Email quote")

    const quickActionsBox = await page.getByTestId("result-quick-actions").boundingBox()
    const sendButtonBox = await page.getByTestId("result-quick-send-button").boundingBox()
    const sendButtonFits = await page.getByTestId("result-quick-send-button").evaluate((button) => {
        return button.scrollWidth <= button.clientWidth
    })
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()
    expect(quickActionsBox).not.toBeNull()
    expect(sendButtonBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(sendButtonFits).toBe(true)
    expect(quickActionsBox!.y + quickActionsBox!.height).toBeLessThanOrEqual(navBox!.y - 8)

    await page.getByTestId("result-quick-send-button").click()
    await expect(page.getByLabel(/customer email/i)).toHaveValue("result-delivery@example.com")
})

test("saved draft preserves delivery contact when reopened from history", async ({ page }) => {
    await mockGeneratedEstimate(page)
    await page.goto("/new-estimate?capture=type")

    await page.getByTestId("job-description-input").fill(
        "Replace leaking shower cartridge, test valve operation, and clean the work area."
    )
    await page.getByTestId("quick-generate-button").click()

    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await page.getByTestId("result-client-details-button").click()
    await page.getByTestId("result-client-name-input").fill("Saved Contact Client")
    await page.getByTestId("result-client-address-input").fill("14 Saved Lane")
    await page.getByTestId("result-client-email-input").fill("saved-contact@example.com")
    await page.getByTestId("result-client-phone-input").fill("+14165550444")
    await page.getByTestId("result-quick-save-button").click()

    await expect(page).toHaveURL(/\/history/)
    await expect(page.getByTestId("history-next-action-description")).toContainText("Saved Contact Client")
    await page.getByTestId("history-next-action-button").click()

    await expect(page).toHaveURL(/\/new-estimate\?draftId=/)
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("result-readiness-strip")).toContainText("Contact ready")
    await expect(page.getByTestId("result-client-delivery-summary")).toContainText("saved-contact@example.com")
    await expect(page.getByTestId("result-client-delivery-summary")).toContainText("+14165550444")
    await expect(page.getByTestId("result-client-email-input")).toHaveCount(0)
    await expect(page.getByTestId("result-client-phone-input")).toHaveCount(0)

    await page.getByTestId("result-quick-send-button").click()
    await expect(page.getByLabel(/customer email/i)).toHaveValue("saved-contact@example.com")
})

test("manual estimate flow renders a generated draft with mocked AI output", async ({ page }) => {
    await mockGeneratedEstimate(page)

    await page.goto("/new-estimate")
    await page.getByTestId("skip-to-manual-entry").click()
    await page.getByTestId("job-description-input").fill(
        "Replace leaking shower cartridge, test valve operation, and clean the work area."
    )
    await page.getByTestId("generate-estimate-button").click()

    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("line-item-description-0")).toHaveValue("Replace shower cartridge")
    await expect(page.getByTestId("line-item-description-1")).toHaveValue("Remove trim, install new cartridge, and test")
    await expect(page.getByTestId("line-items-review-summary")).toBeVisible()
    await expect(page.getByTestId("line-items-count")).toHaveText("2 items ready to verify")
    await expect(page.getByTestId("line-review-status")).toHaveText("Ready for customer copy")
    await expect(page.getByTestId("line-review-description-status")).toHaveText("Checked")
    await expect(page.getByTestId("line-review-pricing-status")).toHaveText("Checked")
    await expect(page.getByTestId("line-review-quantity-status")).toHaveText("Checked")
    await expect(page.getByText("Subtotal").first()).toBeVisible()
    await expect(page.getByTestId("line-items-review-summary").getByText("$203.40")).toBeVisible()
    await expect(page.getByRole("button", { name: /^Save Estimate$/ })).toHaveCount(1)
    await expect(page.getByTestId("result-client-details-button")).toHaveText("Add customer")
    await expect(page.getByRole("button", { name: /^Send to Customer$/ })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /^Send via SMS$/ })).toHaveCount(1)
    await expect(page.getByRole("button", { name: /^Download PDF$/ })).toHaveCount(1)
    await expect(page.getByTestId("result-readiness-strip")).toContainText("Contact needed")
    await expect(page.getByTestId("result-client-delivery-summary")).toHaveCount(0)
    await expect(page.getByTestId("result-client-details-collapsed")).toBeVisible()
    await expect(page.getByTestId("result-client-email-input")).toHaveCount(0)
    await expect(page.getByTestId("result-client-phone-input")).toHaveCount(0)
    await expect(page.getByTestId("result-quick-actions")).toContainText("Add customer details, then send the quote.")
    await expect(page.getByTestId("handoff-actions-card")).toBeVisible()
    await expect(page.getByTestId("handoff-actions-status")).toHaveText("PDF ready")
    await expect(page.getByTestId("handoff-actions-helper")).toHaveText("PDF is ready; payment and referral are optional.")
    await expect(page.getByTestId("handoff-actions-summary")).toBeVisible()
    await expect(page.getByTestId("handoff-pdf-status")).toHaveText("Ready")
    await expect(page.getByTestId("handoff-payment-status")).toHaveText("Optional")
    await expect(page.getByTestId("handoff-referral-status")).toHaveText("Sign in")
    await expect(page.getByTestId("handoff-referral-signin")).toContainText("Sign in to copy invites")
    await expect(page.getByTestId("handoff-referral-signin")).toContainText("save this draft")
    await expect(page.getByTestId("result-share-pdf-button")).toContainText("Share PDF")
    await expect(page.getByTestId("result-share-pdf-button")).toContainText("Customer-ready estimate")
    await expect(page.getByTestId("result-referral-link-button")).toContainText("Copy invite")
    await expect(page.getByTestId("result-referral-link-button")).toContainText("Login required to copy")

    await page.getByTestId("result-referral-link-button").click()
    await expect(page.getByText("Log in first to generate your referral link.")).toBeVisible()

    await expectTouchTarget(page.getByTestId("handoff-referral-signin-action"))
    await page.getByTestId("handoff-referral-signin-action").click()
    await expect(page).toHaveURL(/\/login\?next=%2Fnew-estimate%3FdraftId%3D[^&]+&intent=referral-invite/)
    await expect(page.getByTestId("login-referral-invite-copy")).toBeVisible()
    await expect(page.getByTestId("toast-message")).toHaveCount(0)

    const referralNextPath = new URL(page.url()).searchParams.get("next")
    if (!referralNextPath) throw new Error("Expected referral login to include a return path")
    await seedAuthenticatedSupabaseSession(page)
    await mockSignedInBilling(page)
    await page.goto(`${referralNextPath}&intent=referral-invite`)
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("line-item-description-0")).toHaveValue("Replace shower cartridge")
    await expect(page.getByTestId("handoff-referral-status")).toHaveText("Ready")
    await expect(page.getByTestId("handoff-referral-signin")).toHaveCount(0)
    await expect(page.getByTestId("toast-message")).toContainText("Referral invites are ready")
})

test("section-based estimate keeps section line descriptions readable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(() => {
        window.localStorage.setItem(
            "duplicate_estimate",
            JSON.stringify({
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
                                description: "Install feeder cable through finished basement ceiling",
                                quantity: 40,
                                unit: "LF",
                                unit_price: 8,
                                total: 320,
                            },
                        ],
                    },
                ],
                summary_note: "Section-based electrical rough-in estimate.",
                payment_terms: "Due on completion.",
                closing_note: "Thank you for choosing us.",
                warnings: [],
            })
        )
    })

    await page.goto("/new-estimate")
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await page.getByTestId("line-items-review-summary").scrollIntoViewIfNeeded()

    const sectionDescription = page.getByTestId("section-line-item-description-0")
    const sectionNameInput = page.getByLabel("Section Rough-in name")
    const sectionCategorySelect = page.getByTestId("section-line-item-category-0")
    const sectionQuantityInput = page.getByTestId("section-line-item-quantity-0")
    const sectionUnitSelect = page.getByTestId("section-line-item-unit-0")
    const sectionUnitPriceInput = page.getByTestId("section-line-item-unit-price-0")
    const sectionDeleteButton = page.getByRole("button", { name: "Delete section line item 1" })
    const sectionHeaderDeleteButton = page.getByRole("button", { name: "Delete Rough-in section" })
    const sectionAddItemButton = page.getByRole("button", { name: "Add item to Rough-in section" })
    const taxInput = page.getByLabel("Tax rate percentage")
    const paymentSwitch = page.getByTestId("payment-link-switch")
    await expect(sectionDescription).toHaveValue("Install feeder cable through finished basement ceiling")
    await sectionDescription.evaluate((element) => element.scrollIntoView({ block: "center" }))

    const descriptionBox = await sectionDescription.boundingBox()
    const sectionNameBox = await sectionNameInput.boundingBox()
    const categoryBox = await sectionCategorySelect.boundingBox()
    const quantityBox = await sectionQuantityInput.boundingBox()
    const unitBox = await sectionUnitSelect.boundingBox()
    const unitPriceBox = await sectionUnitPriceInput.boundingBox()
    const deleteButtonBox = await sectionDeleteButton.boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(descriptionBox).not.toBeNull()
    expect(sectionNameBox).not.toBeNull()
    expect(categoryBox).not.toBeNull()
    expect(quantityBox).not.toBeNull()
    expect(unitBox).not.toBeNull()
    expect(unitPriceBox).not.toBeNull()
    expect(deleteButtonBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(sectionNameBox!.height).toBeGreaterThanOrEqual(44)
    expect(categoryBox!.height).toBeGreaterThanOrEqual(44)
    expect(quantityBox!.height).toBeGreaterThanOrEqual(44)
    expect(unitBox!.height).toBeGreaterThanOrEqual(44)
    expect(unitPriceBox!.height).toBeGreaterThanOrEqual(44)
    expect(deleteButtonBox!.width).toBeGreaterThanOrEqual(44)
    expect(deleteButtonBox!.height).toBeGreaterThanOrEqual(44)
    await expectTouchTarget(sectionHeaderDeleteButton)
    await expectTouchTarget(sectionAddItemButton)
    await expectTouchTarget(taxInput)
    await expectTouchTarget(paymentSwitch)
    expect(descriptionBox!.width).toBeGreaterThanOrEqual(290)
    expect(descriptionBox!.y + descriptionBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("demo quote button loads a tutorial draft for first-time practice", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate")

    await page.getByTestId("load-demo-quote-button").click()

    await expect(page.getByTestId("demo-tutorial-banner")).toBeVisible()
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("result-quick-actions")).toBeVisible()
    await expect(page.getByTestId("result-quick-actions")).toContainText("Review the essentials, then send the customer copy.")
    await expect(page.getByTestId("toast-message")).toHaveCount(0)
    await expect(page.getByTestId("line-item-description-0")).toHaveValue("Vanity drain assembly and shutoff parts package")
    await expect(page.locator('input[value="Demo Customer"]').first()).toBeVisible()

    const quickActionsBox = await page.getByTestId("result-quick-actions").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(quickActionsBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(quickActionsBox!.y + quickActionsBox!.height).toBeLessThanOrEqual(navBox!.y - 8)

    await page.setViewportSize({ width: 1280, height: 900 })
    const resultPanelBox = await page.getByTestId("estimate-result-panel").boundingBox()
    const saveButtonBox = await page.getByTestId("result-quick-save-button").boundingBox()
    const addContactButtonBox = await page.getByTestId("result-add-contact-button").boundingBox()

    expect(resultPanelBox).not.toBeNull()
    expect(saveButtonBox).not.toBeNull()
    expect(addContactButtonBox).not.toBeNull()
    expect(resultPanelBox!.width).toBeGreaterThanOrEqual(620)
    expect(saveButtonBox!.width).toBeGreaterThanOrEqual(170)
    expect(addContactButtonBox!.width).toBeGreaterThanOrEqual(170)
    expect(addContactButtonBox!.x).toBeLessThan(saveButtonBox!.x)
})

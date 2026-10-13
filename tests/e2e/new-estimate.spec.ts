import { expect, test, type Locator, type Page } from "@playwright/test"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local", quiet: true })

const tinySitePhotoPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
)
const tinySitePhotoDataUrl = `data:image/png;base64,${tinySitePhotoPng.toString("base64")}`

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
            customerPortalStatus?: string
            customerPortalUrl?: string
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

async function seedLocalEstimates(page: Page, estimates: Array<Record<string, unknown>>) {
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

async function mockGeneratedEstimate(page: Page, onPayload?: (payload: Record<string, unknown>) => void) {
    await page.route("**/api/generate", async (route) => {
        onPayload?.(route.request().postDataJSON() as Record<string, unknown>)
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

test("field capture quota issue keeps the capture visible with a pricing action", async ({ page }) => {
    await page.route("**/api/generate", async (route) => {
        await route.fulfill({
            status: 402,
            contentType: "application/json",
            body: JSON.stringify({
                error: "Usage quota exceeded",
                metric: "generate",
            }),
        })
    })

    await page.goto("/new-estimate")
    await page.getByTestId("job-description-input").fill(
        "Replace leaking shower cartridge, test valve operation, and clean the work area."
    )

    await page.getByTestId("generate-estimate-button").click()

    await expect(page.getByTestId("quota-upgrade-prompt")).toBeVisible()
    await expect(page.getByTestId("quota-upgrade-title")).toHaveText("AI draft quota reached")
    await expect(page.getByTestId("quota-upgrade-message")).toContainText("Your capture is still saved")
    await expect(page.getByTestId("quota-upgrade-pricing-link")).toHaveAttribute("href", "/pricing?source=generate_quota")
    await expect(page.getByTestId("job-description-input")).toHaveValue(
        "Replace leaking shower cartridge, test valve operation, and clean the work area."
    )
})

test("field capture generation failure keeps save and retry recovery actions", async ({ page }) => {
    let generateAttempts = 0
    await page.route("**/api/generate", async (route) => {
        generateAttempts += 1

        if (generateAttempts === 1) {
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ error: "AI service unavailable" }),
            })
            return
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                items: [
                    {
                        id: "item-retry-1",
                        itemNumber: 1,
                        category: "LABOR",
                        description: "Retry generated labor",
                        quantity: 1,
                        unit: "LS",
                        unit_price: 240,
                        total: 240,
                    },
                ],
                summary_note: "Retry generated estimate.",
                payment_terms: "Due on approval.",
                closing_note: "Thank you.",
                warnings: [],
            }),
        })
    })

    const fieldNotes = "Replace leaking laundry valve, install new shutoff, test pressure, and clean work area."

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")
    await page.getByTestId("job-description-input").fill(fieldNotes)
    await page.getByTestId("generate-estimate-button").click()

    const generationRecovery = page.getByTestId("generation-recovery-prompt")
    await expect(generationRecovery).toBeVisible()
    await expect(page.getByTestId("generation-recovery-title")).toHaveText("AI draft did not finish")
    await expect(page.getByTestId("generation-recovery-message")).toContainText("Your field capture is still in the composer")
    await expect(page.getByTestId("job-description-input")).toHaveValue(fieldNotes)
    await expect(page.getByTestId("generation-recovery-retry-action")).toContainText("Try again")
    await expect(page.getByTestId("generation-recovery-save-action")).toContainText("Save capture")
    await expect(page.getByTestId("generation-recovery-manual-action")).toContainText("Manual line entry")
    await expectTouchTarget(page.getByTestId("generation-recovery-retry-action"))
    await expectTouchTarget(page.getByTestId("generation-recovery-save-action"))

    await page.getByTestId("generation-recovery-save-action").click()
    await expect(page.getByTestId("toast-message")).toContainText("Field capture saved to Drafts.")

    const savedCaptureDraft = await page.evaluate(async (expectedNotes) => {
        const request = indexedDB.open("snapquote-db")
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
        const transaction = database.transaction("estimates", "readonly")
        const estimates = await new Promise<Array<{
            attachments?: { originalTranscript?: string }
            items?: unknown[]
            status?: string
            summary_note?: string
            totalAmount?: number
        }>>((resolve, reject) => {
            const getAllRequest = transaction.objectStore("estimates").getAll()
            getAllRequest.onerror = () => reject(getAllRequest.error)
            getAllRequest.onsuccess = () => resolve(getAllRequest.result)
        })
        database.close()
        return estimates.find((estimate) => estimate.summary_note?.includes(expectedNotes)) || null
    }, fieldNotes)

    expect(savedCaptureDraft).toMatchObject({
        items: [],
        status: "draft",
        totalAmount: 0,
        attachments: {
            originalTranscript: fieldNotes,
        },
    })

    await page.getByTestId("generation-recovery-retry-action").click()
    await expect.poll(() => generateAttempts).toBe(2)
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("line-item-description-0")).toHaveValue("Retry generated labor")
    await expect(generationRecovery).toHaveCount(0)
})

test("free quote quota banner opens pricing with generate quota context", async ({ page }) => {
    await page.goto("/")
    await seedAuthenticatedSupabaseSession(page)
    await mockSignedInBilling(page, "free")

    await page.goto("/new-estimate")

    await expect(page.getByLabel("Free tier quota banner")).toBeVisible()
    await expect(page.getByTestId("free-tier-quota-upgrade-link")).toHaveAttribute("href", "/pricing?source=generate_quota")
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
    await expect(page.getByText("Verify Details")).toBeVisible()
    await expect(page.getByTestId("verify-scope-detail-status")).toHaveText("Quote-ready scope")
    await expect(page.getByTestId("verify-scope-next-detail")).toHaveText("Ready for AI draft.")
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
    await expect(page.getByTestId("input-scope-detail-status")).toHaveText("Needs scope")
    await expect(page.getByTestId("input-scope-next-detail")).toContainText("Start with the work requested")
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
    await expect(page.getByTestId("input-scope-detail-status")).toHaveText("Good start")
    await expect(page.getByTestId("quick-generate-scope-helper")).toHaveText("Add work.")
    await expect(page.getByTestId("input-scope-next-detail")).toContainText("Add work to perform")
    await expectTouchTarget(page.getByLabel("Remove site photo 1"))

    await page.getByLabel("Remove site photo 1").click()
    await expect(page.getByAltText("Site photo 1")).toHaveCount(0)
    await expect(page.getByTestId("quick-generate-button")).toHaveCount(0)
    await expect(page.getByTestId("generate-estimate-button")).toBeDisabled()
})

test("typed capture nudges thin field notes before generation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")

    await page.getByTestId("job-description-input").fill("Fix sink")

    await expect(page.getByTestId("quick-generate-button")).toBeVisible()
    await expect(page.getByTestId("input-scope-detail-status")).toHaveText("Thin scope")
    await expect(page.getByTestId("quick-generate-scope-helper")).toHaveText("Add cost.")
    await expect(page.getByTestId("input-scope-next-detail")).toContainText("Add materials or labor")

    const costPrompt = page.getByTestId("scope-guidance-prompt-cost")
    await expect(page.getByTestId("scope-guidance-card")).toContainText("Sharpen AI draft")
    await expect(costPrompt).toContainText("Materials or labor")
    await expectTouchTarget(costPrompt)

    await costPrompt.click()

    await expect(page.getByTestId("job-description-input")).toHaveValue(/Fix sink\nMaterials\/labor:/)
    await expect(page.getByTestId("job-description-input")).toBeFocused()
    await expect(page.getByTestId("input-scope-detail-status")).toHaveText("Good start")
    await expect(page.getByTestId("quick-generate-scope-helper")).toHaveText("Add site.")
    await expect(page.getByTestId("scope-guidance-prompt-site")).toContainText("Site conditions")
    await expect(page.getByTestId("scope-guidance-prompt-cost")).toHaveCount(0)
})

test("thin scope results show estimate assumptions before sending", async ({ page }) => {
    await mockGeneratedEstimate(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")

    await page.getByTestId("job-description-input").click()
    await page.keyboard.type("Fix sink")
    await page.getByTestId("quick-generate-button").click()

    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("result-readiness-strip")).toContainText("Scope check")
    await expect(page.getByTestId("result-scope-confidence-card")).toContainText("Estimate assumptions")
    await expect(page.getByTestId("result-scope-confidence-status")).toHaveText("Low confidence")
    await expect(page.getByTestId("result-scope-confidence-helper")).toContainText("limited field detail")
    await expect(page.getByTestId("result-scope-assumption-list")).toContainText("Materials or labor")
    await expect(page.getByTestId("result-scope-assumption-list")).toContainText("Site conditions")

    await page.getByTestId("result-client-details-button").click()
    await page.getByTestId("result-client-name-input").fill("Scope Gate Client")
    await page.getByTestId("result-client-email-input").fill("scope-gate@example.com")
    await page.getByTestId("result-quick-send-button").click()
    await expect(page.getByTestId("toast-message")).toContainText("Confirm scope assumptions before emailing this estimate.")
    await expect(page.getByRole("dialog", { name: "Send Estimate" })).toHaveCount(0)

    await page.getByTestId("result-quick-sms-button").click()
    await expect(page.getByTestId("toast-message")).toContainText("Confirm scope assumptions before texting this estimate.")
    await expect(page.getByRole("dialog", { name: "Send via SMS" })).toHaveCount(0)

    await page.getByTestId("result-quick-pdf-button").click()
    await expect(page.getByTestId("toast-message")).toContainText(
        "Confirm scope assumptions before creating the customer PDF."
    )

    await page.getByTestId("handoff-actions-card").scrollIntoViewIfNeeded()
    await expect(page.getByTestId("handoff-scope-assumptions-status")).toHaveText("Scope check")
    await expect(page.getByTestId("handoff-actions-helper")).toHaveText("Confirm scope assumptions before sharing.")
    await expect(page.getByTestId("result-share-pdf-button")).toContainText("Review assumptions first")
    await page.getByTestId("result-share-pdf-button").click()
    await expect(page.getByTestId("toast-message")).toContainText("Confirm scope assumptions before sharing this PDF.")

    await page.getByTestId("result-scope-confidence-card").scrollIntoViewIfNeeded()
    const confirmScopeButton = page.getByTestId("result-confirm-scope-assumptions-button")
    await expectTouchTarget(confirmScopeButton)
    await confirmScopeButton.click()

    await expect(page.getByTestId("result-scope-confidence-status")).toHaveText("Confirmed")
    await expect(page.getByTestId("result-scope-confidence-helper")).toHaveText(
        "Scope assumptions reviewed for customer delivery."
    )
    await expect(page.getByTestId("result-scope-assumption-list")).toContainText("Reviewed")
    await expect(confirmScopeButton).toContainText("Scope reviewed")
    await expect(confirmScopeButton).toBeDisabled()
    await expect(page.getByTestId("toast-message")).toContainText("Scope assumptions confirmed")

    await page.getByTestId("handoff-actions-card").scrollIntoViewIfNeeded()
    await expect(page.getByTestId("handoff-actions-status")).toHaveText("PDF ready")
    await expect(page.getByTestId("handoff-scope-assumptions-status")).toHaveCount(0)
    await expect(page.getByTestId("handoff-actions-helper")).toHaveText("PDF is ready; payment and referral are optional.")
    await expect(page.getByTestId("result-share-pdf-button")).toContainText("Customer-ready estimate")

    await page.getByTestId("result-quick-send-button").click()
    const emailDialog = page.getByRole("dialog", { name: "Send Estimate" })
    await expect(emailDialog).toBeVisible()
    await emailDialog.getByRole("button", { name: "Cancel" }).click()
    await expect(emailDialog).toHaveCount(0)

    await page.getByTestId("result-quick-sms-button").click()
    const smsDialog = page.getByRole("dialog", { name: "Send via SMS" })
    await expect(smsDialog).toBeVisible()
    await smsDialog.getByRole("button", { name: "Cancel" }).click()
    await expect(smsDialog).toHaveCount(0)

    const editSourceNotesButton = page.getByTestId("result-edit-source-notes-button")
    await expectTouchTarget(editSourceNotesButton)
    await editSourceNotesButton.click()

    await expect(page.getByTestId("job-description-input")).toBeFocused()
    await expect(page.getByTestId("job-description-input")).toHaveValue("Fix sink")
    await expect(page.getByTestId("scope-guidance-card")).toContainText("Sharpen AI draft")
})

test("saved thin scope confirmation survives reopening from history", async ({ page }) => {
    await mockGeneratedEstimate(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")

    await page.getByTestId("job-description-input").click()
    await page.keyboard.type("Fix sink")
    await page.getByTestId("quick-generate-button").click()

    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("result-scope-confidence-status")).toHaveText("Low confidence")
    await page.getByTestId("result-client-details-button").click()
    await page.getByTestId("result-client-name-input").fill("Persistent Scope Client")
    await page.getByTestId("result-client-email-input").fill("persistent-scope@example.com")
    await page.getByTestId("result-confirm-scope-assumptions-button").click()
    await expect(page.getByTestId("result-scope-confidence-status")).toHaveText("Confirmed")

    await page.getByTestId("result-quick-save-button").click()
    await expect(page).toHaveURL(/\/history/)

    const savedEstimate = await page.evaluate(async () => {
        const request = indexedDB.open("snapquote-db")
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
        const transaction = database.transaction("estimates", "readonly")
        const estimates = await new Promise<Array<{
            attachments?: {
                originalTranscript?: string
                scopeAssumptionsConfirmedAt?: string
            }
            clientName?: string
        }>>((resolve, reject) => {
            const getAllRequest = transaction.objectStore("estimates").getAll()
            getAllRequest.onerror = () => reject(getAllRequest.error)
            getAllRequest.onsuccess = () => resolve(getAllRequest.result)
        })
        database.close()
        return estimates.find((estimate) => estimate.clientName === "Persistent Scope Client") || null
    })

    expect(savedEstimate?.attachments?.originalTranscript).toBe("Fix sink")
    expect(savedEstimate?.attachments?.scopeAssumptionsConfirmedAt).toEqual(expect.any(String))

    await page.getByTestId("history-next-action-button").click()

    await expect(page).toHaveURL(/\/new-estimate\?draftId=/)
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("result-scope-confidence-status")).toHaveText("Confirmed")
    await expect(page.getByTestId("result-scope-confidence-helper")).toHaveText(
        "Scope assumptions reviewed for customer delivery."
    )
    await expect(page.getByTestId("handoff-actions-status")).toHaveText("PDF ready")
    await expect(page.getByTestId("result-share-pdf-button")).toContainText("Customer-ready estimate")

    await page.getByTestId("result-quick-send-button").click()
    await expect(page.getByRole("dialog", { name: "Send Estimate" })).toBeVisible()
})

test("typed capture restores unsent field notes after refresh", async ({ page }) => {
    await mockGeneratedEstimate(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")
    await expect(page.getByTestId("input-scope-next-detail")).toContainText("Start with the work requested")

    await page.getByTestId("job-description-input").fill(
        "Replace leaking kitchen faucet, install owner supplied fixture, test shutoffs, and clean work area."
    )
    await expect(page.getByTestId("quick-generate-button")).toBeVisible()
    await page.getByTestId("input-add-client-details-button").click()
    await expect(page.getByTestId("input-client-details-fields")).toBeVisible()
    await page.getByPlaceholder("Client name").fill("Recovered Client")
    await page.getByPlaceholder("Job address").fill("81 Recovery Lane")
    await page.waitForFunction(() => Boolean(window.localStorage.getItem("snapquote_unsent_capture_draft")))

    await page.reload()

    await expect(page.getByTestId("toast-message")).toContainText("Recovered unsent field notes")
    await expect(page.getByTestId("job-description-input")).toHaveValue(
        "Replace leaking kitchen faucet, install owner supplied fixture, test shutoffs, and clean work area."
    )
    await expect(page.getByTestId("input-scope-detail-status")).toHaveText("Quote-ready scope")
    await expect(page.getByTestId("input-client-details-fields")).toBeVisible()
    await expect(page.getByPlaceholder("Client name")).toHaveValue("Recovered Client")
    await expect(page.getByPlaceholder("Job address")).toHaveValue("81 Recovery Lane")

    await page.getByTestId("input-client-generate-button").click()
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    const unsentCaptureDraft = await page.evaluate(() => window.localStorage.getItem("snapquote_unsent_capture_draft"))
    expect(unsentCaptureDraft).toBeNull()
})

test("photo capture route does not restore a stale typed unsent draft", async ({ page }) => {
    await page.addInitScript(() => {
        window.localStorage.setItem(
            "snapquote_unsent_capture_draft",
            JSON.stringify({
                version: 1,
                updatedAt: new Date().toISOString(),
                captureIntent: "type",
                transcribedText: "Old typed notes that should stay out of photo capture.",
                photoContext: "",
                generateWorkflow: "standard",
                sourceLanguage: "auto",
                projectType: "residential",
                clientName: "",
                clientAddress: "",
                clientEmail: "",
                clientPhone: "",
                clientNotes: "",
                clientDetailsOpen: false,
            })
        )
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=photos")

    await expect(page.getByTestId("photo-capture-action")).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByTestId("type-capture-action")).toHaveAttribute("aria-pressed", "false")
    await expect(page.getByTestId("job-description-input")).toHaveValue("")
    await expect(page.getByTestId("toast-message")).toHaveCount(0)
})

test("typed capture can save field notes as a local draft before generating", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")
    await expect(page.getByTestId("input-save-capture-draft-button")).toBeDisabled()

    await page.getByTestId("job-description-input").fill(
        "Replace leaking laundry valve, install new shutoff, test pressure, and clean work area."
    )
    await page.getByTestId("input-add-client-details-button").click()
    await expect(page.getByTestId("input-client-details-fields")).toBeVisible()
    await page.getByPlaceholder("Client name").fill("Capture Draft Client")
    await page.getByPlaceholder("Job address").fill("12 Draft Lane")
    await page.waitForFunction(() => Boolean(window.localStorage.getItem("snapquote_unsent_capture_draft")))

    await expect(page.getByTestId("input-save-capture-draft-button")).toBeEnabled()
    await page.getByTestId("input-save-capture-draft-button").click()

    await expect(page.getByTestId("toast-message")).toContainText("Field capture saved to Drafts.")
    await expect.poll(
        async () => page.evaluate(() => window.localStorage.getItem("snapquote_unsent_capture_draft"))
    ).toBeNull()

    const savedCaptureDraft = await page.evaluate(async () => {
        const request = indexedDB.open("snapquote-db")
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
        const transaction = database.transaction("estimates", "readonly")
        const estimates = await new Promise<Array<{
            attachments?: { originalTranscript?: string }
            clientAddress?: string
            clientName?: string
            items?: unknown[]
            status?: string
            summary_note?: string
            totalAmount?: number
        }>>((resolve, reject) => {
            const getAllRequest = transaction.objectStore("estimates").getAll()
            getAllRequest.onerror = () => reject(getAllRequest.error)
            getAllRequest.onsuccess = () => resolve(getAllRequest.result)
        })
        database.close()
        return estimates.find((estimate) => estimate.clientName === "Capture Draft Client") || null
    })

    expect(savedCaptureDraft).toMatchObject({
        clientAddress: "12 Draft Lane",
        clientName: "Capture Draft Client",
        items: [],
        status: "draft",
        summary_note: expect.stringContaining("Replace leaking laundry valve"),
        totalAmount: 0,
        attachments: {
            originalTranscript: expect.stringContaining("Replace leaking laundry valve"),
        },
    })
})

test("saved capture draft reopens in input and saves the generated estimate over the same draft", async ({ page }) => {
    await mockGeneratedEstimate(page)
    const draftId = "capture-resume-draft"
    const fieldNotes = "Replace leaking laundry valve, install new shutoff, test pressure, and clean work area."

    await seedLocalEstimates(page, [
        {
            id: draftId,
            estimateNumber: "EST-2605-CAPTURE",
            status: "draft",
            clientName: "Capture Resume Client",
            clientAddress: "88 Resume Rd",
            summary_note: fieldNotes,
            taxRate: 8.25,
            taxAmount: 0,
            totalAmount: 0,
            createdAt: "2026-05-24T08:00:00.000Z",
            updatedAt: "2026-05-24T08:05:00.000Z",
            synced: false,
            items: [],
            attachments: {
                photos: [],
                originalTranscript: fieldNotes,
            },
        },
    ])

    await page.goto(`/new-estimate?draftId=${draftId}`)

    await expect(page.getByTestId("toast-message")).toContainText("Field capture loaded. Generate when ready.")
    await expect(page.getByTestId("job-description-input")).toHaveValue(fieldNotes)
    await expect(page.getByPlaceholder("Client name")).toHaveValue("Capture Resume Client")
    await expect(page.getByPlaceholder("Job address")).toHaveValue("88 Resume Rd")
    await expect(page.getByTestId("input-client-generate-button")).toContainText("Generate for Capture Resume Client")

    await page.getByTestId("input-client-generate-button").click()

    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("line-item-description-0")).toHaveValue("Replace shower cartridge")
    await page.getByTestId("result-quick-save-button").click()
    await expect(page.getByTestId("toast-message")).toContainText("Estimate saved successfully.")

    const storedEstimate = await page.evaluate(async (id) => {
        const request = indexedDB.open("snapquote-db")
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
        const transaction = database.transaction("estimates", "readonly")
        const estimate = await new Promise<{
            attachments?: { originalTranscript?: string }
            clientAddress?: string
            clientName?: string
            estimateNumber?: string
            id?: string
            items?: unknown[]
            status?: string
            totalAmount?: number
        } | undefined>((resolve, reject) => {
            const getRequest = transaction.objectStore("estimates").get(id)
            getRequest.onerror = () => reject(getRequest.error)
            getRequest.onsuccess = () => resolve(getRequest.result)
        })
        database.close()
        return estimate || null
    }, draftId)

    expect(storedEstimate).toMatchObject({
        id: draftId,
        estimateNumber: "EST-2605-CAPTURE",
        clientName: "Capture Resume Client",
        clientAddress: "88 Resume Rd",
        status: "draft",
        attachments: {
            originalTranscript: fieldNotes,
        },
    })
    expect(storedEstimate?.items?.length).toBeGreaterThan(0)
    expect(storedEstimate?.totalAmount).toBeGreaterThan(0)
})

test("saved photo capture draft restores the photo and sends photo context for generation", async ({ page }) => {
    const generatePayload: { current: Record<string, unknown> | null } = { current: null }
    await mockGeneratedEstimate(page, (payload) => {
        generatePayload.current = payload
    })
    const draftId = "photo-capture-resume-draft"
    const fieldNotes = "Replace leaking laundry valve and inspect corrosion around the old shutoff."
    const photoContext = "Laundry room cabinet, corrosion visible near the existing valve."

    await seedLocalEstimates(page, [
        {
            id: draftId,
            estimateNumber: "EST-2605-PHOTO",
            status: "draft",
            clientName: "",
            clientAddress: "",
            summary_note: `${fieldNotes}\n\nPhoto context: ${photoContext}`,
            taxRate: 8.25,
            taxAmount: 0,
            totalAmount: 0,
            createdAt: "2026-05-24T09:00:00.000Z",
            updatedAt: "2026-05-24T09:05:00.000Z",
            synced: false,
            items: [],
            attachments: {
                photos: [tinySitePhotoDataUrl],
                originalTranscript: fieldNotes,
            },
        },
    ])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/new-estimate?draftId=${draftId}`)

    await expect(page.getByTestId("toast-message")).toContainText("Field capture loaded. Generate when ready.")
    await expect(page.getByTestId("job-description-input")).toHaveValue(fieldNotes)
    await expect(page.getByAltText("Site photo 1")).toBeVisible()
    await expect(page.getByTestId("quick-generate-button")).toBeVisible()

    await page.getByTestId("quick-generate-button").click()

    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    expect(generatePayload.current).not.toBeNull()
    if (!generatePayload.current) throw new Error("Generate payload was not captured.")
    const capturedGeneratePayload = generatePayload.current
    expect(capturedGeneratePayload).toMatchObject({
        workflow: "standard",
        notes: expect.stringContaining(fieldNotes),
    })
    expect(capturedGeneratePayload.notes).toEqual(expect.stringContaining(`Photo context: ${photoContext}`))
    expect(capturedGeneratePayload.images).toEqual([tinySitePhotoDataUrl])
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
    await expect(page.getByTestId("input-scope-detail-status")).toHaveText("Quote-ready scope")
    await expect(page.getByTestId("quick-generate-scope-helper")).toHaveText("Ready.")

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
    await expect(page.getByTestId("result-review-lines-button")).toContainText("Lines")
    await expect(page.getByTestId("result-payment-link-button")).toContainText("Payment")
    await expectTouchTarget(page.getByTestId("result-review-lines-button"))
    await expectTouchTarget(page.getByTestId("result-payment-link-button"))
    await expect(page.getByTestId("result-quick-sms-label")).toHaveText("Text")
    await expect(page.getByTestId("result-quick-preview-label")).toHaveText("View")
    await expect(page.getByTestId("result-quick-pdf-label")).toHaveText("PDF")
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
    await expect(page.getByTestId("result-quick-save-label")).toHaveText("Save")
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

test("receipt scanner keeps failed uploads recoverable with retry and manual fallback", async ({ page }) => {
    await mockGeneratedEstimate(page)
    let parseAttempts = 0
    await page.route("**/api/parse-receipt", async (route) => {
        parseAttempts += 1

        if (parseAttempts === 1) {
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ error: "No parsable line items found" }),
            })
            return
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                items: [
                    {
                        id: "receipt-retry-item",
                        description: "Retry parsed receipt materials",
                        quantity: 1,
                        unit_price: 74.25,
                        total: 74.25,
                        confidence_score: 0.92,
                    },
                ],
                warnings: [],
            }),
        })
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")

    await page.getByTestId("job-description-input").fill("Replace shower cartridge and import receipt materials.")
    await page.getByTestId("quick-generate-button").click()
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")

    await page.getByTestId("result-review-lines-button").click()
    await page.getByRole("button", { name: "Scan Receipt" }).click()
    await page.getByTestId("receipt-scanner-file-input").setInputFiles({
        name: "receipt.png",
        mimeType: "image/png",
        buffer: tinySitePhotoPng,
    })
    await page.getByTestId("receipt-scanner-context-input").fill("Ferguson receipt for retry test")
    await expect(page.getByAltText("Receipt Preview")).toBeVisible()

    await page.getByTestId("receipt-scanner-submit-action").click()

    const receiptParseIssue = page.getByTestId("receipt-scanner-parse-issue")
    await expect(receiptParseIssue).toBeVisible()
    await expect(page.getByTestId("receipt-scanner-parse-title")).toHaveText("Receipt could not be read")
    await expect(page.getByTestId("receipt-scanner-parse-message")).toContainText("Keep the photo selected")
    await expect(page.getByTestId("receipt-scanner-context-input")).toHaveValue("Ferguson receipt for retry test")
    await expect(page.getByAltText("Receipt Preview")).toBeVisible()
    await expect(page.getByTestId("receipt-scanner-retry-action")).toContainText("Retry scan")
    await expect(page.getByTestId("receipt-scanner-manual-action")).toContainText("Manual line entry")
    await expect(page.getByTestId("receipt-scanner-keep-editing-action")).toContainText("Keep editing")
    await expectTouchTarget(page.getByTestId("receipt-scanner-retry-action"))
    await expectTouchTarget(page.getByTestId("receipt-scanner-manual-action"))
    expect(parseAttempts).toBe(1)

    await page.getByTestId("receipt-scanner-retry-action").click()

    await expect.poll(() => parseAttempts).toBe(2)
    await expect(page.getByRole("dialog", { name: "AI Material Receipt Scanner" })).toHaveCount(0)
    await expect(page.getByTestId("line-item-description-2")).toHaveValue("Retry parsed receipt materials")
    await expect(page.getByTestId("toast-message")).toContainText("Receipt parsed successfully.")
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
    await page.getByTestId("result-client-details-button").click()
    await page.getByTestId("result-client-name-input").fill("Line Gate Client")
    await page.getByTestId("result-client-email-input").fill("line-gate@example.com")
    await expect(page.getByTestId("result-send-readiness-status")).toContainText("Ready to send")
    await expect(page.getByTestId("result-quick-send-button")).toBeVisible()

    await page.getByRole("button", { name: "Add Item" }).click()

    await expect(page.getByTestId("result-send-readiness-status")).toContainText("1 fix before send")
    await expect(page.getByTestId("result-readiness-strip")).toContainText("2 line fixes")
    await expect(page.getByTestId("result-fix-lines-before-send-button")).toContainText("Fix lines")
    await expect(page.getByTestId("result-quick-send-button")).toHaveCount(0)
    await expect(page.getByTestId("line-review-status")).toHaveText("2 fixes before sending")
    await expect(page.getByTestId("line-review-description-status")).toHaveText("1 missing")
    await expect(page.getByTestId("line-review-pricing-status")).toHaveText("1 zero price")
    await expect(page.getByTestId("line-review-quantity-status")).toHaveText("Checked")
    await page.getByTestId("result-fix-lines-before-send-button").click()
    await expect(page.getByTestId("line-items-review-summary")).toBeVisible()
    await page.waitForFunction(() => {
        const qualityGate = document.querySelector('[data-testid="line-review-quality-gate"]')
        const nav = document.querySelector('[data-testid="bottom-navigation"]')
        if (!qualityGate || !nav) return false

        const qualityGateBox = qualityGate.getBoundingClientRect()
        const navBox = nav.getBoundingClientRect()
        return qualityGateBox.bottom <= navBox.top - 8
    })

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

test("share PDF failure stays visible with retry and download fallback", async ({ page }) => {
    await mockGeneratedEstimate(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")

    await page.getByTestId("job-description-input").fill("Replace shower cartridge and recover from failed PDF share.")
    await page.getByTestId("quick-generate-button").click()
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await page.getByTestId("result-confirm-scope-assumptions-button").click()
    await page.getByTestId("result-client-details-button").click()
    await page.getByTestId("result-client-name-input").fill("Share Failure Client")
    await page.evaluate(() => {
        Object.defineProperty(navigator, "canShare", {
            value: () => true,
            configurable: true,
        })
        Object.defineProperty(navigator, "share", {
            value: async () => {
                throw new Error("Native share failed after PDF was prepared")
            },
            configurable: true,
        })
    })

    await page.getByTestId("result-share-pdf-button").click()

    const pdfDeliveryIssue = page.getByTestId("pdf-delivery-issue")
    await expect(pdfDeliveryIssue).toBeVisible()
    await expect(page.getByTestId("handoff-actions-status")).toHaveText("Retry PDF")
    await expect(page.getByTestId("pdf-delivery-issue-title")).toHaveText("PDF share did not finish")
    await expect(page.getByTestId("pdf-delivery-issue-message")).toContainText("download the PDF and send it manually")
    await expect(page.getByTestId("pdf-delivery-retry-share-action")).toContainText("Retry share")
    await expect(page.getByTestId("pdf-delivery-download-action")).toContainText("Download PDF")
    await expect(page.getByTestId("pdf-delivery-preview-action")).toContainText("Preview PDF")
    await expectTouchTarget(page.getByTestId("pdf-delivery-retry-share-action"))
    await expectTouchTarget(page.getByTestId("pdf-delivery-download-action"))

    const downloadPromise = page.waitForEvent("download")
    await page.getByTestId("pdf-delivery-download-action").click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/^EST-\d{4}-\d{3}-share-failure-client-estimate\.pdf$/)
    await expect(pdfDeliveryIssue).toHaveCount(0)
    await expect(page.getByText(/PDF downloaded as EST-\d{4}-\d{3}-share-failure-client-estimate\.pdf\./)).toBeVisible()
})

test("signed-in share PDF fallback creates and persists a customer approval link", async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, "share", { value: undefined, configurable: true })
        Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true })
    })
    await mockGeneratedEstimate(page)
    await mockSignedInBilling(page)

    let shareLinkPayload: Record<string, unknown> | null = null
    await page.route("**/api/estimates/*/share-link", async (route) => {
        shareLinkPayload = route.request().postDataJSON() as Record<string, unknown>
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: true,
                shareUrl: "https://snapquote.test/q/share-pdf-token",
                portal: { status: "shared" },
            }),
        })
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate?capture=type")
    await seedAuthenticatedSupabaseSession(page)

    await page.getByTestId("job-description-input").fill(
        "Replace shower cartridge for customer bathroom access, include cleanup, and share an approval-ready PDF."
    )
    await page.getByTestId("quick-generate-button").click()
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await page.getByTestId("result-client-details-button").click()
    await page.getByTestId("result-client-name-input").fill("Share Portal Client")

    const downloadPromise = page.waitForEvent("download")
    await page.getByTestId("result-share-pdf-button").click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/^EST-\d{4}-\d{3}-share-portal-client-estimate\.pdf$/)
    await expect(page.getByText("PDF downloaded. Approval link copied and estimate marked sent.")).toBeVisible()
    expect(shareLinkPayload).toMatchObject({
        resetCustomerDecision: true,
        estimate: {
            clientName: "Share Portal Client",
            estimateNumber: expect.stringMatching(/^EST-/),
        },
    })

    const storedEstimates = await readStoredEstimateApprovals(page)
    expect(storedEstimates).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                clientName: "Share Portal Client",
                status: "sent",
                customerPortalUrl: "https://snapquote.test/q/share-pdf-token",
                customerPortalStatus: "shared",
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
    await expect(page.getByTestId("result-payment-link-button")).toContainText("payment")
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
    await page.getByTestId("job-description-input").click()
    await page.keyboard.type("Replace leaking shower cartridge, test valve operation, and clean the work area.")
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
    await expect(page.getByTestId("result-quick-send-button")).toContainText("Email")

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

test("customer change request duplicates keep revision context visible and saved", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(() => {
        window.localStorage.setItem(
            "duplicate_estimate",
            JSON.stringify({
                items: [
                    {
                        id: "revision-item-1",
                        itemNumber: 1,
                        category: "SERVICE",
                        description: "Panel cleanup and disposal",
                        quantity: 1,
                        unit: "LS",
                        unit_price: 1200,
                        total: 1200,
                    },
                ],
                summary_note: "Revision for requested disposal line.",
                clientName: "Revision Customer",
                clientAddress: "44 Revision Rd",
                clientEmail: "revision@example.test",
                clientNotes: "Customer requested changes on May 29: Please add disposal haul-away before approval.",
                taxRate: 13,
                revisionContext: {
                    originalEstimateId: "original-estimate-1",
                    originalEstimateNumber: "EST-ORIGINAL-001",
                    requestedAt: "2026-05-29T18:00:00.000Z",
                    customerName: "Revision Customer",
                    customerEmail: "revision@example.test",
                    note: "Please add disposal haul-away before approval.",
                },
            })
        )
    })

    await page.goto("/new-estimate")

    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("customer-revision-context")).toBeVisible()
    await expect(page.getByTestId("customer-revision-customer")).toHaveText("Revision Customer")
    await expect(page.getByTestId("customer-revision-context")).toContainText("Original #EST-ORIGINAL-001")
    await expect(page.getByTestId("customer-revision-note")).toContainText("Please add disposal haul-away")

    await page.getByTestId("result-client-name-input").fill("Revision Customer Updated")
    await page.getByTestId("result-quick-save-button").click()
    await expect(page.getByTestId("toast-message")).toContainText("Estimate saved successfully.")

    const storedRevisionDraft = await page.evaluate(async () => {
        const request = indexedDB.open("snapquote-db")
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
        const transaction = database.transaction("estimates", "readonly")
        const estimates = await new Promise<Array<{
            clientName?: string
            clientNotes?: string
            revisionOfEstimateId?: string
            revisionOfEstimateNumber?: string
        }>>((resolve, reject) => {
            const getAllRequest = transaction.objectStore("estimates").getAll()
            getAllRequest.onerror = () => reject(getAllRequest.error)
            getAllRequest.onsuccess = () => resolve(getAllRequest.result)
        })
        database.close()
        return estimates.find((estimate) => estimate.clientName === "Revision Customer Updated") || null
    })

    expect(storedRevisionDraft).not.toBeNull()
    expect(storedRevisionDraft?.clientNotes).toContain("Please add disposal haul-away before approval.")
    expect(storedRevisionDraft?.revisionOfEstimateId).toBe("original-estimate-1")
    expect(storedRevisionDraft?.revisionOfEstimateNumber).toBe("EST-ORIGINAL-001")
})

test("demo quote button loads a tutorial draft for first-time practice", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/new-estimate")

    await page.getByTestId("load-demo-quote-button").click()

    await expect(page.getByTestId("demo-tutorial-banner")).toBeVisible()
    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.getByTestId("result-quick-actions")).toBeVisible()
    await expect(page.getByTestId("result-send-readiness-status")).toContainText("1 fix before send")
    await expect(page.getByTestId("result-quick-actions")).toContainText("Clear the remaining send checks before delivery.")
    await expect(page.getByTestId("result-add-contact-button")).toContainText("Email")
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

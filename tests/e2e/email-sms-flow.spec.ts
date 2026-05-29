import { expect, test, type BrowserContext, type Locator } from "@playwright/test"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local", quiet: true })

const MOCK_ESTIMATE_RESPONSE = {
    items: [
        {
            id: "item-1",
            itemNumber: 1,
            category: "PARTS",
            description: "Replace shutoff valve",
            quantity: 1,
            unit: "ea",
            unit_price: 85,
            total: 85,
        },
        {
            id: "item-2",
            itemNumber: 2,
            category: "LABOR",
            description: "Install and test valve",
            quantity: 1,
            unit: "hr",
            unit_price: 95,
            total: 95,
        },
    ],
    summary_note: "Replace leaking shutoff valve under kitchen sink.",
    payment_terms: "Due on completion.",
    closing_note: "Thank you for choosing us.",
    warnings: [],
}

const LONG_ESTIMATE_RESPONSE = {
    ...MOCK_ESTIMATE_RESPONSE,
    items: Array.from({ length: 8 }, (_, index) => ({
        id: `long-item-${index + 1}`,
        itemNumber: index + 1,
        category: index % 2 === 0 ? "PARTS" : "LABOR",
        description: `Finish item ${index + 1} with a detailed customer-facing description`,
        quantity: index + 1,
        unit: index % 2 === 0 ? "ea" : "hr",
        unit_price: 45 + index * 10,
        total: (index + 1) * (45 + index * 10),
    })),
    summary_note: "Complete a multi-step finish repair with material pickup, prep, installation, cleanup, and final testing.",
}

const LONG_UNBROKEN_PDF_RESPONSE = {
    ...MOCK_ESTIMATE_RESPONSE,
    items: [
        {
            id: "unbroken-item-1",
            itemNumber: 1,
            category: "SPECIALTY-COMMERCIAL-ROOF-DRAIN-EMERGENCY",
            description: "CommercialRoofDrainEmergencyRepairForNorthWarehouseLoadingDockWithNoNaturalSpacesForWrapping",
            quantity: 1,
            unit: "verylongunitlabel",
            unit_price: 1845,
            total: 1845,
        },
        {
            id: "unbroken-item-2",
            itemNumber: 2,
            category: "LABOR",
            description: "Final water test and customer handoff documentation",
            quantity: 2,
            unit: "hr",
            unit_price: 125,
            total: 250,
        },
    ],
    summary_note: "Stabilize CommercialRoofDrainEmergencyRepairForNorthWarehouseLoadingDock and document next-step maintenance recommendations.",
}

async function expectTouchTarget(locator: Locator) {
    const box = await locator.boundingBox()

    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
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

test.describe("Email sending flow", () => {
    test("email modal opens and validates email address", async ({ page }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Replace leaking shutoff valve under kitchen sink.")
        await page.getByTestId("generate-estimate-button").click()

        // Wait for result step
        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await expect(page.getByTestId("result-client-details-button")).toHaveText("Add customer")
        await expect(page.getByRole("button", { name: /send to customer/i })).toHaveCount(0)
        await page.getByTestId("result-client-details-button").click()
        await page.getByTestId("result-client-name-input").fill("Email Validation Client")
        await page.getByTestId("result-client-email-input").fill("validation@example.com")

        // Open email modal
        await page.getByTestId("result-quick-send-button").click()

        // Verify modal opened
        const emailDialog = page.getByRole("dialog", { name: "Send Estimate" })
        await expect(emailDialog).toBeVisible()
        await expect(page.getByRole("heading", { name: /send estimate/i })).toBeVisible()
        await expect(page.getByTestId("email-delivery-summary")).toBeVisible()
        await expect(page.getByTestId("email-recipient-status")).toHaveText("Ready")
        await expect(page.getByTestId("email-payment-link-status")).toHaveText("Not attached")

        // Try submitting with invalid email
        await page.getByLabel(/customer email/i).fill("not-an-email")
        await expect(page.getByTestId("email-recipient-status")).toHaveText("Check")
        await page.getByRole("button", { name: /send email/i }).click()
        await expect(page.getByText(/valid email/i)).toBeVisible()

        // Close modal
        await page.getByRole("button", { name: /cancel/i }).click()
        await expect(emailDialog).not.toBeVisible()
    })

    test("email sends successfully with mocked API", async ({ page }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.route("**/api/send-email", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ ok: true, messageId: "mock-email-id" }),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Replace leaking shutoff valve.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await page.getByTestId("result-client-details-button").click()
        await page.getByTestId("result-client-name-input").fill("Email Success Client")
        await page.getByTestId("result-client-email-input").fill("client@example.com")
        await page.getByTestId("result-quick-send-button").click()
        await expect(page.getByLabel(/customer email/i)).toHaveValue("client@example.com")
        await expect(page.getByTestId("email-recipient-status")).toHaveText("Ready")
        await page.getByRole("button", { name: /send email/i }).click()

        // Modal should close on success
        await expect(page.getByRole("heading", { name: /send estimate/i })).not.toBeVisible({ timeout: 5000 })
    })

    test("email shows quota error when API returns 402", async ({ page }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.route("**/api/send-email", async (route) => {
            await route.fulfill({
                status: 402,
                contentType: "application/json",
                body: JSON.stringify({ error: "Monthly email quota reached" }),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Replace leaking shutoff valve.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await page.getByTestId("result-client-details-button").click()
        await page.getByTestId("result-client-name-input").fill("Email Quota Client")
        await page.getByTestId("result-client-email-input").fill("client@example.com")
        await page.getByTestId("result-quick-send-button").click()
        await expect(page.getByLabel(/customer email/i)).toHaveValue("client@example.com")
        await page.getByRole("button", { name: /send email/i }).click()

        const deliveryIssue = page.getByTestId("email-delivery-issue")
        await expect(deliveryIssue).toBeVisible({ timeout: 10_000 })
        await expect(deliveryIssue).toContainText("Upgrade to keep emailing PDFs")
        await expect(deliveryIssue).toContainText("Monthly email quota reached")
        await expect(page.getByTestId("email-delivery-action")).toHaveAttribute("href", "/pricing")
        await expect(page.getByTestId("email-delivery-retry-action")).toBeVisible()
        await expect(page.getByRole("dialog", { name: "Send Estimate" })).toBeVisible()

        await page.getByTestId("email-delivery-retry-action").click()
        await expect(deliveryIssue).toBeVisible()
    })

    test("PDF preview email keeps quota failure visible with recovery actions", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })

        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.route("**/api/send-email", async (route) => {
            await route.fulfill({
                status: 402,
                contentType: "application/json",
                body: JSON.stringify({
                    error: "Monthly email quota reached",
                    code: "FREE_PLAN_LIMIT_REACHED",
                }),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Replace leaking shutoff valve.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await page.getByTestId("result-quick-preview-button").click()

        const previewDialog = page.getByRole("dialog", { name: "PDF Preview" })
        await expect(previewDialog).toBeVisible()
        await expect(page.getByTestId("pdf-preview-review-panel")).toBeVisible({ timeout: 10_000 })
        await expect(page.getByTestId("pdf-preview-review-line-item")).toHaveCount(2)
        await expectTouchTarget(page.getByTestId("pdf-preview-review-tab"))
        await expectTouchTarget(page.getByTestId("pdf-preview-pdf-tab"))
        await page.getByTestId("pdf-preview-pdf-tab").click()
        await expect(page.getByTitle("PDF Preview")).toBeVisible({ timeout: 10_000 })
        await page.getByTestId("pdf-preview-review-tab").click()

        await previewDialog.getByRole("button", { name: "Email" }).click()
        await expect(page.getByTestId("pdf-preview-recipient-status")).toHaveText("Needed")
        await expectTouchTarget(previewDialog.getByLabel("Client email"))
        await previewDialog.getByLabel("Client email").fill("client@example.com")
        await expect(page.getByTestId("pdf-preview-recipient-status")).toHaveText("Ready")
        await previewDialog.getByRole("button", { name: "Send" }).click()

        const deliveryIssue = page.getByTestId("pdf-preview-email-issue")
        await expect(deliveryIssue).toBeVisible({ timeout: 5_000 })
        await expect(deliveryIssue).toContainText("Upgrade to keep emailing PDFs")
        await expect(deliveryIssue).toContainText("Monthly email quota reached")
        await expect(page.getByTestId("pdf-preview-email-action")).toHaveAttribute("href", "/pricing")
        await expect(page.getByTestId("pdf-preview-email-retry-action")).toBeVisible()
        await expect(previewDialog.getByLabel("Client email")).toBeVisible()

        const previewEmailFieldBox = await previewDialog.getByLabel("Client email").boundingBox()
        expect(previewEmailFieldBox).not.toBeNull()
        expect(previewEmailFieldBox!.y).toBeGreaterThanOrEqual(0)
        expect(previewEmailFieldBox!.y + previewEmailFieldBox!.height).toBeLessThanOrEqual(844)

        const previewFooterBox = await page.getByTestId("pdf-preview-action-footer").boundingBox()
        expect(previewFooterBox).not.toBeNull()
        expect(previewFooterBox!.y + previewFooterBox!.height).toBeLessThanOrEqual(844)

        await page.getByTestId("pdf-preview-email-retry-action").click()
        await expect(deliveryIssue).toBeVisible()
    })

    test("PDF preview keeps long line item estimates reviewable on mobile", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(LONG_ESTIMATE_RESPONSE),
            })
        })

        await page.goto("/new-estimate?capture=type")
        await page.getByTestId("job-description-input").fill("Build a detailed finish repair estimate with many tasks.")
        await page.getByTestId("quick-generate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await page.getByTestId("result-quick-preview-button").click()

        await expect(page.getByTestId("pdf-preview-review-panel")).toBeVisible({ timeout: 10_000 })
        await expect(page.getByTestId("pdf-preview-review-item-count")).toHaveText("8 items")
        await expect(page.getByTestId("pdf-preview-review-line-item")).toHaveCount(8)
        await expect(page.getByText("Scroll this preview to review all 8 line items")).toBeVisible()

        const reviewPanel = page.getByTestId("pdf-preview-review-panel")
        const lastPreviewItem = reviewPanel.getByText("Finish item 8 with a detailed customer-facing description")
        await lastPreviewItem.scrollIntoViewIfNeeded()
        await expect(lastPreviewItem).toBeVisible()

        const actionFooterBox = await page.getByTestId("pdf-preview-action-footer").boundingBox()
        expect(actionFooterBox).not.toBeNull()
        expect(actionFooterBox!.y + actionFooterBox!.height).toBeLessThanOrEqual(844)
    })

    test("PDF preview contains long customer and line-item text on mobile", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(LONG_UNBROKEN_PDF_RESPONSE),
            })
        })

        await page.goto("/new-estimate?capture=type")
        await page.getByTestId("job-description-input").fill("Build a roof drain repair estimate with unbroken customer-facing names.")
        await page.getByTestId("quick-generate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await page.getByTestId("result-client-details-button").click()
        await page.getByTestId("result-client-name-input").fill("NorthShoreCommercialFacilitiesCustomerWithExtremelyLongLegalName")
        await page.getByTestId("result-client-address-input").fill("DockSevenNorthWarehouseMechanicalPenthouseAccessCorridorWithoutNaturalSpaces")
        await page.getByTestId("result-quick-preview-button").click()

        const reviewPanel = page.getByTestId("pdf-preview-review-panel")
        const clientName = page.getByTestId("pdf-preview-review-client-name")
        const clientAddress = page.getByTestId("pdf-preview-review-client-address")
        const longDescription = reviewPanel.getByText("CommercialRoofDrainEmergencyRepairForNorthWarehouseLoadingDockWithNoNaturalSpacesForWrapping")

        await expect(reviewPanel).toBeVisible({ timeout: 10_000 })
        await expect(clientName).toContainText("NorthShoreCommercial")
        await expect(clientAddress).toContainText("DockSevenNorthWarehouse")
        await expect(longDescription).toBeVisible()

        const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
        const reviewPanelFits = await reviewPanel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
        const clientNameFits = await clientName.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
        const clientAddressFits = await clientAddress.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
        const descriptionFitFlags = await page.getByTestId("pdf-preview-review-line-description").evaluateAll((elements) =>
            elements.map((element) => element.scrollWidth <= element.clientWidth + 1)
        )
        const actionFooterBox = await page.getByTestId("pdf-preview-action-footer").boundingBox()

        expect(pageFits).toBe(true)
        expect(reviewPanelFits).toBe(true)
        expect(clientNameFits).toBe(true)
        expect(clientAddressFits).toBe(true)
        expect(descriptionFitFlags.every(Boolean)).toBe(true)
        expect(actionFooterBox).not.toBeNull()
        expect(actionFooterBox!.y + actionFooterBox!.height).toBeLessThanOrEqual(844)
    })
})

test.describe("Client delivery prefill", () => {
    test("started client quote preloads email and phone into delivery modals", async ({ page }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.goto("/clients")
        await page.getByRole("button", { name: "New" }).click()
        await page.getByPlaceholder("Customer name").fill("Delivery Ready Client")
        await page.getByPlaceholder("(555) 123-4567").fill("+14165550123")
        await page.getByPlaceholder("client@example.com").fill("delivery-ready@example.com")
        await page.getByPlaceholder("Service address").fill("22 Dispatch Ave")
        await page.getByRole("button", { name: "Save Client" }).click()

        await page.getByRole("button", { name: "Start quote for Delivery Ready Client" }).click()
        await expect(page).toHaveURL(/\/new-estimate\?capture=type$/)
        await expect(page.getByTestId("input-client-details-summary")).toContainText("Delivery Ready Client")
        await expect(page.getByTestId("input-client-details-summary")).toContainText("22 Dispatch Ave")

        await page.getByTestId("job-description-input").fill("Replace leaking shutoff valve under kitchen sink.")
        await page.getByTestId("input-client-generate-button").click()
        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await expect(page.getByTestId("result-readiness-strip")).toContainText("Contact ready")
        await expect(page.getByTestId("result-client-delivery-summary")).toContainText("delivery-ready@example.com")
        await expect(page.getByTestId("result-client-delivery-summary")).toContainText("+14165550123")
        await expect(page.getByTestId("result-client-email-input")).toHaveCount(0)
        await expect(page.getByTestId("result-client-phone-input")).toHaveCount(0)

        await page.getByRole("button", { name: /send to customer/i }).click()
        await expect(page.getByLabel(/customer email/i)).toHaveValue("delivery-ready@example.com")
        await expect(page.getByTestId("email-recipient-status")).toHaveText("Ready")
        await page.getByRole("button", { name: /cancel/i }).click()

        await page.getByRole("button", { name: /send via sms/i }).click()
        await expect(page.getByLabel(/customer phone/i)).toHaveValue("+14165550123")
        await expect(page.getByTestId("sms-recipient-status")).toHaveText("Ready")
        await expect(page.getByRole("button", { name: /send sms/i })).toBeEnabled()
    })
})

test.describe("SMS sending flow", () => {
    test("SMS modal opens and validates phone number format", async ({ page }) => {
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

        // Open SMS modal
        await page.getByRole("button", { name: /send via sms/i }).click()

        // Verify modal opened
        const smsDialog = page.getByRole("dialog", { name: "Send via SMS" })
        await expect(smsDialog).toBeVisible()
        await expect(page.getByRole("heading", { name: /send via sms/i })).toBeVisible()
        await expect(page.getByTestId("sms-delivery-summary")).toBeVisible()
        await expect(page.getByTestId("sms-recipient-status")).toHaveText("Needed")
        await expect(page.getByTestId("sms-payment-link-status")).toHaveText("Not attached")
        await expect(page.getByTestId("sms-message-length")).toBeVisible()

        // Send button should be disabled with invalid phone
        await page.getByLabel(/customer phone/i).fill("1234567")
        await expect(page.getByTestId("sms-recipient-status")).toHaveText("Check")
        const sendBtn = page.getByRole("button", { name: /send sms/i })
        await expect(sendBtn).toBeDisabled()

        // Valid E.164 format enables the button
        await page.getByLabel(/customer phone/i).fill("+14165550123")
        await expect(page.getByTestId("sms-recipient-status")).toHaveText("Ready")
        await expect(sendBtn).toBeEnabled()

        // Close modal
        await page.getByRole("button", { name: /cancel/i }).click()
        await expect(smsDialog).not.toBeVisible()
    })

    test("SMS sends successfully with mocked API", async ({ page }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.route("**/api/send-sms", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ ok: true, messageId: "SM123", creditsRemaining: 4 }),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Replace leaking shutoff valve.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await page.getByRole("button", { name: /send via sms/i }).click()
        await page.getByLabel(/customer phone/i).fill("+14165550123")
        await page.getByRole("button", { name: /send sms/i }).click()

        // Modal should close on success
        await expect(page.getByRole("heading", { name: /send via sms/i })).not.toBeVisible({ timeout: 5000 })
    })

    test("SMS shows credits error when API returns 402", async ({ page }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.route("**/api/send-sms", async (route) => {
            await route.fulfill({
                status: 402,
                contentType: "application/json",
                body: JSON.stringify({ error: "Insufficient SMS credits" }),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Replace leaking shutoff valve.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await page.getByRole("button", { name: /send via sms/i }).click()
        await page.getByLabel(/customer phone/i).fill("+14165550123")
        await page.getByRole("button", { name: /send sms/i }).click()

        const deliveryIssue = page.getByTestId("sms-delivery-issue")
        await expect(deliveryIssue).toBeVisible({ timeout: 5000 })
        await expect(deliveryIssue).toContainText("Add SMS credits before sending")
        await expect(deliveryIssue).toContainText("Insufficient SMS credits")
        await expect(page.getByTestId("sms-delivery-action")).toHaveAttribute("href", "/pricing")
        await expect(page.getByTestId("sms-delivery-retry-action")).toBeVisible()
        await expect(page.getByRole("dialog", { name: "Send via SMS" })).toBeVisible()

        await page.getByTestId("sms-delivery-retry-action").click()
        await expect(deliveryIssue).toBeVisible()
    })

    test("delivery modals keep long provider errors readable on narrow mobile", async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 700 })
        const longEmailError = [
            "EMAIL_PROVIDER_DELIVERY_FAILURE_FOR_FIELD_CREW_CUSTOMER_WITH_LONG_REFERENCE",
            "Resend rejected the request after the PDF attachment was prepared.",
        ].join(" ")
        const longSmsError = [
            "SMS_PROVIDER_DELIVERY_FAILURE_FOR_FIELD_CREW_CUSTOMER_WITH_LONG_REFERENCE",
            "Carrier filtering rejected the message after payment link text was prepared.",
        ].join(" ")

        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.route("**/api/send-email", async (route) => {
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ error: longEmailError }),
            })
        })

        await page.route("**/api/send-sms", async (route) => {
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ error: longSmsError }),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Replace leaking shutoff valve.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await page.getByTestId("result-client-details-button").click()
        await page.getByTestId("result-client-name-input").fill("Long Delivery Client")
        await page.getByTestId("result-client-email-input").fill("long-delivery@example.com")
        await page.getByTestId("result-quick-send-button").click()

        const emailDialog = page.getByRole("dialog", { name: "Send Estimate" })
        await expect(emailDialog).toBeVisible()
        await expect(page.getByTestId("email-delivery-summary")).toBeVisible()

        const emailFooterBox = await page.getByTestId("email-modal-footer").boundingBox()
        const emailSendButtonBox = await emailDialog.getByRole("button", { name: "Send Email" }).boundingBox()
        const emailDialogFits = await emailDialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
        expect(emailFooterBox).not.toBeNull()
        expect(emailFooterBox!.y + emailFooterBox!.height).toBeLessThanOrEqual(700)
        expect(emailSendButtonBox).not.toBeNull()
        expect(emailSendButtonBox!.height).toBeGreaterThanOrEqual(44)
        expect(emailDialogFits).toBe(true)

        await emailDialog.getByRole("button", { name: "Send Email" }).click()
        const emailIssue = page.getByTestId("email-delivery-issue")
        const emailIssueMessage = page.getByTestId("email-delivery-issue-message")
        await expect(emailIssue).toBeVisible({ timeout: 10_000 })
        await expect(emailIssueMessage).toContainText("EMAIL_PROVIDER_DELIVERY_FAILURE")
        await expect(page.getByTestId("toast-message")).toHaveCount(0)

        const emailPageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
        const emailIssueFits = await emailIssue.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
        const emailIssueMessageFits = await emailIssueMessage.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
        const emailRetryButtonBox = await page.getByTestId("email-delivery-retry-action").boundingBox()
        expect(emailPageFits).toBe(true)
        expect(emailIssueFits).toBe(true)
        expect(emailIssueMessageFits).toBe(true)
        expect(emailRetryButtonBox).not.toBeNull()
        expect(emailRetryButtonBox!.height).toBeGreaterThanOrEqual(44)
        await expect.poll(async () => {
            const issueBox = await emailIssue.boundingBox()
            const footerBox = await page.getByTestId("email-modal-footer").boundingBox()

            return Boolean(issueBox && footerBox && issueBox.y + issueBox.height <= footerBox.y + 1)
        }).toBe(true)

        await emailDialog.getByRole("button", { name: "Cancel" }).click()
        await expect(emailDialog).not.toBeVisible()

        await page.getByTestId("result-quick-sms-button").click()
        const smsDialog = page.getByRole("dialog", { name: "Send via SMS" })
        await expect(smsDialog).toBeVisible()
        await expect(page.getByTestId("sms-delivery-summary")).toBeVisible()
        await smsDialog.getByLabel(/customer phone/i).fill("+14165550123")

        const smsFooterBox = await page.getByTestId("sms-modal-footer").boundingBox()
        const smsSendButtonBox = await smsDialog.getByRole("button", { name: "Send SMS" }).boundingBox()
        const smsDialogFits = await smsDialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
        expect(smsFooterBox).not.toBeNull()
        expect(smsFooterBox!.y + smsFooterBox!.height).toBeLessThanOrEqual(700)
        expect(smsSendButtonBox).not.toBeNull()
        expect(smsSendButtonBox!.height).toBeGreaterThanOrEqual(44)
        expect(smsDialogFits).toBe(true)

        await smsDialog.getByRole("button", { name: "Send SMS" }).click()
        const smsIssue = page.getByTestId("sms-delivery-issue")
        const smsIssueMessage = page.getByTestId("sms-delivery-issue-message")
        await expect(smsIssue).toBeVisible({ timeout: 10_000 })
        await expect(smsIssueMessage).toContainText("SMS_PROVIDER_DELIVERY_FAILURE")
        await expect(page.getByTestId("toast-message")).toHaveCount(0)

        const smsPageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
        const smsIssueFits = await smsIssue.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
        const smsIssueMessageFits = await smsIssueMessage.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
        const smsRetryButtonBox = await page.getByTestId("sms-delivery-retry-action").boundingBox()
        expect(smsPageFits).toBe(true)
        expect(smsIssueFits).toBe(true)
        expect(smsIssueMessageFits).toBe(true)
        expect(smsRetryButtonBox).not.toBeNull()
        expect(smsRetryButtonBox!.height).toBeGreaterThanOrEqual(44)
        await expect.poll(async () => {
            const issueBox = await smsIssue.boundingBox()
            const footerBox = await page.getByTestId("sms-modal-footer").boundingBox()

            return Boolean(issueBox && footerBox && issueBox.y + issueBox.height <= footerBox.y + 1)
        }).toBe(true)
    })

    test("delivery modals surface attached payment links on mobile", async ({ page, context }) => {
        await seedAuthenticatedSupabaseSession(context)
        await page.setViewportSize({ width: 390, height: 844 })
        const previewEmailRequests: Array<Record<string, unknown>> = []

        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.route("**/api/create-payment-link", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    url: "https://buy.stripe.com/test_delivery",
                    id: "plink_test_delivery",
                }),
            })
        })

        await page.route("**/api/send-email", async (route) => {
            previewEmailRequests.push(route.request().postDataJSON() as Record<string, unknown>)
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ success: true }),
            })
        })

        await page.goto("/new-estimate?capture=type")
        await page.getByTestId("job-description-input").fill("Replace leaking shutoff valve under kitchen sink.")
        await page.getByTestId("quick-generate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
        await page.getByTestId("result-client-details-button").click()
        await page.getByTestId("result-client-name-input").fill("Delivery Client")
        await page.getByTestId("result-client-email-input").fill("delivery-client@example.com")
        await page.getByTestId("result-payment-link-button").click()
        await expect(page.getByRole("dialog", { name: "Payment Link Options" })).toBeVisible()
        await page.getByTestId("create-payment-link-button").click()

        await expect(page.getByTestId("payment-link-status")).toHaveText("Attached")

        await page.getByTestId("result-quick-preview-button").click()
        const previewDialog = page.getByRole("dialog", { name: "PDF Preview" })
        await expect(previewDialog).toBeVisible()
        await expect(page.getByTestId("pdf-preview-review-panel")).toBeVisible({ timeout: 10_000 })
        await expect(page.getByTestId("pdf-preview-review-line-item")).toHaveCount(2)
        await expect(page.getByTestId("pdf-preview-delivery-summary")).toBeVisible()
        await expect(page.getByTestId("pdf-preview-recipient-status")).toHaveText("Ready")
        await expect(page.getByTestId("pdf-preview-payment-link-status")).toHaveText("Included")
        await expectTouchTarget(page.getByTestId("pdf-preview-review-tab"))
        await expectTouchTarget(page.getByTestId("pdf-preview-pdf-tab"))

        const previewCloseBox = await previewDialog.getByRole("button", { name: "Close" }).boundingBox()
        const previewFooterBox = await page.getByTestId("pdf-preview-action-footer").boundingBox()
        expect(previewCloseBox).not.toBeNull()
        expect(previewFooterBox).not.toBeNull()
        expect(previewCloseBox!.width).toBeGreaterThanOrEqual(44)
        expect(previewCloseBox!.height).toBeGreaterThanOrEqual(44)
        expect(previewFooterBox!.y + previewFooterBox!.height).toBeLessThanOrEqual(844)

        await previewDialog.getByRole("button", { name: "Email" }).click()
        await expect(page.getByTestId("pdf-preview-recipient-status")).toHaveText("Ready")
        await expectTouchTarget(previewDialog.getByLabel("Client email"))
        await previewDialog.getByLabel("Client email").fill("preview@example.com")
        await expect(page.getByTestId("pdf-preview-recipient-status")).toHaveText("Ready")
        await previewDialog.getByRole("button", { name: "Send" }).click()
        await expect.poll(() => previewEmailRequests.length).toBe(1)
        expect(previewEmailRequests[0]).toEqual(expect.objectContaining({
            to: "preview@example.com",
            message: expect.stringContaining("https://buy.stripe.com/test_delivery"),
        }))

        await expect(page.getByTestId("pdf-preview-email-toggle")).toBeVisible()
        await previewDialog.getByRole("button", { name: "Close" }).click()
        await expect(previewDialog).not.toBeVisible()

        await page.getByTestId("result-quick-send-button").click()
        const emailDialog = page.getByRole("dialog", { name: "Send Estimate" })
        await expect(emailDialog).toBeVisible()
        await expect(page.getByTestId("email-recipient-status")).toHaveText("Ready")
        await expect(page.getByTestId("email-payment-link-status")).toHaveText("Included")
        await expect(emailDialog.getByLabel(/customer email/i)).toHaveValue("delivery-client@example.com")
        await expect(emailDialog.getByLabel("Message")).toHaveValue(/https:\/\/buy\.stripe\.com\/test_delivery/)

        const emailFooterBox = await page.getByTestId("email-modal-footer").boundingBox()
        expect(emailFooterBox).not.toBeNull()
        expect(emailFooterBox!.y + emailFooterBox!.height).toBeLessThanOrEqual(844)

        await emailDialog.getByRole("button", { name: "Cancel" }).click()
        await expect(emailDialog).not.toBeVisible()

        await page.getByTestId("result-quick-sms-button").click()
        const smsDialog = page.getByRole("dialog", { name: "Send via SMS" })
        await expect(smsDialog).toBeVisible()
        await expect(page.getByTestId("sms-recipient-status")).toHaveText("Needed")
        await expect(page.getByTestId("sms-payment-link-status")).toHaveText("Included")
        await expect(smsDialog.getByLabel("Message")).toHaveValue(/https:\/\/buy\.stripe\.com\/test_delivery/)
        await smsDialog.getByLabel(/customer phone/i).fill("+14165550123")
        await expect(page.getByTestId("sms-recipient-status")).toHaveText("Ready")
        await expect(smsDialog.getByRole("button", { name: /send sms/i })).toBeEnabled()

        const smsFooterBox = await page.getByTestId("sms-modal-footer").boundingBox()
        expect(smsFooterBox).not.toBeNull()
        expect(smsFooterBox!.y + smsFooterBox!.height).toBeLessThanOrEqual(844)
    })
})

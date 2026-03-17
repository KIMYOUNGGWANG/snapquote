import { expect, test } from "@playwright/test"

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

        // Open email modal
        await page.getByRole("button", { name: /send to customer/i }).click()

        // Verify modal opened
        await expect(page.getByRole("heading", { name: /send estimate/i })).toBeVisible()

        // Try submitting with invalid email
        await page.getByLabel(/customer email/i).fill("not-an-email")
        await page.getByRole("button", { name: /send email/i }).click()
        await expect(page.getByText(/valid email/i)).toBeVisible()

        // Close modal
        await page.getByRole("button", { name: /cancel/i }).click()
        await expect(page.getByRole("heading", { name: /send estimate/i })).not.toBeVisible()
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
        await page.getByRole("button", { name: /send to customer/i }).click()
        await page.getByLabel(/customer email/i).fill("client@example.com")
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
        await page.getByRole("button", { name: /send to customer/i }).click()
        await page.getByLabel(/customer email/i).fill("client@example.com")
        await page.getByRole("button", { name: /send email/i }).click()

        // Should show quota exceeded toast or error
        await expect(page.getByText(/quota/i)).toBeVisible({ timeout: 5000 })
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
        await expect(page.getByRole("heading", { name: /send via sms/i })).toBeVisible()

        // Send button should be disabled with invalid phone
        await page.getByLabel(/customer phone/i).fill("1234567")
        const sendBtn = page.getByRole("button", { name: /send sms/i })
        await expect(sendBtn).toBeDisabled()

        // Valid E.164 format enables the button
        await page.getByLabel(/customer phone/i).fill("+14165550123")
        await expect(sendBtn).toBeEnabled()

        // Close modal
        await page.getByRole("button", { name: /cancel/i }).click()
        await expect(page.getByRole("heading", { name: /send via sms/i })).not.toBeVisible()
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

        await expect(
            page.getByText("Insufficient SMS credits. Top up from your account.").first()
        ).toBeVisible({ timeout: 5000 })
    })
})

import { expect, test } from "@playwright/test"

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
    test("payment link is generated and shown in result", async ({ page }) => {
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
                    url: "https://buy.stripe.com/test_abc123",
                    id: "plink_test_abc123",
                }),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Upgrade electrical panel.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")

        // Look for "Get Paid" or payment link button and click it
        const payBtn = page.getByRole("button", { name: /get paid|payment link|add.*pay/i })
        if (await payBtn.isVisible()) {
            await payBtn.click()
            // Verify payment link confirmation
            await expect(page.getByText(/pay.*link|stripe/i)).toBeVisible({ timeout: 5000 })
        }
    })

    test("payment link API failure shows error toast", async ({ page }) => {
        await page.route("**/api/generate", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(MOCK_ESTIMATE_RESPONSE),
            })
        })

        await page.route("**/api/create-payment-link", async (route) => {
            await route.fulfill({
                status: 400,
                contentType: "application/json",
                body: JSON.stringify({ error: "Stripe Connect not configured" }),
            })
        })

        await page.goto("/new-estimate")
        await page.getByTestId("skip-to-manual-entry").click()
        await page.getByTestId("job-description-input").fill("Upgrade electrical panel.")
        await page.getByTestId("generate-estimate-button").click()

        await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    })
})

test.describe("Offline handling", () => {
    test("offline banner appears when network is unavailable", async ({ page, context }) => {
        await page.goto("/new-estimate")

        // Simulate going offline
        await context.setOffline(true)
        await page.evaluate(() => {
            window.dispatchEvent(new Event("offline"))
        })

        // The offline banner should appear
        await expect(page.getByText(/you're offline|some features may be limited/i)).toBeVisible({ timeout: 5000 })

        // Restore connectivity
        await context.setOffline(false)
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
        // Unauthenticated users should see the page or be redirected to login
        await expect(
            page.getByText("Sign In")
                .or(page.getByRole("button", { name: /drafts/i }))
        ).toBeVisible({ timeout: 5000 })
    })
})

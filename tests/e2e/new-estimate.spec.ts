import { expect, test } from "@playwright/test"

test("manual estimate flow renders a generated draft with mocked AI output", async ({ page }) => {
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

    await page.goto("/new-estimate")
    await page.getByTestId("skip-to-manual-entry").click()
    await page.getByTestId("job-description-input").fill(
        "Replace leaking shower cartridge, test valve operation, and clean the work area."
    )
    await page.getByTestId("generate-estimate-button").click()

    await expect(page.getByTestId("estimate-draft-title")).toHaveText("Estimate Draft")
    await expect(page.locator('input[value="Replace shower cartridge"]').first()).toBeVisible()
    await expect(page.locator('input[value="Remove trim, install new cartridge, and test"]').first()).toBeVisible()
    await expect(page.getByText("$203.40")).toBeVisible()
    await expect(page.getByRole("button", { name: /save estimate/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /download pdf/i })).toBeVisible()
})

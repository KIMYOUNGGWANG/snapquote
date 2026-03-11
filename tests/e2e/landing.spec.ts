import { expect, test } from "@playwright/test"

test("landing page positions SnapQuote as a driveway quote tool", async ({ page }) => {
    await page.goto("/landing")

    await expect(page.getByRole("heading", { name: /quote the job\s+before you drive off/i })).toBeVisible()
    await expect(page.getByText(/record 30 seconds of scope notes on-site/i)).toBeVisible()
    await expect(page.getByText(/weak-signal job sites/i)).toBeVisible()

    await page.getByRole("link", { name: /create your first driveway quote/i }).first().click()
    await expect(page).toHaveURL(/\/new-estimate$/)
    await expect(page.getByText("New Estimate")).toBeVisible()
})

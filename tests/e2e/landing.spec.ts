import { expect, test } from "@playwright/test"

test("landing page positions SnapQuote as a multilingual field-to-English quote tool", async ({ page }) => {
    await page.goto("/landing")

    await expect(page.getByRole("heading", { name: /speak in spanish or korean\./i })).toBeVisible()
    await expect(page.getByText(/send the quote in english\./i)).toBeVisible()
    await expect(page.getByText(/english quote draft ready/i)).toBeVisible()

    await page.getByRole("link", { name: /try the spanish\/korean quote flow/i }).click()
    await expect(page).toHaveURL(/\/new-estimate$/)
    await expect(page.getByText("New Estimate")).toBeVisible()
})

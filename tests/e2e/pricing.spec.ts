import { expect, test } from "@playwright/test"

test("pricing page updates plan messaging when a different plan is selected", async ({ page }) => {
    await page.goto("/pricing")

    await expect(page.getByText(/pay for getting the quote out from the field/i)).toBeVisible()
    await expect(page.getByText(/solo owner-operators quoting from the truck/i)).toBeVisible()

    await page.getByRole("button", { name: "Pro" }).click()
    await expect(page.getByText(/cleaner customer-facing wording, faster approvals, and deposit requests/i)).toBeVisible()
    await expect(page.getByText(/receipt scan, payment-ready quotes/i)).toBeVisible()

    await page.getByRole("button", { name: "Team" }).click()
    await expect(page.getByText(/2-10 tech crews standardizing field quotes across the team/i)).toBeVisible()
    await expect(page.getByText(/shared quoting standards across techs/i)).toBeVisible()
})

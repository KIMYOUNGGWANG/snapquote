import { expect, test } from "@playwright/test"

test("login page explains the payment-link return path", async ({ page }) => {
    await page.goto("/login?next=/new-estimate&intent=payment-link")

    await expect(page.getByTestId("login-payment-link-copy")).toBeVisible()
    await expect(page.getByTestId("login-return-target")).toHaveText(/payment link setup/i)
})

test("login page explains the post-auth destination for normal routes", async ({ page }) => {
    await page.goto("/login?next=/profile")

    await expect(page.getByTestId("login-return-target")).toHaveText(/profile/i)
})

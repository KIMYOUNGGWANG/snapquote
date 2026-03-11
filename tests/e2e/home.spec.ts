import { expect, test } from "@playwright/test"

test("signed-out home pushes visitors into either the workflow tour or free trial", async ({ page }) => {
    await page.addInitScript(() => {
        window.localStorage.setItem("snapquote_onboarding_completed", "true")
    })

    await page.goto("/")

    await expect(page.getByRole("heading", { name: /quote the job before you drive off/i })).toBeVisible()
    await expect(page.getByTestId("home-signed-out-workflow")).toBeVisible()
    await expect(page.getByTestId("home-try-free-cta")).toBeVisible()

    await page.getByTestId("home-primary-marketing-cta").click()
    await expect(page).toHaveURL(/\/landing$/)
})

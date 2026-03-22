import { expect, test } from "@playwright/test"

test("pricing page updates plan messaging when a different plan is selected", async ({ page }) => {
    await page.goto("/pricing")

    await expect(page.getByText(/pay for turning spanish or korean field talk into clean english quotes/i)).toBeVisible()
    await expect(page.getByText(/solo owner-operators who speak spanish or korean on site and need clean english quotes out fast/i).last()).toBeVisible()

    await page.getByRole("button", { name: "Pro" }).click()
    await expect(page.getByText(/owner-operators who want cleaner english wording, faster approvals, and deposit requests/i).last()).toBeVisible()
    await expect(page.getByText(/receipt scan, english quote cleanup, and payment-ready quotes/i)).toBeVisible()

    await page.getByRole("button", { name: "Team" }).click()
    await expect(page.getByText(/2-10 tech crews standardizing english quote output across multilingual field teams/i).last()).toBeVisible()
    await expect(page.getByText(/shared english quote standards across techs/i)).toBeVisible()
})

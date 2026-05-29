import { expect, test } from "@playwright/test"

test("pricing page updates plan messaging when a different plan is selected", async ({ page }) => {
    await page.goto("/pricing")

    await expect(page.getByText(/choose the quote volume, multilingual capture, and pdf branding level/i)).toBeVisible()
    await expect(page.getByText(/solo owner-operators who speak spanish or korean on site and need clean english quotes out fast/i).last()).toBeVisible()

    await page.getByRole("button", { name: "Pro" }).click()
    await expect(page.getByText(/owner-operators who want cleaner english wording, faster approvals, and deposit requests/i).last()).toBeVisible()
    await expect(page.getByText(/receipt scan, english quote cleanup, and payment-ready quotes/i)).toBeVisible()

    await page.getByRole("button", { name: "Team" }).click()
    await expect(page.getByText(/2-10 tech crews standardizing english quote output across multilingual field teams/i).last()).toBeVisible()
    await expect(page.getByText(/shared english quote standards across techs/i)).toBeVisible()
})

test("pricing mobile keeps selected plan decision actions in the first viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/pricing")

    const heroCta = page.getByTestId("pricing-hero-cta")
    await expect(heroCta).toBeVisible()
    await expect(heroCta).toContainText("Starter")
    await expect(heroCta).toContainText("USD $34/mo")
    await expect(page.getByTestId("pricing-hero-upgrade")).toBeVisible()
    await expect(page.getByTestId("pricing-hero-free-drafts")).toBeVisible()

    const heroBox = await heroCta.boundingBox()
    const planSelectorBox = await page.getByTestId("pricing-plan-selector").boundingBox()
    const starterBox = await page.getByTestId("pricing-plan-starter").boundingBox()
    const proBox = await page.getByTestId("pricing-plan-pro").boundingBox()
    const teamBox = await page.getByTestId("pricing-plan-team").boundingBox()
    expect(heroBox).not.toBeNull()
    expect(planSelectorBox).not.toBeNull()
    expect(starterBox).not.toBeNull()
    expect(proBox).not.toBeNull()
    expect(teamBox).not.toBeNull()
    expect(heroBox!.y + heroBox!.height).toBeLessThanOrEqual(844)
    expect(planSelectorBox!.y + planSelectorBox!.height).toBeLessThanOrEqual(844)
    expect(starterBox!.height).toBeGreaterThanOrEqual(44)
    expect(proBox!.height).toBeGreaterThanOrEqual(44)
    expect(teamBox!.height).toBeGreaterThanOrEqual(44)

    await page.getByRole("button", { name: "Team" }).click()
    await expect(heroCta).toContainText("Team")
    await expect(heroCta).toContainText("USD $129/mo")
})

test("pricing login handoff preserves the selected plan", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/pricing")

    await page.getByRole("button", { name: "Team" }).click()
    await expect(page.getByTestId("pricing-hero-cta")).toContainText("Team · USD $129/mo")

    await page.getByTestId("pricing-hero-upgrade").click()

    await expect(page).toHaveURL(/\/login\?next=%2Fpricing%3Fplan%3Dteam/)
    await expect(page.getByTestId("login-return-target")).toHaveText("After sign-in, you'll return to Pricing for the Team plan.")
})

test("pricing plan selection is reflected in the URL and survives reload", async ({ page }) => {
    await page.goto("/pricing")

    await page.getByRole("button", { name: "Pro" }).click()
    await expect(page).toHaveURL(/\/pricing\?plan=pro/)
    await expect(page.getByTestId("pricing-hero-cta")).toContainText("Pro · USD $59/mo")

    await page.reload()

    await expect(page.getByTestId("pricing-hero-cta")).toContainText("Pro · USD $59/mo")
    await expect(page.getByTestId("pricing-selected-price")).toHaveText("USD $59/mo")
})

test("pricing desktop keeps selected price typography unclipped", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/pricing")

    await expect(page.getByTestId("pricing-selected-price")).toHaveText("USD $34/mo")
    const selectedPriceFits = await page.getByTestId("pricing-selected-price").evaluate((element) => {
        return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
    })

    expect(selectedPriceFits).toBe(true)

    await page.getByRole("button", { name: "Team" }).click()
    await expect(page.getByTestId("pricing-selected-price")).toHaveText("USD $129/mo")
    const teamPriceFits = await page.getByTestId("pricing-selected-price").evaluate((element) => {
        return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
    })

    expect(teamPriceFits).toBe(true)
})

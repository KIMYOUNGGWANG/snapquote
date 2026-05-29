import { expect, test } from "@playwright/test"

test("login page explains the payment-link return path", async ({ page }) => {
    await page.goto("/login?next=/new-estimate&intent=payment-link")

    await expect(page.getByTestId("login-payment-link-copy")).toBeVisible()
    await expect(page.getByTestId("login-return-target")).toHaveText(/payment link setup/i)
    const titleFits = await page.getByTestId("login-page-title").evaluate((element) => {
        return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
    })
    const magicLinkDividerContrast = await page.getByTestId("login-magic-link-divider").evaluate((element) => {
        const parseRgb = (color: string) => color.match(/\d+(\.\d+)?/g)?.slice(0, 3).map(Number) ?? [0, 0, 0]
        const luminance = (rgb: number[]) => {
            const [red, green, blue] = rgb.map((channel) => {
                const normalized = channel / 255
                return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
            })

            return 0.2126 * red + 0.7152 * green + 0.0722 * blue
        }
        const style = window.getComputedStyle(element)
        const foreground = luminance(parseRgb(style.color))
        const background = luminance(parseRgb(style.backgroundColor))
        const lighter = Math.max(foreground, background)
        const darker = Math.min(foreground, background)

        return (lighter + 0.05) / (darker + 0.05)
    })

    expect(titleFits).toBe(true)
    expect(magicLinkDividerContrast).toBeGreaterThanOrEqual(4.5)
})

test("login page explains the referral invite return path", async ({ page }) => {
    await page.goto("/login?next=/new-estimate&intent=referral-invite")

    await expect(page.getByTestId("login-referral-invite-copy")).toBeVisible()
    await expect(page.getByTestId("login-return-target")).toHaveText(/referral invites unlocked/i)
})

test("login page shows OAuth recovery as an actionable alert", async ({ page }) => {
    await page.goto("/login?next=/new-estimate&intent=payment-link&oauth_error=User%20canceled")

    const statusMessage = page.getByTestId("login-status-message")
    await expect(statusMessage).toBeVisible()
    await expect(statusMessage).toHaveAttribute("role", "alert")
    await expect(statusMessage).toContainText("Sign-in paused")
    await expect(statusMessage).toContainText("No setup changed")
    await expect(page.getByTestId("login-return-target")).toHaveText(/payment link setup/i)
})

test("login page explains the post-auth destination for normal routes", async ({ page }) => {
    await page.goto("/login?next=/profile")

    await expect(page.getByTestId("login-return-target")).toHaveText(/profile/i)
})

test("login page summarizes pricing plan return paths without raw query strings", async ({ page }) => {
    await page.goto("/login?next=/pricing?plan=team")

    await expect(page.getByTestId("login-return-target")).toHaveText("After sign-in, you'll return to Pricing for the Team plan.")
})

test("login page presents a desktop sign-in workbench", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/login?next=/pricing?plan=team")

    await expect(page.getByTestId("login-workbench")).toBeVisible()
    await expect(page.getByTestId("login-context-panel")).toBeVisible()
    await expect(page.getByTestId("login-form-panel")).toBeVisible()
    await expect(page.getByTestId("login-trust-strip")).toBeVisible()
    await expect(page.getByTestId("login-desktop-return-card")).toContainText("Team plan")

    const workbenchBox = await page.getByTestId("login-workbench").boundingBox()
    const contextBox = await page.getByTestId("login-context-panel").boundingBox()
    const formBox = await page.getByTestId("login-form-panel").boundingBox()

    expect(workbenchBox).toBeTruthy()
    expect(contextBox).toBeTruthy()
    expect(formBox).toBeTruthy()
    expect(workbenchBox!.width).toBeGreaterThan(800)
    expect(formBox!.x).toBeGreaterThan(contextBox!.x)
})

test("login page keeps the primary sign-in action above the mobile fold", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/login?next=/pricing?plan=team")

    await expect(page.getByTestId("login-trust-strip")).toBeHidden()
    await expect(page.getByTestId("login-desktop-return-card")).toBeHidden()

    const googleButtonBox = await page.getByRole("button", { name: "Continue with Google" }).boundingBox()
    const formBox = await page.getByTestId("login-form-panel").boundingBox()

    expect(googleButtonBox).toBeTruthy()
    expect(formBox).toBeTruthy()
    expect(googleButtonBox!.y + googleButtonBox!.height).toBeLessThanOrEqual(844)
})

test("protected automation route shows an in-place sign-in gate with the return path", async ({ page }) => {
    await page.goto("/automation")

    await expect(page).toHaveURL(/\/automation/)
    await expect(page.getByTestId("auth-gate-signin")).toBeVisible()
    await expect(page.getByTestId("auth-gate-signin-link")).toHaveAttribute("href", "/login?next=%2Fautomation")

    await page.getByTestId("auth-gate-signin-link").click()

    await expect(page).toHaveURL(/\/login\?next=%2Fautomation/)
    await expect(page.getByTestId("login-return-target")).toHaveText(/automation/i)
})

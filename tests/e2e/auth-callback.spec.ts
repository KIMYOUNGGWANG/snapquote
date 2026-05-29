import { expect, test, type Page } from "@playwright/test"

function collectConsoleIssues(page: Page) {
    const issues: string[] = []
    page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
            issues.push(`${message.type()}: ${message.text()}`)
        }
    })
    return issues
}

test.describe("Auth callback", () => {
    test("provider error stays visible with a sign-in recovery action", async ({ page }) => {
        const consoleIssues = collectConsoleIssues(page)
        await page.setViewportSize({ width: 1280, height: 900 })
        await page.goto("/auth/callback?next=/new-estimate&intent=payment-link&error=access_denied&error_description=User%20canceled")

        await expect(page.getByTestId("auth-callback-workbench")).toBeVisible()
        await expect(page.getByTestId("auth-callback-context-panel")).toBeVisible()
        await expect(page.getByTestId("auth-callback-panel")).toBeVisible()
        const errorCard = page.getByTestId("auth-callback-error")
        await expect(errorCard).toBeVisible()
        await expect(errorCard).toContainText("Sign-in was not authorized")
        await expect(errorCard).toContainText("User canceled")
        const handoffCard = page.getByTestId("auth-callback-handoff-card")
        await expect(handoffCard).toContainText("Provider stopped sign-in")
        await expect(handoffCard).toContainText("Payment Link")
        await expect(handoffCard).toContainText("/new-estimate?intent=payment-link")
        await expect(handoffCard).toContainText("Needs fresh sign-in")
        await expect(page.getByTestId("auth-callback-login-action")).toHaveAttribute(
            "href",
            "/login?next=%2Fnew-estimate&intent=payment-link&oauth_error=User+canceled"
        )
        await expect(page.getByTestId("auth-callback-return-action")).toHaveAttribute(
            "href",
            "/new-estimate?intent=payment-link"
        )
        await expect(page.getByTestId("auth-callback-retry-action")).toHaveCount(0)

        const contextBox = await page.getByTestId("auth-callback-context-panel").boundingBox()
        const statusBox = await page.getByTestId("auth-callback-panel").boundingBox()

        expect(contextBox).toBeTruthy()
        expect(statusBox).toBeTruthy()
        expect(statusBox!.x).toBeGreaterThan(contextBox!.x)
        expect(consoleIssues).toEqual([])
    })

    test("mobile auth callback keeps recovery actions before handoff details", async ({ page }) => {
        const consoleIssues = collectConsoleIssues(page)
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto("/auth/callback?next=/new-estimate&intent=payment-link&error=access_denied&error_description=User%20canceled")

        const statusPanelBox = await page.getByTestId("auth-callback-panel").boundingBox()
        const contextPanelBox = await page.getByTestId("auth-callback-context-panel").boundingBox()
        const loginButtonBox = await page.getByTestId("auth-callback-login-action").boundingBox()
        const returnButtonBox = await page.getByTestId("auth-callback-return-action").boundingBox()

        expect(statusPanelBox).toBeTruthy()
        expect(contextPanelBox).toBeTruthy()
        expect(loginButtonBox).toBeTruthy()
        expect(returnButtonBox).toBeTruthy()
        expect(statusPanelBox!.y).toBeLessThan(contextPanelBox!.y)
        expect(loginButtonBox!.y + loginButtonBox!.height).toBeLessThanOrEqual(844)
        expect(returnButtonBox!.y + returnButtonBox!.height).toBeLessThanOrEqual(844)
        expect(consoleIssues).toEqual([])
    })

    test("missing callback parameters show a stable incomplete-callback card", async ({ page }) => {
        await page.goto("/auth/callback?next=/history")

        const errorCard = page.getByTestId("auth-callback-error")
        await expect(errorCard).toBeVisible()
        await expect(errorCard).toContainText("Sign-in callback was incomplete")
        await expect(errorCard).toContainText("Missing OAuth authorization code or token")
        const handoffCard = page.getByTestId("auth-callback-handoff-card")
        await expect(handoffCard).toContainText("No code or token")
        await expect(handoffCard).toContainText("Standard sign in")
        await expect(handoffCard).toContainText("/history")
        await expect(page.getByTestId("auth-callback-login-action")).toHaveAttribute(
            "href",
            "/login?next=%2Fhistory&oauth_error=Missing+OAuth+authorization+code+or+token"
        )
        await expect(page.getByTestId("auth-callback-return-action")).toHaveAttribute("href", "/history")
    })

    test("code exchange failure can retry without losing the callback context", async ({ page }) => {
        await page.route("**/auth/v1/token?grant_type=pkce", async (route) => {
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({
                    error: "server_error",
                    error_description: "OAuth token exchange failed",
                }),
            })
        })

        await page.goto("/auth/callback?next=/profile&code=fake-auth-code")

        const errorCard = page.getByTestId("auth-callback-error")
        await expect(errorCard).toBeVisible()
        await expect(errorCard).toContainText("Sign-in could not be completed")
        const handoffCard = page.getByTestId("auth-callback-handoff-card")
        await expect(handoffCard).toContainText("Authorization code received")
        await expect(handoffCard).toContainText("/profile")
        await expect(handoffCard).toContainText("Can retry final step")
        await expect(page.getByTestId("auth-callback-retry-action")).toBeVisible()
        await expect(page.getByTestId("auth-callback-login-action")).toHaveAttribute("href", /\/login\?next=%2Fprofile/)

        await page.getByTestId("auth-callback-retry-action").click()
        await expect(errorCard).toBeVisible()
    })
})

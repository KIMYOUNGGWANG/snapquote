import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local", quiet: true })

function collectConsoleIssues(page: Page) {
    const issues: string[] = []
    page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
            issues.push(`${message.type()}: ${message.text()}`)
        }
    })
    return issues
}

function getSupabaseAuthStorageKey() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0]
    return `sb-${projectRef}-auth-token`
}

function encodeQuickBooksState(returnPath = "/history") {
    return Buffer.from(JSON.stringify({ returnPath }), "utf8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")
}

async function seedAuthenticatedSupabaseSession(context: BrowserContext) {
    await context.addInitScript(({ storageKey }) => {
        window.localStorage.setItem(
            storageKey,
            JSON.stringify({
                access_token: "test-access-token",
                refresh_token: "test-refresh-token",
                token_type: "bearer",
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                user: {
                    id: "00000000-0000-4000-8000-000000000001",
                    aud: "authenticated",
                    role: "authenticated",
                    email: "test@example.com",
                },
            })
        )
    }, { storageKey: getSupabaseAuthStorageKey() })
}

test.describe("QuickBooks callback", () => {
    test("provider cancellation shows a stable recovery card", async ({ page }) => {
        const consoleIssues = collectConsoleIssues(page)
        await page.setViewportSize({ width: 1280, height: 900 })
        await page.goto(`/quickbooks/callback?error=access_denied&error_description=User%20canceled&state=${encodeQuickBooksState()}`)

        await expect(page.getByTestId("quickbooks-callback-workbench")).toBeVisible()
        await expect(page.getByTestId("quickbooks-callback-context-panel")).toBeVisible()
        await expect(page.getByTestId("quickbooks-callback-panel")).toBeVisible()
        const errorCard = page.getByTestId("quickbooks-callback-error")
        await expect(errorCard).toBeVisible()
        await expect(errorCard).toContainText("QuickBooks authorization was canceled")
        await expect(errorCard).toContainText("No accounting connection was changed")
        await expect(page.getByTestId("quickbooks-callback-handoff-card")).toContainText("No code saved")
        await expect(page.getByTestId("quickbooks-callback-handoff-card")).toContainText("/history")
        await expect(page.getByTestId("quickbooks-callback-return-action")).toHaveAttribute("href", "/history")
        await expect(page.getByTestId("quickbooks-callback-retry-action")).toHaveCount(0)

        const handoffBox = await page.getByTestId("quickbooks-callback-handoff-card").boundingBox()
        const bottomNavBox = await page.getByTestId("bottom-navigation").boundingBox()

        expect(handoffBox).not.toBeNull()
        expect(bottomNavBox).not.toBeNull()
        expect(handoffBox!.y + handoffBox!.height).toBeLessThanOrEqual(bottomNavBox!.y - 8)

        const contextBox = await page.getByTestId("quickbooks-callback-context-panel").boundingBox()
        const statusBox = await page.getByTestId("quickbooks-callback-panel").boundingBox()

        expect(contextBox).toBeTruthy()
        expect(statusBox).toBeTruthy()
        expect(statusBox!.x).toBeGreaterThan(contextBox!.x)
        expect(consoleIssues).toEqual([])
    })

    test("mobile QuickBooks callback keeps the recovery action before handoff details", async ({ page }) => {
        const consoleIssues = collectConsoleIssues(page)
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(`/quickbooks/callback?error=access_denied&error_description=User%20canceled&state=${encodeQuickBooksState()}`)

        const statusPanelBox = await page.getByTestId("quickbooks-callback-panel").boundingBox()
        const contextPanelBox = await page.getByTestId("quickbooks-callback-context-panel").boundingBox()
        const returnButtonBox = await page.getByTestId("quickbooks-callback-return-action").boundingBox()
        const bottomNavBox = await page.getByTestId("bottom-navigation").boundingBox()

        expect(statusPanelBox).toBeTruthy()
        expect(contextPanelBox).toBeTruthy()
        expect(returnButtonBox).toBeTruthy()
        expect(bottomNavBox).toBeTruthy()
        expect(statusPanelBox!.y).toBeLessThan(contextPanelBox!.y)
        expect(returnButtonBox!.y + returnButtonBox!.height).toBeLessThanOrEqual(bottomNavBox!.y - 8)
        expect(consoleIssues).toEqual([])
    })

    test("signed-out callback keeps the authorization and routes through login", async ({ page }) => {
        const state = encodeQuickBooksState("/history?quickbooks=connected")
        await page.goto(`/quickbooks/callback?code=auth-code&realmId=realm-123&state=${state}`)

        const authCard = page.getByTestId("quickbooks-callback-auth-required")
        await expect(authCard).toBeVisible()
        await expect(authCard).toContainText("Log in to finish QuickBooks")
        await expect(authCard).toContainText("QuickBooks authorization is waiting")
        const handoffCard = page.getByTestId("quickbooks-callback-handoff-card")
        await expect(handoffCard).toContainText("Code received")
        await expect(handoffCard).toContainText("realm-123")
        await expect(handoffCard).toContainText("Login required")
        await expect(handoffCard).toContainText("/history?quickbooks=connected")
        await expect(page.getByTestId("quickbooks-callback-login-action")).toHaveAttribute("href", /\/login\?next=/)
        await expect(page.getByTestId("quickbooks-callback-return-action")).toHaveAttribute("href", "/history?quickbooks=connected")
    })

    test("token exchange failure stays visible and can retry the final step", async ({ page, context }) => {
        await seedAuthenticatedSupabaseSession(context)

        let tokenAttempts = 0
        await page.route("**/api/quickbooks/connect/token", async (route) => {
            tokenAttempts += 1
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ error: { message: "QuickBooks token exchange failed." } }),
            })
        })

        await page.goto(`/quickbooks/callback?code=auth-code&realmId=realm-123&state=${encodeQuickBooksState()}`)

        const errorCard = page.getByTestId("quickbooks-callback-error")
        await expect(errorCard).toBeVisible()
        await expect(errorCard).toContainText("QuickBooks connection could not be completed")
        await expect(errorCard).toContainText("QuickBooks token exchange failed.")
        await expect(page.getByTestId("quickbooks-callback-handoff-card")).toContainText("Final step can retry")
        await expect(page.getByTestId("quickbooks-callback-retry-action")).toBeVisible()

        await page.getByTestId("quickbooks-callback-retry-action").click()
        await expect(errorCard).toBeVisible()
        expect(tokenAttempts).toBeGreaterThanOrEqual(2)
    })

    test("successful token exchange confirms and returns to the decoded path", async ({ page, context }) => {
        await seedAuthenticatedSupabaseSession(context)
        await page.route("**/api/quickbooks/connect/token", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: true,
                    realmId: "realm-123",
                    connectedAt: new Date().toISOString(),
                }),
            })
        })

        await page.goto(`/quickbooks/callback?code=auth-code&realmId=realm-123&state=${encodeQuickBooksState("/history?quickbooks=connected")}`)

        const successCard = page.getByTestId("quickbooks-callback-success")
        await expect(successCard).toBeVisible()
        await expect(successCard).toContainText("QuickBooks is connected")
        await expect(page).toHaveURL(/\/history\?quickbooks=connected/, { timeout: 10000 })
    })
})

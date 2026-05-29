import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local", quiet: true })

type AutomationRecord = {
    id: string
    user_id: string
    type: string
    is_enabled: boolean
    settings: {
        first_delay_hours?: number
        second_delay_hours?: number
        review_link?: string
    }
}

type MockAutomationNetworkOptions = {
    quoteRecoveryResults?: Array<{
        estimateId: string
        estimateNumber: string
        action: "sent_sms" | "sent_email" | "skipped_no_contact"
        messagePreview: string
    }>
}

const testUser = {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.com",
}

function getSupabaseAuthStorageKey() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co"
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0]
    return `sb-${projectRef}-auth-token`
}

function buildSessionPayload() {
    return {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: testUser,
    }
}

async function seedAuthenticatedSupabaseSession(context: BrowserContext) {
    await context.addInitScript(({ storageKey, sessionPayload }) => {
        window.localStorage.setItem(storageKey, JSON.stringify(sessionPayload))
    }, { storageKey: getSupabaseAuthStorageKey(), sessionPayload: buildSessionPayload() })
}

async function mockAutomationNetwork(page: Page, options: MockAutomationNetworkOptions = {}) {
    let automations: AutomationRecord[] = []
    const quoteRecoveryResults = options.quoteRecoveryResults || [
        {
            estimateId: "estimate-1042",
            estimateNumber: "EST-1042",
            action: "sent_email" as const,
            messagePreview: "Quick reminder: your drain repair quote is ready when you are.",
        },
    ]

    await page.route("**/auth/v1/token**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(buildSessionPayload()),
        })
    })

    await page.route("**/auth/v1/user", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(testUser),
        })
    })

    await page.route("**/rest/v1/job_queue**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([
                {
                    id: "log-1",
                    task_type: "quote_recovery",
                    status: "completed",
                    created_at: "2026-05-23T08:30:00.000Z",
                },
                {
                    id: "log-2",
                    task_type: "review_request",
                    status: "pending",
                    created_at: "2026-05-22T15:10:00.000Z",
                },
            ]),
        })
    })

    await page.route("**/rest/v1/automations**", async (route) => {
        const method = route.request().method()

        if (method === "GET") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(automations),
            })
            return
        }

        if (method === "POST") {
            const rawBody = route.request().postDataJSON() as Partial<AutomationRecord> | Partial<AutomationRecord>[]
            const automationInput = Array.isArray(rawBody) ? rawBody[0] : rawBody
            const automation: AutomationRecord = {
                id: `automation-${automations.length + 1}`,
                user_id: testUser.id,
                type: automationInput.type || "quote_chaser",
                is_enabled: Boolean(automationInput.is_enabled),
                settings: automationInput.settings || {},
            }
            automations = [...automations, automation]

            await route.fulfill({
                status: 201,
                contentType: "application/json",
                body: JSON.stringify(automation),
            })
            return
        }

        if (method === "PATCH") {
            const url = new URL(route.request().url())
            const id = url.searchParams.get("id")?.replace(/^eq\./, "")
            const patch = route.request().postDataJSON() as Partial<AutomationRecord>
            automations = automations.map((automation) =>
                automation.id === id ? { ...automation, ...patch } : automation
            )

            await route.fulfill({ status: 204 })
            return
        }

        await route.continue()
    })

    await page.route("**/api/quotes/recovery/trigger", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: true,
                processedCount: quoteRecoveryResults.length,
                results: quoteRecoveryResults,
            }),
        })
    })
}

test("automation mobile command center guides setup and quote recovery preview", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    await mockAutomationNetwork(page)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/automation")

    const commandCenter = page.getByTestId("automation-command-center")
    await expect(commandCenter).toBeVisible()
    await expect(commandCenter).toContainText("0/2")
    await expect(commandCenter).toContainText("Turn on Quote Chaser")
    await expect(page.getByTestId("automation-status-overview")).toContainText("0/2")

    const commandBox = await commandCenter.boundingBox()
    const quoteCardBox = await page.getByTestId("quote-chaser-card").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()
    const primaryActionBox = await page.getByTestId("automation-primary-action").boundingBox()
    const quoteSwitchBox = await page.getByRole("switch", { name: "Toggle Quote Chaser" }).boundingBox()
    const reviewSwitchBox = await page.getByRole("switch", { name: "Toggle Reputation Manager" }).boundingBox()
    expect(commandBox).not.toBeNull()
    expect(quoteCardBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(primaryActionBox).not.toBeNull()
    expect(quoteSwitchBox).not.toBeNull()
    expect(reviewSwitchBox).not.toBeNull()
    expect(commandBox!.y + commandBox!.height).toBeLessThanOrEqual(844)
    expect(quoteCardBox!.y + quoteCardBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
    expect(primaryActionBox!.height).toBeGreaterThanOrEqual(44)
    expect(quoteSwitchBox!.width).toBeGreaterThanOrEqual(44)
    expect(quoteSwitchBox!.height).toBeGreaterThanOrEqual(44)
    expect(reviewSwitchBox!.width).toBeGreaterThanOrEqual(44)
    expect(reviewSwitchBox!.height).toBeGreaterThanOrEqual(44)

    await page.getByTestId("automation-primary-action").click()
    await expect(page.getByTestId("quote-chaser-card")).toBeInViewport()

    await page.getByRole("switch", { name: "Toggle Quote Chaser" }).click()
    await expect(commandCenter).toContainText("1/2")
    await expect(commandCenter).toContainText("Add Reputation Manager")
    await expect(page.getByLabel("1st Follow-up (Days)")).toHaveValue("2")
    await expect(page.getByRole("button", { name: "Run Now" })).toBeDisabled()

    await page.getByRole("button", { name: "Preview Next Batch" }).click()
    await expect(page.getByText("Latest preview")).toBeVisible()
    await expect(page.getByText("EST-1042")).toBeVisible()
    await expect(page.getByText("Quick reminder: your drain repair quote is ready when you are.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Run Now" })).toBeEnabled()
})

test("automation quote recovery preview keeps long AI messages reviewable on mobile", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    await mockAutomationNetwork(page, {
        quoteRecoveryResults: [
            {
                estimateId: "estimate-long-followup-1",
                estimateNumber: "EST-2026-COMMERCIAL-ROOF-DRAIN-EMERGENCY-FOLLOWUP-000092",
                action: "sent_email",
                messagePreview: "Hi Jordan, this is a quick follow-up on the commercial roof drain emergency repair quote for the north warehouse loading dock. The estimate is still ready for approval, and we can hold the current material pricing through Friday afternoon.",
            },
        ],
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/automation")

    await page.getByRole("switch", { name: "Toggle Quote Chaser" }).click()
    const previewButton = page.getByTestId("quote-recovery-preview-button")
    const runButton = page.getByTestId("quote-recovery-run-button")

    await expect(runButton).toBeDisabled()
    await previewButton.click()

    const resultCard = page.getByTestId("quote-recovery-result-card")
    const resultEstimate = page.getByTestId("quote-recovery-result-estimate")
    const resultMessage = page.getByTestId("quote-recovery-result-message")

    await expect(resultCard).toBeVisible()
    await expect(resultEstimate).toContainText("COMMERCIAL-ROOF-DRAIN")
    await expect(resultMessage).toContainText("north warehouse loading dock")
    await expect(page.getByTestId("quote-recovery-feedback")).toContainText("Preview ready")
    await expect(page.getByTestId("toast-message")).toHaveCount(0)
    await expect(runButton).toBeEnabled()

    const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    const estimateFits = await resultEstimate.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    const messageFits = await resultMessage.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    const resultCardBox = await resultCard.boundingBox()
    const previewButtonBox = await previewButton.boundingBox()
    const runButtonBox = await runButton.boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(pageFits).toBe(true)
    expect(estimateFits).toBe(true)
    expect(messageFits).toBe(true)
    expect(resultCardBox).not.toBeNull()
    expect(previewButtonBox).not.toBeNull()
    expect(runButtonBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(resultCardBox!.width).toBeGreaterThan(240)
    expect(previewButtonBox!.height).toBeGreaterThanOrEqual(44)
    expect(runButtonBox!.height).toBeGreaterThanOrEqual(44)
    expect(runButtonBox!.y + runButtonBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("automation desktop uses a wide bots and activity workbench", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    await mockAutomationNetwork(page)

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/automation")

    const commandCenter = page.getByTestId("automation-command-center")
    const workbench = page.getByTestId("automation-workbench")
    const botsSection = page.getByTestId("automation-bots-section")
    const logSection = page.getByTestId("automation-log-section")

    await expect(commandCenter).toBeVisible()
    await expect(workbench).toBeVisible()
    await expect(botsSection).toBeVisible()
    await expect(logSection).toBeVisible()
    await expect(logSection.getByText("Automation Log")).toBeVisible()
    await expect(botsSection.getByText("Quote Chaser")).toBeVisible()
    await expect(botsSection.getByText("Reputation Manager")).toBeVisible()

    const commandBox = await commandCenter.boundingBox()
    const workbenchBox = await workbench.boundingBox()
    const botsBox = await botsSection.boundingBox()
    const logBox = await logSection.boundingBox()
    const quoteCardBox = await page.getByTestId("quote-chaser-card").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(commandBox).not.toBeNull()
    expect(workbenchBox).not.toBeNull()
    expect(botsBox).not.toBeNull()
    expect(logBox).not.toBeNull()
    expect(quoteCardBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(commandBox!.width).toBeGreaterThan(900)
    expect(workbenchBox!.width).toBeGreaterThan(900)
    expect(botsBox!.x).toBeLessThan(logBox!.x)
    expect(Math.abs(botsBox!.y - logBox!.y)).toBeLessThanOrEqual(2)
    expect(botsBox!.width).toBeGreaterThan(580)
    expect(logBox!.width).toBeGreaterThan(320)
    expect(quoteCardBox!.y + quoteCardBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

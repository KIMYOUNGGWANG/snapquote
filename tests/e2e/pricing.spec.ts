import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local", quiet: true })

function getSupabaseAuthStorageKey() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co"
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0]
    return `sb-${projectRef}-auth-token`
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

async function mockAuthenticatedPricingNetwork(page: Page) {
    await page.route("**/auth/v1/token**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
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
            }),
        })
    })

    await page.route("**/auth/v1/user", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                id: "00000000-0000-4000-8000-000000000001",
                aud: "authenticated",
                role: "authenticated",
                email: "test@example.com",
            }),
        })
    })

    await page.route("**/api/pricing/offer", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: true,
                experiment: null,
                variant: null,
                billing: {
                    annualDiscountPct: 20,
                    plans: {
                        starter: {
                            monthlyPriceId: "price_starter_monthly",
                            annualPriceId: "price_starter_annual",
                            annualEnabled: true,
                        },
                        pro: {
                            monthlyPriceId: "price_pro_monthly",
                            annualPriceId: "price_pro_annual",
                            annualEnabled: true,
                        },
                        team: {
                            monthlyPriceId: "price_team_monthly",
                            annualPriceId: "price_team_annual",
                            annualEnabled: true,
                        },
                    },
                },
            }),
        })
    })

    await page.route("**/api/billing/subscription", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: true,
                planTier: "starter",
                subscribed: true,
                status: "active",
                customerId: "cus_pricing_portal_failure",
                subscriptionId: "sub_pricing_portal_failure",
                priceId: "price_starter_monthly",
                currentPeriodEnd: "2026-07-02T00:00:00.000Z",
                cancelAtPeriodEnd: false,
            }),
        })
    })

    await page.route("**/api/billing/usage", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                planTier: "starter",
                periodStart: "2026-06-01",
                usage: {
                    generate: 12,
                    transcribe: 8,
                    send_email: 4,
                },
                limits: {
                    generate: 80,
                    transcribe: 60,
                    send_email: 60,
                },
                remaining: {
                    generate: 68,
                    transcribe: 52,
                    send_email: 56,
                },
                usageRatePct: {
                    generate: 15,
                    transcribe: 13,
                    send_email: 7,
                },
                openaiPromptTokens: 1200,
                openaiCompletionTokens: 640,
                estimatedCosts: {
                    openai: 0.42,
                    resend: 0.05,
                    total: 0.47,
                },
            }),
        })
    })

    await page.route("**/api/pricing/events", async (route) => {
        await route.fulfill({
            status: 204,
            body: "",
        })
    })
}

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

test("pricing explains email quota source and preserves it through login handoff", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/pricing?source=send_email_quota")

    const sourceContext = page.getByTestId("pricing-source-context")
    await expect(sourceContext).toBeVisible()
    await expect(sourceContext).toContainText("Email delivery quota")
    await expect(sourceContext).toContainText("Keep sending PDFs from the jobsite.")
    await expect(sourceContext).toContainText("Starter includes 60 sent estimate emails per month.")
    await expect(page.getByTestId("pricing-source-recommended-plan")).toContainText("Starter")
    await expect(page.getByTestId("pricing-hero-cta")).toContainText("Starter · USD $34/mo")

    await page.getByTestId("pricing-hero-upgrade").click()

    await expect(page).toHaveURL(/\/login\?next=%2Fpricing%3Fplan%3Dstarter%26source%3Dsend_email_quota/)
    await expect(page.getByTestId("login-return-target")).toHaveText("After sign-in, you'll return to Pricing for the Starter plan.")
})

test("pricing explains voice transcription quota source", async ({ page }) => {
    await page.goto("/pricing?source=transcribe_quota")

    const sourceContext = page.getByTestId("pricing-source-context")
    await expect(sourceContext).toBeVisible()
    await expect(sourceContext).toContainText("Voice capture limit")
    await expect(sourceContext).toContainText("Keep turning recordings into quote-ready scope.")
    await expect(sourceContext).toContainText("Starter includes 60 transcription minutes")
    await expect(page.getByTestId("pricing-source-recommended-plan")).toContainText("Starter")
    await expect(page.getByTestId("pricing-hero-cta")).toContainText("Starter · USD $34/mo")
})

test("pricing explains SMS credit source and keeps it when plans change", async ({ page }) => {
    await page.goto("/pricing?source=sms_credits")

    const sourceContext = page.getByTestId("pricing-source-context")
    await expect(sourceContext).toBeVisible()
    await expect(sourceContext).toContainText("SMS credits")
    await expect(sourceContext).toContainText("Add sending room for text follow-ups.")
    await expect(page.getByTestId("pricing-source-recommended-plan")).toContainText("Pro")
    await expect(page.getByTestId("pricing-hero-cta")).toContainText("Pro · USD $59/mo")

    await page.getByRole("button", { name: "Team" }).click()

    await expect(page).toHaveURL(/\/pricing\?source=sms_credits&plan=team/)
    await expect(page.getByTestId("pricing-hero-cta")).toContainText("Team · USD $129/mo")
})

test("pricing explains QuickBooks sync source", async ({ page }) => {
    await page.goto("/pricing?plan=pro&source=quickbooks_sync")

    const sourceContext = page.getByTestId("pricing-source-context")
    await expect(sourceContext).toBeVisible()
    await expect(sourceContext).toContainText("QuickBooks sync")
    await expect(sourceContext).toContainText("Push won estimates into accounting.")
    await expect(sourceContext).toContainText("Pro unlocks direct QuickBooks invoice sync")
    await expect(page.getByTestId("pricing-source-recommended-plan")).toContainText("Pro")
    await expect(page.getByTestId("pricing-hero-cta")).toContainText("Pro · USD $59/mo")
})

test("pricing keeps billing portal failures visible with retry and refresh", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    await mockAuthenticatedPricingNetwork(page)

    let portalAttempts = 0
    await page.route("**/api/billing/stripe/portal", async (route) => {
        portalAttempts += 1
        await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Stripe billing portal is temporarily unavailable." }),
        })
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/pricing")

    const manageBilling = page.getByTestId("pricing-manage-billing-action")
    await manageBilling.scrollIntoViewIfNeeded()
    await expect(manageBilling).toBeVisible()
    await expect(manageBilling).toContainText("Manage billing in Stripe")

    await manageBilling.click()

    const portalIssue = page.getByTestId("pricing-billing-portal-issue")
    await expect(portalIssue).toBeVisible()
    await expect(portalIssue).toContainText("Billing portal could not open")
    await expect(portalIssue).toContainText("Stripe billing portal is temporarily unavailable.")
    await expect(page.getByTestId("pricing-billing-portal-retry-action")).toContainText("Retry portal")
    await expect(page.getByTestId("pricing-billing-status-refresh-action")).toContainText("Refresh billing status")
    expect(portalAttempts).toBe(1)

    await page.getByTestId("pricing-billing-portal-retry-action").click()
    await expect(portalIssue).toBeVisible()
    await expect.poll(() => portalAttempts).toBe(2)

    await page.getByTestId("pricing-billing-status-refresh-action").click()
    await expect(portalIssue).toHaveCount(0)
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

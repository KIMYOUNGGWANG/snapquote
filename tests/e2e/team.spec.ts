import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local", quiet: true })

const testUser = {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "owner@snapquote.test",
}

type TeamMockOptions = {
    workspaceName?: string
    members?: Array<{
        userId: string
        role: "owner" | "admin" | "member"
        joinedAt: string
        businessName?: string
        email?: string
    }>
    estimates?: Array<{
        estimateId: string
        estimateNumber: string
        clientName?: string
        ownerUserId: string
        ownerBusinessName?: string
        status: "draft" | "sent" | "paid"
        totalAmount: number
        updatedAt: string
    }>
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
        Object.defineProperty(window.navigator, "clipboard", {
            configurable: true,
            value: {
                writeText: async (text: string) => {
                    (window as typeof window & { __snapquoteCopiedText?: string }).__snapquoteCopiedText = text
                },
                readText: async () => (window as typeof window & { __snapquoteCopiedText?: string }).__snapquoteCopiedText || "",
            },
        })
    }, { storageKey: getSupabaseAuthStorageKey(), sessionPayload: buildSessionPayload() })
}

async function mockTeamNetwork(page: Page, options: TeamMockOptions = {}) {
    let pendingInvites: Array<{
        inviteId: string
        email: string
        role: "admin" | "member"
        status: "pending"
        token: string
        inviteUrl: string
        expiresAt: string
        createdAt: string
    }> = []

    const workspacePayload = () => ({
        ok: true,
        eligible: true,
        hasWorkspace: true,
        workspace: {
            id: "workspace_1",
            name: options.workspaceName || "North Shore Electric Team",
            role: "owner",
            memberCount: options.members?.length || 1,
            canManage: true,
        },
        members: options.members || [
            {
                userId: testUser.id,
                role: "owner",
                joinedAt: "2026-05-20T12:00:00.000Z",
                businessName: "North Shore Electric",
                email: testUser.email,
            },
        ],
        pendingInvites,
    })

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

    await page.route("**/api/team/workspace", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(workspacePayload()),
        })
    })

    await page.route(/.*\/api\/team\/estimates(\?.*)?$/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: true,
                workspaceId: "workspace_1",
                count: options.estimates?.length || 0,
                estimates: options.estimates || [],
            }),
        })
    })

    await page.route("**/api/team/invites", async (route) => {
        const body = route.request().postDataJSON() as { email?: string; role?: "admin" | "member" }
        const invite = {
            inviteId: "invite_1",
            email: body.email || "tech@snapquote.test",
            role: body.role || "member",
            status: "pending" as const,
            token: "team-token-123",
            inviteUrl: "https://app.snapquote.test/team?invite=team-token-123",
            expiresAt: "2026-05-30T12:00:00.000Z",
            createdAt: "2026-05-23T12:00:00.000Z",
        }
        pendingInvites = [invite]

        await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, invite }),
        })
    })

    await page.route(/.*\/rest\/v1\/(estimates|estimate_items|estimate_sections|estimate_section_items|estimate_attachments|clients).*/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([]),
        })
    })

    await page.route("**/api/analytics/events", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
        })
    })
}

test("team mobile command center guides owner to invite first crew member", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    await mockTeamNetwork(page)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/team")

    const commandCenter = page.getByTestId("team-command-center")
    await expect(commandCenter).toBeVisible()
    await expect(commandCenter).toContainText("North Shore Electric Team")
    await expect(commandCenter).toContainText("Add one teammate")
    await expect(page.getByTestId("team-primary-action")).toContainText("Invite crew")

    const commandBox = await commandCenter.boundingBox()
    const refreshButtonBox = await page.getByRole("button", { name: "Refresh" }).boundingBox()
    const primaryActionBox = await page.getByTestId("team-primary-action").boundingBox()
    expect(commandBox).not.toBeNull()
    expect(refreshButtonBox).not.toBeNull()
    expect(primaryActionBox).not.toBeNull()
    expect(commandBox!.y + commandBox!.height).toBeLessThanOrEqual(844)
    expect(refreshButtonBox!.height).toBeGreaterThanOrEqual(44)
    expect(primaryActionBox!.height).toBeGreaterThanOrEqual(44)

    await page.getByTestId("team-primary-action").click()
    await expect(page.getByTestId("invite-crew-panel")).toBeInViewport()

    await page.getByPlaceholder("tech@crew.com").fill("tech@snapquote.test")
    await expect(page.getByLabel("Crew member role")).toHaveValue("member")
    await page.getByRole("button", { name: "Create invite" }).click()

    await expect(page.getByText("tech@snapquote.test")).toBeVisible()
    await expect(commandCenter).toContainText("Invites")
    await expect(commandCenter).toContainText("1")

    const copiedInviteUrl = await page.evaluate(() => (
        window as typeof window & { __snapquoteCopiedText?: string }
    ).__snapquoteCopiedText)
    expect(copiedInviteUrl).toContain("team-token-123")
})

test("team mobile keeps long workspace and shared estimate details readable", async ({ page, context }) => {
    const longWorkspaceName = "North Shore Commercial Electrical And Emergency Dispatch Team With Multiple Crews"
    const longClientName = "Very Long Commercial Facilities Client With Multiple Service Areas"
    const longMemberName = "Emergency Night Shift Dispatch And Long Commercial Service Crew"

    await seedAuthenticatedSupabaseSession(context)
    await mockTeamNetwork(page, {
        workspaceName: longWorkspaceName,
        members: [
            {
                userId: testUser.id,
                role: "owner",
                joinedAt: "2026-05-20T12:00:00.000Z",
                businessName: "North Shore Electric",
                email: testUser.email,
            },
            {
                userId: "00000000-0000-4000-8000-000000000002",
                role: "member",
                joinedAt: "2026-05-21T12:00:00.000Z",
                businessName: longMemberName,
                email: "very.long.crew.member.dispatch.alias+emergency-night-shift@snapquote-field-operations.example",
            },
        ],
        estimates: [
            {
                estimateId: "team-estimate-long-1",
                estimateNumber: "TEAM-2026-VERY-LONG-REFERENCE-0001",
                clientName: longClientName,
                ownerUserId: testUser.id,
                ownerBusinessName: "North Shore Electric Emergency Operations",
                status: "draft",
                totalAmount: 9188.75,
                updatedAt: "2026-05-27T12:00:00.000Z",
            },
        ],
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/team")

    const commandCenter = page.getByTestId("team-command-center")
    await expect(commandCenter).toBeVisible()
    await expect(page.getByTestId("team-workspace-name")).toContainText("Multiple Crews")
    await expect(page.getByTestId("team-primary-action-description")).toContainText(longClientName)
    await expect(page.getByTestId("team-primary-action")).toContainText("Open latest")

    const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    const workspaceNameFits = await page.getByTestId("team-workspace-name").evaluate((element) => {
        return element.scrollWidth <= element.clientWidth + 1
    })
    const primaryDescriptionFits = await page.getByTestId("team-primary-action-description").evaluate((element) => {
        return element.scrollWidth <= element.clientWidth + 1
    })
    const commandBox = await commandCenter.boundingBox()
    const primaryActionBox = await page.getByTestId("team-primary-action").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(pageFits).toBe(true)
    expect(workspaceNameFits).toBe(true)
    expect(primaryDescriptionFits).toBe(true)
    expect(commandBox).not.toBeNull()
    expect(primaryActionBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(primaryActionBox!.y + primaryActionBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("team desktop uses a shared feed and workspace access workbench", async ({ page, context }) => {
    await seedAuthenticatedSupabaseSession(context)
    await mockTeamNetwork(page)

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/team")

    const commandCenter = page.getByTestId("team-command-center")
    const workbench = page.getByTestId("team-workbench")
    const feed = page.getByTestId("shared-estimate-feed")
    const workspacePanel = page.getByTestId("team-workspace-panel")
    const workspaceAccess = page.getByTestId("workspace-access")
    const invitePanel = page.getByTestId("invite-crew-panel")
    const membersCard = page.getByTestId("team-members-card")

    await expect(commandCenter).toBeVisible()
    await expect(workbench).toBeVisible()
    await expect(feed).toBeVisible()
    await expect(workspacePanel).toBeVisible()
    await expect(workspaceAccess).toBeVisible()
    await expect(invitePanel).toBeVisible()
    await expect(membersCard).toBeVisible()
    await expect(feed).toContainText("Shared Estimate Feed")
    await expect(workspacePanel).toContainText("Workspace Access")
    await expect(workspacePanel).toContainText("Invite a crew member")

    const commandBox = await commandCenter.boundingBox()
    const workbenchBox = await workbench.boundingBox()
    const feedBox = await feed.boundingBox()
    const workspaceBox = await workspacePanel.boundingBox()
    const accessBox = await workspaceAccess.boundingBox()
    const inviteBox = await invitePanel.boundingBox()
    const membersBox = await membersCard.boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(commandBox).not.toBeNull()
    expect(workbenchBox).not.toBeNull()
    expect(feedBox).not.toBeNull()
    expect(workspaceBox).not.toBeNull()
    expect(accessBox).not.toBeNull()
    expect(inviteBox).not.toBeNull()
    expect(membersBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(commandBox!.width).toBeGreaterThan(900)
    expect(workbenchBox!.width).toBeGreaterThan(900)
    expect(feedBox!.x).toBeLessThan(workspaceBox!.x)
    expect(Math.abs(feedBox!.y - workspaceBox!.y)).toBeLessThanOrEqual(2)
    expect(feedBox!.width).toBeGreaterThan(580)
    expect(workspaceBox!.width).toBeGreaterThan(320)
    expect(accessBox!.y).toBeLessThan(navBox!.y - 120)
    expect(accessBox!.y + accessBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
    expect(inviteBox!.y).toBeGreaterThan(accessBox!.y)
    expect(inviteBox!.y + inviteBox!.height).toBeLessThanOrEqual(accessBox!.y + accessBox!.height)
    expect(membersBox!.y).toBeGreaterThan(accessBox!.y)
})

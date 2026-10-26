import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { config as loadEnv } from "dotenv"
import path from "node:path"

loadEnv({ path: ".env.local", quiet: true })

const SCREENS_DIR = path.join(process.cwd(), ".superpowers/sdd/2026-10-25-job-completion-report/screens")
const PORTAL_URL = "https://snapquote.test/q/job-done-link"
const BALANCE_LINK = "https://pay.snapquote.test/balance-link"
// 96x72 gradient PNG, decodable by createImageBitmap.
const PNG_BYTES = Buffer.from(
    "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",
    "base64"
)

type JsonRecord = Record<string, unknown>

function makeEstimate(overrides: JsonRecord = {}): JsonRecord {
    return {
        id: "estimate-job-complete",
        estimateNumber: "EST-1042",
        status: "sent",
        clientName: "Rivera Kitchen",
        clientAddress: "12 Rivera Lane",
        clientPhone: "+14165550142",
        clientEmail: "rivera@example.com",
        summary_note: "Kitchen drain and valves.",
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 1740,
        amountPaid: 500,
        createdAt: "2026-10-20T08:00:00.000Z",
        updatedAt: "2026-10-20T08:00:00.000Z",
        sentAt: "2026-10-20T08:00:00.000Z",
        customerPortalUrl: PORTAL_URL,
        customerPortalStatus: "approved",
        customerApprovedAt: "2026-10-21T08:00:00.000Z",
        synced: true,
        items: [
            { id: "item-drain", itemNumber: 1, category: "LABOR", description: "Remove old drain", quantity: 1, unit: "LS", unit_price: 640, total: 640 },
            { id: "item-ptrap", itemNumber: 2, category: "PARTS", description: "Install P-trap", quantity: 1, unit: "ea", unit_price: 600, total: 600 },
            { id: "item-leak", itemNumber: 3, category: "SERVICE", description: "Leak test", quantity: 1, unit: "LS", unit_price: 500, total: 500 },
        ],
        ...overrides,
    }
}

function getSupabaseAuthStorageKey() {
    const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname.split(".")[0]
    return `sb-${projectRef}-auth-token`
}

async function seedSession(context: BrowserContext) {
    await context.addInitScript(({ storageKey }) => {
        window.localStorage.setItem(storageKey, JSON.stringify({
            // Sync only runs with a JWT-shaped token.
            access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEifQ.test-signature",
            refresh_token: "test-refresh-token",
            token_type: "bearer",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "test@example.com" },
        }))
    }, { storageKey: getSupabaseAuthStorageKey() })
}

type Mocks = {
    completionReport?: { status: number; body: unknown; delayMs?: number }
    shareLinkFailures?: number
    smsDeduped?: boolean
    completionReportCalls: number
    finalizeUpdatedAt?: string
    /** Next finalize answers 409 COMPLETION_STATE_CHANGED with these server values (a webhook payment landed). */
    finalizeConflict?: { amountPaid: number; totalAmount: number }
    /** Cloud row served by the sync pull once AI matching ran (simulates another device's edit). */
    cloudEditOnMatch?: JsonRecord
    cloudRows: JsonRecord[]
    finalizeCalls: JsonRecord[]
    shareLinkPosts: JsonRecord[]
    smsPayloads: JsonRecord[]
    estimateUpserts: JsonRecord[]
}

async function routeApp(page: Page, options: Partial<Mocks> = {}): Promise<Mocks> {
    const mocks: Mocks = { finalizeCalls: [], shareLinkPosts: [], smsPayloads: [], estimateUpserts: [], completionReportCalls: 0, cloudRows: [], ...options }
    const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) })

    await page.route("**/auth/v1/user**", (route) => route.fulfill(json({
        id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "test@example.com",
    })))
    await page.route("**/api/quickbooks/status", (route) => route.fulfill(json({
        ok: true, planTier: "pro", eligible: true, connected: false, reconnectRequired: false, syncStats: { syncedInvoices: 0 },
    })))
    await page.route("**/api/billing/subscription", (route) => route.fulfill(json({
        ok: true, planTier: "pro", status: "active", currentPeriodEnd: "2026-12-30T00:00:00.000Z",
    })))
    await page.route("**/api/estimates/*/share-link", async (route) => {
        if (route.request().method() === "GET") {
            await route.fulfill(json({ error: { message: "Customer quote link was not found.", code: 404 } }, 404))
            return
        }
        mocks.shareLinkPosts.push(route.request().postDataJSON())
        if ((mocks.shareLinkFailures ?? 0) > 0) {
            mocks.shareLinkFailures = (mocks.shareLinkFailures ?? 0) - 1
            await route.fulfill(json({ error: { message: "Customer quote link is temporarily unavailable.", code: 500 } }, 500))
            return
        }
        await route.fulfill(json({ ok: true, shareUrl: PORTAL_URL, portal: { status: "approved", approvedAt: "2026-10-21T08:00:00.000Z" } }))
    })
    await page.route("**/api/completion-report", async (route) => {
        mocks.completionReportCalls += 1
        if (mocks.cloudEditOnMatch) mocks.cloudRows = [mocks.cloudEditOnMatch]
        if (mocks.completionReport?.delayMs) await new Promise((resolve) => setTimeout(resolve, mocks.completionReport?.delayMs))
        await route.fulfill(json(
        mocks.completionReport?.body ?? { ok: true, summary: "", items: [] },
        mocks.completionReport?.status ?? 200
        ))
    })
    await page.route("**/api/estimates/*/completion", async (route) => {
        const body = route.request().postDataJSON() as JsonRecord
        mocks.finalizeCalls.push(body)
        if (mocks.finalizeConflict) {
            const conflict = mocks.finalizeConflict
            mocks.finalizeConflict = undefined
            await route.fulfill(json({
                error: { code: "COMPLETION_STATE_CHANGED", message: "Payments changed since you opened this job. Review the updated amounts." },
                ...conflict,
            }, 409))
            return
        }
        const received = typeof body.alreadyReceived === "number" ? body.alreadyReceived : 0
        const pushed = mocks.estimateUpserts.filter((row) => row.id === "estimate-job-complete").at(-1)
        const total = typeof pushed?.total_amount === "number" ? pushed.total_amount : 1740
        const balanceDue = Math.max(0, total - received)
        await route.fulfill(json({
            ok: true,
            totalAmount: total,
            amountPaid: received,
            balanceDue,
            ...(balanceDue > 0 ? { paymentLink: BALANCE_LINK, paymentLinkId: "plink_balance" } : {}),
            status: balanceDue > 0 ? "sent" : "paid",
            paymentCompletedAt: balanceDue > 0 ? null : "2026-10-26T09:00:00.000Z",
            updatedAt: (mocks.finalizeUpdatedAt = new Date().toISOString()),
        }))
    })
    await page.route("**/api/send-sms", async (route) => {
        mocks.smsPayloads.push(route.request().postDataJSON())
        await route.fulfill(json({ ok: true, messageId: "SM_DONE", creditsRemaining: 9, ...(mocks.smsDeduped ? { deduped: true } : {}) }))
    })
    // Supabase REST used by the estimate sync and the server status read.
    await page.route("**/rest/v1/**", async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        const table = url.pathname.split("/").pop()
        const method = request.method()

        if (method === "GET") {
            await route.fulfill(json(table === "estimates" ? mocks.cloudRows : []))
            return
        }
        if (method === "POST") {
            const body = request.postDataJSON() as JsonRecord | JsonRecord[]
            if (table === "estimates") mocks.estimateUpserts.push(Array.isArray(body) ? body[0] : body)
            if (table === "clients") {
                await route.fulfill(json({ id: "client-rivera" }, 201))
                return
            }
            if (table === "estimate_sections") {
                const rows = Array.isArray(body) ? body : [body]
                await route.fulfill(json(rows.map((row) => ({ id: `section-${String(row.local_id)}`, local_id: row.local_id })), 201))
                return
            }
            await route.fulfill({ status: 201, body: "" })
            return
        }
        await route.fulfill({ status: 204, body: "" })
    })

    return mocks
}

async function seedEstimates(page: Page, records: JsonRecord[]) {
    await page.goto("/")
    await page.evaluate(async (estimates) => {
        await new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase("snapquote-db")
            request.onsuccess = () => resolve()
            request.onerror = () => resolve()
            request.onblocked = () => resolve()
        })
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("snapquote-db", 6)
            request.onerror = () => reject(request.error)
            request.onupgradeneeded = () => {
                const database = request.result
                const stores: Array<[string, Array<[string, string]>]> = [
                    ["estimates", [["by-date", "createdAt"], ["by-status", "status"]]],
                    ["photos", [["by-estimate", "estimateId"]]],
                    ["pendingAudio", [["by-date", "createdAt"], ["by-processed", "processed"]]],
                    ["priceList", [["by-category", "category"], ["by-name", "name"]]],
                    ["receipts", [["by-date", "date"]]],
                    ["timeEntries", [["by-date", "date"]]],
                    ["clients", [["by-name", "name"]]],
                ]
                for (const [name, indexes] of stores) {
                    const store = database.objectStoreNames.contains(name)
                        ? request.transaction!.objectStore(name)
                        : database.createObjectStore(name, { keyPath: "id" })
                    for (const [indexName, keyPath] of indexes) {
                        if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath)
                    }
                }
            }
            request.onsuccess = () => resolve(request.result)
        })
        const transaction = db.transaction("estimates", "readwrite")
        for (const estimate of estimates) transaction.objectStore("estimates").put(estimate)
        await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve()
            transaction.onerror = () => reject(transaction.error)
        })
        db.close()
    }, records)
}

async function readEstimate(page: Page, id: string): Promise<JsonRecord | undefined> {
    return page.evaluate(async (estimateId) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("snapquote-db", 6)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
        const record = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
            const request = db.transaction("estimates", "readonly").objectStore("estimates").get(estimateId)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
        db.close()
        return record
    }, id)
}

async function openCompletionSheet(page: Page) {
    await page.goto("/history?tab=sent&estimateId=estimate-job-complete")
    const action = page.getByTestId("history-mark-job-complete-action")
    await expect(action).toHaveText(/Mark job complete/)
    await action.click()
    await expect(page.getByTestId("job-completion-sheet")).toBeVisible()
}

async function addPhotos(page: Page, names: string[]) {
    await page.getByTestId("completion-photo-input").setInputFiles(names.map((name) => ({
        name,
        mimeType: name.endsWith(".heic") ? "image/heic" : "image/png",
        buffer: name.endsWith(".heic") ? Buffer.from("not really an image") : PNG_BYTES,
    })))
}

test.beforeEach(async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await seedSession(context)
})

test("approved quote: photos, AI review, extra work, one send, SMS carries the portal link", async ({ page }) => {
    const mocks = await routeApp(page, {
        completionReport: {
            status: 200,
            body: {
                ok: true,
                summary: "Replaced the kitchen drain and P-trap. Leak test pending photo.",
                items: [
                    { itemId: "item-drain", photoIndexes: [0], confidence: "high" },
                    { itemId: "item-ptrap", photoIndexes: [1], confidence: "high" },
                    { itemId: "item-leak", photoIndexes: [], confidence: "low" },
                ],
            },
        },
    })
    await seedEstimates(page, [
        makeEstimate(),
        makeEstimate({ id: "estimate-not-approved", estimateNumber: "EST-1043", clientName: "Viewed Only", customerPortalStatus: "viewed", customerPortalUrl: undefined }),
    ])

    await page.goto("/history?tab=sent&estimateId=estimate-job-complete")
    const card = page.getByTestId("history-mark-job-complete-action")
    await expect(card).toHaveCount(1)
    await card.scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(SCREENS_DIR, "task9-history-card.png"), animations: "disabled" })

    await card.click()
    await expect(page.getByTestId("job-completion-sheet")).toBeVisible()
    await addPhotos(page, ["drain.png", "ptrap.png"])
    await expect(page.getByTestId("completion-photo-count")).toHaveText("2 of 6")
    await page.getByTestId("completion-match-button").click()

    const rows = page.getByTestId("completion-item-row")
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toHaveAttribute("data-done", "true")
    await expect(rows.nth(1)).toHaveAttribute("data-done", "true")
    await expect(rows.nth(2)).toHaveAttribute("data-done", "false")
    await expect(page.getByTestId("completion-summary")).toHaveValue(/Replaced the kitchen drain/)
    await expect(page.getByTestId("completion-already-received")).toHaveValue("500")
    await expect(page.getByTestId("completion-send-button")).toHaveText("Send & request $1,240.00")
    await page.screenshot({ path: path.join(SCREENS_DIR, "task9-review.png"), animations: "disabled" })

    // The leak test had no photo: confirm it by tapping.
    await rows.nth(2).getByTestId("completion-item-toggle").click()
    await expect(rows.nth(2)).toHaveAttribute("data-done", "true")

    // Move photo 2 from the P-trap line onto the leak test line.
    await rows.nth(1).getByTestId("completion-photo-thumb").click()
    await page.getByTestId("completion-photo-move").selectOption("item-leak")
    await expect(rows.nth(2).getByTestId("completion-photo-thumb")).toHaveCount(1)

    await page.getByTestId("completion-add-extra").click()
    await page.getByTestId("completion-extra-description").fill("Extra shut-off valve")
    await page.getByTestId("completion-extra-amount").fill("100")
    await expect(page.getByTestId("completion-send-button")).toHaveText("Send & request $1,340.00")
    await page.getByTestId("completion-extra-row").scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(SCREENS_DIR, "task9-extra-work.png"), animations: "disabled" })

    await page.getByTestId("completion-send-button").click()

    const smsDialog = page.getByRole("dialog", { name: "Text completion report" })
    await expect(smsDialog).toBeVisible()
    await expect(smsDialog.locator("#sms-message")).toHaveValue(`Your job is done. See photos and pay the balance here: ${PORTAL_URL}`)
    await page.screenshot({ path: path.join(SCREENS_DIR, "task9-sms.png"), animations: "disabled" })

    // expectedAmountPaid is the default the sheet showed; expectedTotal is the reviewed total with extra work.
    expect(mocks.finalizeCalls).toEqual([{ alreadyReceived: 500, expectedAmountPaid: 500, expectedTotal: 1840 }])
    // The last push before finalize carries the extra work (page load pushes the original first).
    const pushed = mocks.estimateUpserts.filter((row) => row.id === "estimate-job-complete").at(-1)
    expect(pushed?.total_amount).toBe(1840)
    expect(mocks.shareLinkPosts).toHaveLength(1)
    const shareBody = mocks.shareLinkPosts[0]
    expect(shareBody.resetCustomerDecision).toBeUndefined()
    const snapshot = shareBody.estimate as JsonRecord
    const completion = snapshot.completion as JsonRecord
    expect(completion.amountPaid).toBe(500)
    expect(completion.balanceDue).toBe(1340)
    expect((completion.photos as string[]).length).toBe(2)
    expect(completion.items).toEqual([
        { itemId: "item-drain", done: true, photoIndexes: [0] },
        { itemId: "item-ptrap", done: true, photoIndexes: [] },
        { itemId: "item-leak", done: true, photoIndexes: [1] },
    ])
    expect(snapshot.paymentLink).toBe(BALANCE_LINK)
    expect(snapshot.paymentStatus).toBeUndefined()
    const sections = snapshot.sections as JsonRecord[]
    expect(sections.find((section) => section.addedOnSite === true)?.name).toBe("Added on site")

    await smsDialog.getByRole("button", { name: "Send SMS" }).click()
    await expect(page.getByTestId("toast-message-text")).toContainText("Completion report texted.")
    expect(mocks.smsPayloads[0]?.message).toContain(PORTAL_URL)

    const stored = await readEstimate(page, "estimate-job-complete")
    expect(stored?.amountPaid).toBe(500)
    expect(stored?.status).toBe("sent")
    expect(stored?.paymentLink).toBe(BALANCE_LINK)
    expect((stored?.completion as JsonRecord | undefined)?.completedAt).toMatch(/Z$/)
    // Stored past the server's finalize time + LWW buffer, so sync pushes the completion.
    expect(Date.parse(String(stored?.updatedAt))).toBeGreaterThan(Date.parse(String(mocks.finalizeUpdatedAt)) + 1000)

    await page.getByTestId("completion-done-button").click()
    await expect(page.getByTestId("history-mark-job-complete-action")).toHaveText(/Resend report/)
})

test("AI failure falls back to all '?' lines and still allows a send", async ({ page }) => {
    await routeApp(page, { completionReport: { status: 502, body: { ok: false, error: "AI matching failed" }, delayMs: 1500 } })
    await seedEstimates(page, [makeEstimate()])
    await openCompletionSheet(page)

    await addPhotos(page, ["drain.png", "broken.heic"])
    await expect(page.getByTestId("completion-skipped-files")).toContainText("broken.heic")
    await expect(page.getByTestId("completion-photo-count")).toHaveText("1 of 6")
    await page.screenshot({ path: path.join(SCREENS_DIR, "task9-heic-skipped.png"), animations: "disabled" })
    await page.getByTestId("completion-match-button").click()
    await expect(page.getByTestId("completion-matching")).toBeVisible()
    await page.screenshot({ path: path.join(SCREENS_DIR, "task9-matching.png"), animations: "disabled" })

    await expect(page.getByTestId("completion-ai-failed")).toBeVisible()
    const rows = page.getByTestId("completion-item-row")
    await expect(rows).toHaveCount(3)
    for (let index = 0; index < 3; index += 1) {
        await expect(rows.nth(index)).toHaveAttribute("data-done", "false")
    }
    await expect(page.getByTestId("completion-summary")).toHaveValue("")
    await expect(page.getByTestId("completion-unmatched-photos")).toBeVisible()
    await expect(page.getByTestId("completion-send-button")).toBeEnabled()
    await page.screenshot({ path: path.join(SCREENS_DIR, "task9-ai-fallback.png"), animations: "disabled" })

    await page.context().setOffline(true)
    await expect(page.getByTestId("completion-offline")).toBeVisible()
    await expect(page.getByTestId("completion-send-button")).toBeDisabled()
    await page.getByTestId("completion-offline").scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(SCREENS_DIR, "task9-offline.png"), animations: "disabled" })
    await page.context().setOffline(false)

    // Closing the review with unsaved work asks first; dismissing keeps the sheet.
    page.once("dialog", (dialog) => void dialog.dismiss())
    await page.getByRole("button", { name: "Close completion report" }).click()
    await expect(page.getByTestId("job-completion-sheet")).toBeVisible()
})

test("free plan limit shows the pricing link and a manual review without AI", async ({ page }) => {
    const mocks = await routeApp(page, { completionReport: { status: 402, body: { error: "Free plan includes 2 completion reports per month." } } })
    await seedEstimates(page, [makeEstimate()])
    await openCompletionSheet(page)

    await addPhotos(page, ["drain.png"])
    await page.getByTestId("completion-match-button").click()

    const limit = page.getByTestId("completion-limit")
    await expect(limit).toContainText("AI matching is used up this month")
    await expect(page.getByTestId("completion-limit-detail")).toHaveText("Free plan includes 2 completion reports per month.")
    await expect(page.getByTestId("completion-limit-pricing")).toHaveAttribute("href", "/pricing")
    await expect(page.getByTestId("completion-item-row")).toHaveCount(0)
    await page.screenshot({ path: path.join(SCREENS_DIR, "task9-free-limit.png"), animations: "disabled" })

    // Manual review: no second AI call, every line starts as "?".
    await page.getByTestId("completion-limit-manual").click()
    await expect(page.getByTestId("completion-manual-review")).toBeVisible()
    const rows = page.getByTestId("completion-item-row")
    await expect(rows).toHaveCount(3)
    for (let index = 0; index < 3; index += 1) {
        await expect(rows.nth(index)).toHaveAttribute("data-done", "false")
    }
    expect(mocks.completionReportCalls).toBe(1)
})

test("resending a finalized report reuses the stored link and never finalizes again", async ({ page }) => {
    const mocks = await routeApp(page)
    await seedEstimates(page, [makeEstimate({
        totalAmount: 1840,
        amountPaid: 500,
        paymentLink: BALANCE_LINK,
        paymentLinkId: "plink_balance",
        paymentLinkType: "custom",
        completion: {
            completedAt: "2026-10-25T10:00:00.000Z",
            summary: "Done.",
            photos: [],
            items: [{ itemId: "item-drain", done: true, photoIndexes: [] }],
        },
    })])

    await page.goto("/history?tab=sent&estimateId=estimate-job-complete")
    const action = page.getByTestId("history-mark-job-complete-action")
    await expect(action).toHaveText(/Resend report/)
    await action.click()

    await expect(page.getByTestId("completion-ready")).toBeVisible()
    await expect(page.getByTestId("completion-portal-url")).toHaveText(PORTAL_URL)
    await page.screenshot({ path: path.join(SCREENS_DIR, "task9-resend-ready.png"), animations: "disabled" })
    await page.getByTestId("completion-text-button").click()
    const smsDialog = page.getByRole("dialog", { name: "Text completion report" })
    await expect(smsDialog.locator("#sms-message")).toHaveValue(`Reminder: Your job is done. See photos and pay the balance here: ${PORTAL_URL}`)
    await smsDialog.getByRole("button", { name: "Send SMS" }).click()
    await expect(page.getByTestId("toast-message-text")).toContainText("Completion report texted.")
    expect(mocks.smsPayloads[0]?.message).toMatch(/^Reminder: /)
    expect(mocks.finalizeCalls).toHaveLength(0)
    expect(mocks.shareLinkPosts).toHaveLength(0)
})

test("a fully paid report can be resent, and a deduped text says so", async ({ page }) => {
    const mocks = await routeApp(page, { smsDeduped: true })
    await seedEstimates(page, [makeEstimate({
        status: "paid",
        amountPaid: 1740,
        paymentCompletedAt: "2026-10-25T10:00:00.000Z",
        completion: {
            completedAt: "2026-10-25T10:00:00.000Z",
            summary: "Done.",
            photos: [],
            items: [{ itemId: "item-drain", done: true, photoIndexes: [] }],
        },
    })])

    await page.goto("/history?tab=paid&estimateId=estimate-job-complete")
    const action = page.getByTestId("history-mark-job-complete-action")
    await expect(action).toHaveText(/Resend report/)
    await action.click()
    await page.getByTestId("completion-text-button").click()
    const smsDialog = page.getByRole("dialog", { name: "Text completion report" })
    await expect(smsDialog.locator("#sms-message")).toHaveValue(`Reminder: Your job is done. See the photos here: ${PORTAL_URL}`)
    await smsDialog.getByRole("button", { name: "Send SMS" }).click()
    await expect(page.getByTestId("toast-message-text")).toContainText("This exact text was already sent.")
    expect(mocks.finalizeCalls).toHaveLength(0)
})

test("finalize OK then share-link fails: retry resumes without a second finalize or a status revert", async ({ page }) => {
    const mocks = await routeApp(page, {
        shareLinkFailures: 1,
        completionReport: {
            status: 200,
            body: { ok: true, summary: "All done.", items: [{ itemId: "item-drain", photoIndexes: [0], confidence: "high" }] },
        },
    })
    await seedEstimates(page, [makeEstimate({ amountPaid: 0 })])
    await openCompletionSheet(page)

    await addPhotos(page, ["drain.png"])
    await page.getByTestId("completion-match-button").click()
    await page.getByTestId("completion-already-received").fill("1740")
    await expect(page.getByTestId("completion-send-button")).toHaveText("Send report")
    await page.getByTestId("completion-send-button").click()

    await expect(page.getByTestId("completion-resume")).toBeVisible()
    await expect(page.getByTestId("completion-send-error")).toContainText("temporarily unavailable")
    expect(mocks.finalizeCalls).toHaveLength(1)
    const upsertsAtFinalize = mocks.estimateUpserts.length
    await page.screenshot({ path: path.join(SCREENS_DIR, "task9-resume.png"), animations: "disabled" })

    const afterFailure = await readEstimate(page, "estimate-job-complete")
    expect(afterFailure?.status).toBe("paid")
    expect(afterFailure?.paymentCompletedAt).toBe("2026-10-26T09:00:00.000Z")
    expect(afterFailure?.amountPaid).toBe(1740)
    // Local carries the server's updated_at, so LWW sees the row as already in sync.
    expect(afterFailure?.updatedAt).toBe(mocks.finalizeUpdatedAt)
    expect(afterFailure?.synced).toBe(true)
    expect(afterFailure?.completion).toBeUndefined()
    expect((afterFailure?.pendingCompletion as JsonRecord | undefined)?.balanceDue).toBe(0)

    // Close and come back later: the paid card offers to finish, not to start over.
    await page.getByRole("button", { name: "Close completion report" }).click()
    await page.goto("/history?tab=paid&estimateId=estimate-job-complete")
    const action = page.getByTestId("history-mark-job-complete-action")
    await expect(action).toHaveText(/Finish report/)
    await action.click()
    await page.getByTestId("completion-resume-button").click()

    const smsDialog = page.getByRole("dialog", { name: "Text completion report" })
    await expect(smsDialog.locator("#sms-message")).toHaveValue(`Your job is done. See the photos here: ${PORTAL_URL}`)
    await smsDialog.getByRole("button", { name: "Send SMS" }).click()
    await expect(page.getByTestId("toast-message-text")).toContainText("Completion report texted.")

    expect(mocks.finalizeCalls).toHaveLength(1)
    const completion = (mocks.shareLinkPosts.at(-1)?.estimate as JsonRecord).completion as JsonRecord
    expect(completion.balanceDue).toBe(0)
    const laterPushes = mocks.estimateUpserts.slice(upsertsAtFinalize).filter((row) => row.id === "estimate-job-complete")
    expect(laterPushes.length).toBeGreaterThan(0)
    expect(laterPushes.every((row) => row.status === "paid" && row.payment_link === null)).toBe(true)
    const stored = await readEstimate(page, "estimate-job-complete")
    expect(stored?.status).toBe("paid")
    expect(stored?.pendingCompletion).toBeUndefined()
    expect((stored?.completion as JsonRecord | undefined)?.items).toBeDefined()
})

const storedCompletion = {
    completedAt: "2026-10-25T10:00:00.000Z",
    summary: "Done.",
    photos: [],
    items: [{ itemId: "item-drain", done: true, photoIndexes: [] }],
}

test("resume without the saved marker stops: no push, no finalize, extra work kept", async ({ page }) => {
    const mocks = await routeApp(page)
    const extraSection = {
        id: "section-extra",
        name: "Added on site",
        addedOnSite: true,
        items: [{ id: "item-extra", itemNumber: 1, category: "SERVICE", description: "Extra valve", quantity: 1, unit: "LS", unit_price: 100, total: 100 }],
    }
    await seedEstimates(page, [makeEstimate({
        status: "paid",
        totalAmount: 1840,
        amountPaid: 1840,
        paymentCompletedAt: "2026-10-26T09:00:00.000Z",
        sections: [extraSection],
        pendingCompletion: { completion: storedCompletion, amountPaid: 1840, balanceDue: 0 },
    })])

    await page.goto("/history?tab=paid&estimateId=estimate-job-complete")
    await expect.poll(() => mocks.estimateUpserts.length).toBeGreaterThan(0)
    const action = page.getByTestId("history-mark-job-complete-action")
    await expect(action).toHaveText(/Finish report/)
    await action.click()
    await expect(page.getByTestId("completion-resume")).toBeVisible()

    // Simulate the marker vanishing (e.g. an older client's pull) while the sheet is open.
    await page.evaluate(async (estimateId) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("snapquote-db", 6)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
        const store = db.transaction("estimates", "readwrite").objectStore("estimates")
        await new Promise<void>((resolve, reject) => {
            const read = store.get(estimateId)
            read.onerror = () => reject(read.error)
            read.onsuccess = () => {
                const record = { ...read.result }
                delete record.pendingCompletion
                const write = store.put(record)
                write.onerror = () => reject(write.error)
                write.onsuccess = () => resolve()
            }
        })
        db.close()
    }, "estimate-job-complete")
    const upsertsBefore = mocks.estimateUpserts.length

    await page.getByTestId("completion-resume-button").click()
    await expect(page.getByTestId("completion-send-error")).toContainText("We couldn't find the saved payment step. Close and reopen this job to continue.")
    expect(mocks.finalizeCalls).toHaveLength(0)
    expect(mocks.shareLinkPosts).toHaveLength(0)
    expect(mocks.estimateUpserts.length).toBe(upsertsBefore)
    const stored = await readEstimate(page, "estimate-job-complete")
    expect(stored?.totalAmount).toBe(1840)
    expect((stored?.sections as JsonRecord[] | undefined)?.[0]?.addedOnSite).toBe(true)
})

test("a stored report without a portal URL re-posts the snapshot once and never finalizes", async ({ page }) => {
    const mocks = await routeApp(page)
    await seedEstimates(page, [makeEstimate({
        totalAmount: 1740,
        amountPaid: 500,
        customerPortalUrl: undefined,
        completion: storedCompletion,
    })])

    await page.goto("/history?tab=sent&estimateId=estimate-job-complete")
    const action = page.getByTestId("history-mark-job-complete-action")
    await expect(action).toHaveText(/Resend report/)
    await action.click()

    await expect(page.getByTestId("completion-portal-url")).toHaveText(PORTAL_URL)
    expect(mocks.shareLinkPosts).toHaveLength(1)
    const shareBody = mocks.shareLinkPosts[0]
    expect(shareBody.resetCustomerDecision).toBeUndefined()
    const completion = (shareBody.estimate as JsonRecord).completion as JsonRecord
    expect(completion.amountPaid).toBe(500)
    expect(completion.balanceDue).toBe(1240)

    await page.getByTestId("completion-text-button").click()
    const smsDialog = page.getByRole("dialog", { name: "Text completion report" })
    await expect(smsDialog.locator("#sms-message")).toHaveValue(`Reminder: Your job is done. See photos and pay the balance here: ${PORTAL_URL}`)
    expect(mocks.finalizeCalls).toHaveLength(0)
    expect(mocks.shareLinkPosts).toHaveLength(1)
    expect((await readEstimate(page, "estimate-job-complete"))?.customerPortalUrl).toBe(PORTAL_URL)
})

test("a total changed on another device stops the send before finalize", async ({ page }) => {
    const mocks = await routeApp(page, {
        completionReport: { status: 200, body: { ok: true, summary: "", items: [] } },
        cloudEditOnMatch: {
            id: "estimate-job-complete",
            user_id: "00000000-0000-4000-8000-000000000001",
            estimate_number: "EST-1042",
            status: "sent",
            total_amount: 2000,
            tax_rate: 0,
            tax_amount: 0,
            created_at: "2026-10-20T08:00:00.000Z",
            updated_at: "2099-01-01T00:00:00.000Z",
            sent_at: "2026-10-20T08:00:00.000Z",
            estimate_items: [
                { id: "row-1", local_id: "item-drain", item_number: 1, category: "LABOR", description: "Remove old drain", quantity: 1, unit: "LS", unit_price: 2000, total: 2000 },
            ],
            estimate_sections: [],
            estimate_attachments: null,
            clients: { name: "Rivera Kitchen" },
        },
    })
    await seedEstimates(page, [makeEstimate()])
    await openCompletionSheet(page)

    await addPhotos(page, ["drain.png"])
    await page.getByTestId("completion-match-button").click()
    await expect(page.getByTestId("completion-item-row")).toHaveCount(3)
    await page.getByTestId("completion-send-button").click()

    await expect(page.getByTestId("completion-send-error")).toContainText("This job changed on another device. Reopen it to review the latest total.")
    expect(mocks.finalizeCalls).toHaveLength(0)
    expect(mocks.shareLinkPosts).toHaveLength(0)
    const stored = await readEstimate(page, "estimate-job-complete")
    expect(stored?.totalAmount).toBe(2000)
    expect(stored?.completion).toBeUndefined()
    expect(stored?.pendingCompletion).toBeUndefined()
})

test("a payment that landed after the sheet opened: finalize stops and refreshes the amounts in place", async ({ page }) => {
    const mocks = await routeApp(page, {
        completionReport: { status: 200, body: { ok: true, summary: "", items: [] } },
        finalizeConflict: { amountPaid: 900, totalAmount: 1740 },
    })
    await seedEstimates(page, [makeEstimate()])
    await openCompletionSheet(page)

    await addPhotos(page, ["drain.png"])
    await page.getByTestId("completion-match-button").click()
    await expect(page.getByTestId("completion-already-received")).toHaveValue("500")
    await page.getByTestId("completion-send-button").click()

    await expect(page.getByTestId("completion-send-error")).toContainText("Payments changed since you opened this job. Review the updated amounts.")
    await expect(page.getByTestId("completion-already-received")).toHaveValue("900")
    await expect(page.getByTestId("completion-balance")).toHaveText("$840.00")
    await expect(page.getByTestId("completion-send-button")).toHaveText("Send & request $840.00")
    expect(mocks.shareLinkPosts).toHaveLength(0)
    const afterConflict = await readEstimate(page, "estimate-job-complete")
    expect(afterConflict?.amountPaid).toBe(900)
    expect(afterConflict?.pendingCompletion).toBeUndefined()
    await page.getByTestId("completion-send-error").scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(SCREENS_DIR, "final-payments-changed.png"), animations: "disabled" })

    // Same sheet, no reopen: the retry confirms against the refreshed server value.
    await page.getByTestId("completion-send-button").click()
    const smsDialog = page.getByRole("dialog", { name: "Text completion report" })
    await expect(smsDialog).toBeVisible()
    expect(mocks.finalizeCalls).toHaveLength(2)
    expect(mocks.finalizeCalls[1]).toEqual({ alreadyReceived: 900, expectedAmountPaid: 900, expectedTotal: 1740 })
    const completion = (mocks.shareLinkPosts.at(-1)?.estimate as JsonRecord).completion as JsonRecord
    expect(completion.amountPaid).toBe(900)
    expect(completion.balanceDue).toBe(840)
})

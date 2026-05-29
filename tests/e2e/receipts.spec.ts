import { expect, test, type Locator } from "@playwright/test"

const tinyReceiptPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
)

async function expectTouchTarget(locator: Locator) {
    const box = await locator.boundingBox()

    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
}

test("receipt capture requires a photo before saving and stores captured cost details", async ({ page }) => {
    await page.goto("/receipts")

    const backHomeBox = await page.getByLabel("Back to home").boundingBox()
    expect(backHomeBox).not.toBeNull()
    expect(backHomeBox!.width).toBeGreaterThanOrEqual(44)
    expect(backHomeBox!.height).toBeGreaterThanOrEqual(44)

    await expect(page.getByTestId("empty-add-receipt-button")).toBeVisible()
    await page.getByTestId("empty-add-receipt-button").click()
    await expect(page.getByTestId("receipt-form-status")).toHaveText("Photo needed")
    await expect(page.getByRole("button", { name: "Save Receipt" })).toBeDisabled()
    await expect(page.getByText("Add a receipt photo before saving.")).toBeVisible()
    await expect(page.getByTestId("receipt-capture-readiness")).toContainText("Photo")
    await expect(page.getByTestId("receipt-capture-readiness")).toContainText("Needed")
    await expect(page.getByTestId("receipt-capture-readiness")).toContainText("Cost")
    await expect(page.getByTestId("receipt-capture-readiness")).toContainText("Not set")

    await page.getByPlaceholder("0.00").fill("42.50")
    await page.getByPlaceholder("Home Depot").fill("Home Depot")
    await page.getByPlaceholder("Materials, job name, or reimbursable detail").fill("Smith sink repair parts")
    await expect(page.getByRole("button", { name: "Save Receipt" })).toBeDisabled()
    await expect(page.getByTestId("receipt-capture-readiness")).toContainText("$42.50")
    await expect(page.getByTestId("receipt-capture-readiness")).toContainText("Vendor")
    await expect(page.getByTestId("receipt-capture-readiness")).toContainText("Set")

    await page.getByTestId("receipt-photo-input").setInputFiles({
        name: "receipt.png",
        mimeType: "image/png",
        buffer: tinyReceiptPng,
    })

    await expect(page.getByAltText("Receipt preview")).toBeVisible()
    await expect(page.getByTestId("receipt-form-status")).toHaveText("Ready to save")
    await expect(page.getByTestId("receipt-capture-readiness")).toContainText("Ready")
    await expect(page.getByRole("button", { name: "Save Receipt" })).toBeEnabled()
    await page.getByRole("button", { name: "Save Receipt" }).click()

    const receiptStack = page.getByTestId("receipts-stack-section")
    await expect(receiptStack.getByText("$42.50")).toBeVisible()
    await expect(receiptStack.getByText("Home Depot")).toBeVisible()
    await expect(receiptStack.getByText("Smith sink repair parts")).toBeVisible()
    await expect(page.getByTestId("receipt-card-readiness-detail")).toHaveText("Cost and vendor ready")
})

test("receipt add form keeps save controls clear of the mobile bottom navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/receipts")

    await page.getByTestId("empty-add-receipt-button").click()
    await expect(page.getByText("Capture receipt photo")).toBeVisible()

    const formActionsBox = await page.getByTestId("receipt-form-actions").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(formActionsBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(formActionsBox!.y + formActionsBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("receipt search finds notes and keeps mobile quote actions clear", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/receipts")

    await page.getByTestId("empty-add-receipt-button").click()
    await page.getByPlaceholder("0.00").fill("88.40")
    await page.getByPlaceholder("Home Depot").fill("SiteOne Supply")
    await page.getByPlaceholder("Materials, job name, or reimbursable detail").fill("Gate code 2468, irrigation repair parts")
    await page.getByTestId("receipt-photo-input").setInputFiles({
        name: "receipt.png",
        mimeType: "image/png",
        buffer: tinyReceiptPng,
    })
    await page.getByRole("button", { name: "Save Receipt" }).click()

    await page.getByTestId("receipt-search-input").fill("2468")
    const receiptStack = page.getByTestId("receipts-stack-section")
    await expect(receiptStack.getByText("SiteOne Supply")).toBeVisible()
    await expect(receiptStack.getByText("Gate code 2468, irrigation repair parts")).toBeVisible()
    await expect(page.getByTestId("receipt-search-clear")).toBeVisible()
    await expectTouchTarget(page.getByTestId("receipt-search-clear"))
    await expect(page.getByText("Quote ready")).toBeVisible()
    await expect(page.getByText("Cost saved")).toBeVisible()
    await expect(page.getByTestId("receipt-card-readiness-detail")).toHaveText("Cost and vendor ready")
    await expect(page.getByRole("button", { name: "Start quote from receipt SiteOne Supply" })).toBeVisible()

    await page.getByTestId("receipt-card-actions").scrollIntoViewIfNeeded()
    const actionRowBox = await page.getByTestId("receipt-card-actions").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()
    expect(actionRowBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(actionRowBox!.y + actionRowBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
    await expectTouchTarget(page.getByRole("button", { name: "Delete receipt" }))

    await page.getByTestId("receipt-search-input").fill("88.40")
    await expect(receiptStack.getByText("SiteOne Supply")).toBeVisible()

    await page.getByTestId("receipt-search-input").fill("nomatch")
    await expect(page.getByText("No matching receipts")).toBeVisible()
    await page.getByTestId("receipt-empty-search-clear").click()
    await expect(receiptStack.getByText("SiteOne Supply")).toBeVisible()
})

test("receipt stack keeps long vendor and note readable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/receipts")

    const longVendor = "Extremely Long Commercial Plumbing Wholesale Counter With Regional Distribution Desk"
    const longNote = "Materials for the repeated service agreement at 12345 Industrial Parkway Building C service entrance 9, include emergency after-hours dispatch fee and copper adapter photos."

    await page.getByTestId("empty-add-receipt-button").click()
    await page.getByPlaceholder("0.00").fill("1288.75")
    await page.getByPlaceholder("Home Depot").fill(longVendor)
    await page.getByPlaceholder("Materials, job name, or reimbursable detail").fill(longNote)
    await page.getByTestId("receipt-photo-input").setInputFiles({
        name: "receipt.png",
        mimeType: "image/png",
        buffer: tinyReceiptPng,
    })
    await page.getByRole("button", { name: "Save Receipt" }).click()

    const receiptCard = page.getByTestId("receipt-card").filter({ hasText: "$1288.75" })
    await expect(receiptCard).toBeVisible()
    await expect(receiptCard.getByTestId("receipt-card-vendor")).toContainText("Regional Distribution Desk")
    await expect(receiptCard.getByTestId("receipt-card-note")).toContainText("copper adapter photos")

    const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    const vendorFits = await receiptCard.getByTestId("receipt-card-vendor").evaluate((element) => {
        return element.scrollWidth <= element.clientWidth + 1
    })
    const noteFits = await receiptCard.getByTestId("receipt-card-note").evaluate((element) => {
        return element.scrollWidth <= element.clientWidth + 1
    })
    const actionsBox = await receiptCard.getByTestId("receipt-card-actions").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(pageFits).toBe(true)
    expect(vendorFits).toBe(true)
    expect(noteFits).toBe(true)
    expect(actionsBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(actionsBox!.y + actionsBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("receipts desktop uses a two-column capture workbench", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/receipts")

    await page.getByTestId("add-receipt-button").click()
    await page.getByPlaceholder("0.00").fill("54.30")
    await page.getByPlaceholder("Home Depot").fill("Desktop Supply")
    await page.getByPlaceholder("Materials, job name, or reimbursable detail").fill("Desktop receipt workbench materials")
    await page.getByTestId("receipt-photo-input").setInputFiles({
        name: "receipt.png",
        mimeType: "image/png",
        buffer: tinyReceiptPng,
    })
    await page.getByRole("button", { name: "Save Receipt" }).click()

    await expect(page.getByTestId("receipts-summary-panel")).toBeVisible()
    await expect(page.getByTestId("receipts-workbench")).toBeVisible()
    await expect(page.getByTestId("receipts-stack-column")).toBeVisible()
    await expect(page.getByTestId("receipts-search-panel")).toBeVisible()
    await expect(page.getByTestId("receipts-stack-section")).toBeVisible()
    await expect(page.getByTestId("receipts-side-panel")).toBeVisible()
    await expect(page.getByText("Receipt capture")).toBeVisible()
    await expect(page.getByText("Quote from costs")).toBeVisible()
    await expect(page.getByTestId("receipts-next-quote-source")).toHaveText(/Desktop Supply - \$54\.30/)
    await expect(page.getByTestId("receipts-next-quote-button")).toBeVisible()

    const workbenchBox = await page.getByTestId("receipts-workbench").boundingBox()
    const stackColumnBox = await page.getByTestId("receipts-stack-column").boundingBox()
    const sidePanelBox = await page.getByTestId("receipts-side-panel").boundingBox()
    const searchPanelBox = await page.getByTestId("receipts-search-panel").boundingBox()
    const firstReceiptAmountBox = await page.getByTestId("receipts-stack-section").getByText("$54.30").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(workbenchBox).not.toBeNull()
    expect(stackColumnBox).not.toBeNull()
    expect(sidePanelBox).not.toBeNull()
    expect(searchPanelBox).not.toBeNull()
    expect(firstReceiptAmountBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(workbenchBox!.width).toBeGreaterThan(900)
    expect(stackColumnBox!.x).toBeLessThan(sidePanelBox!.x)
    expect(Math.abs(stackColumnBox!.y - sidePanelBox!.y)).toBeLessThanOrEqual(2)
    expect(stackColumnBox!.width).toBeGreaterThan(620)
    expect(sidePanelBox!.width).toBeGreaterThan(300)
    expect(firstReceiptAmountBox!.y + firstReceiptAmountBox!.height).toBeLessThanOrEqual(navBox!.y - 8)

    await page.getByTestId("receipts-next-quote-button").click()
    await expect(page).toHaveURL(/\/new-estimate\?capture=type/)
    await expect(page.getByTestId("job-description-input")).toHaveValue(/Desktop Supply receipt for \$54\.30/)
})

test("receipt header action stays clear of global offline status", async ({ page, context }) => {
    await page.goto("/receipts")
    await page.waitForFunction(() => document.documentElement.dataset.snapquoteOfflineMonitor === "ready")

    await context.setOffline(true)
    await page.evaluate(() => {
        Object.defineProperty(window.navigator, "onLine", {
            configurable: true,
            get: () => false,
        })
        window.dispatchEvent(new Event("offline"))
    })

    const addButton = page.getByTestId("add-receipt-button")
    const offlineBanner = page.getByTestId("offline-status-banner")

    await expect(addButton).toBeVisible()
    await expect(offlineBanner).toBeVisible()

    const addBox = await addButton.boundingBox()
    const bannerBox = await offlineBanner.boundingBox()

    expect(addBox).not.toBeNull()
    expect(bannerBox).not.toBeNull()

    const boxesOverlap = !(
        addBox!.x + addBox!.width <= bannerBox!.x ||
        bannerBox!.x + bannerBox!.width <= addBox!.x ||
        addBox!.y + addBox!.height <= bannerBox!.y ||
        bannerBox!.y + bannerBox!.height <= addBox!.y
    )

    expect(boxesOverlap).toBe(false)
    await context.setOffline(false)
})

test("receipt delete uses in-app confirmation before removing the receipt", async ({ page }) => {
    await page.goto("/receipts")
    await page.getByTestId("add-receipt-button").click()
    await page.getByPlaceholder("0.00").fill("18.25")
    await page.getByPlaceholder("Home Depot").fill("Lowes")
    await page.getByTestId("receipt-photo-input").setInputFiles({
        name: "receipt.png",
        mimeType: "image/png",
        buffer: tinyReceiptPng,
    })
    await page.getByRole("button", { name: "Save Receipt" }).click()

    const receiptStack = page.getByTestId("receipts-stack-section")
    await expect(receiptStack.getByText("$18.25")).toBeVisible()

    let nativeDialogOpened = false
    page.on("dialog", async (dialog) => {
        nativeDialogOpened = true
        await dialog.dismiss()
    })

    await page.getByRole("button", { name: "Delete receipt" }).click()
    await expect(page.getByRole("heading", { name: "Delete receipt?" })).toBeVisible()
    expect(nativeDialogOpened).toBe(false)

    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(receiptStack.getByText("$18.25")).toBeVisible()

    await page.getByRole("button", { name: "Delete receipt" }).click()
    await page.getByRole("button", { name: "Delete" }).click()
    await expect(receiptStack.getByText("$18.25")).not.toBeVisible()
})

test("receipt card starts a quote with cost details in rough notes", async ({ page }) => {
    await page.goto("/receipts")
    await page.getByTestId("add-receipt-button").click()
    await page.getByPlaceholder("0.00").fill("64.75")
    await page.getByPlaceholder("Home Depot").fill("Ferguson Supply")
    await page.getByPlaceholder("Materials, job name, or reimbursable detail").fill("Water heater fittings for Jones job")
    await page.getByTestId("receipt-photo-input").setInputFiles({
        name: "receipt.png",
        mimeType: "image/png",
        buffer: tinyReceiptPng,
    })
    await page.getByRole("button", { name: "Save Receipt" }).click()

    await expect(page.getByTestId("receipts-stack-section").getByText("$64.75")).toBeVisible()
    await page.getByRole("button", { name: "Start quote from receipt Ferguson Supply" }).click()

    await expect(page).toHaveURL(/\/new-estimate\?capture=type$/)
    await expect(page.getByTestId("job-description-input")).toHaveValue(/Ferguson Supply receipt for \$64\.75/)
    await expect(page.getByTestId("job-description-input")).toHaveValue(/Water heater fittings for Jones job/)
    await expect(page.getByTestId("quick-generate-button")).toBeVisible()
    await expect(page.getByText("Receipt loaded. Add job context before generating.")).toBeVisible()
})

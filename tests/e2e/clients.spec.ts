import { expect, test, type Locator } from "@playwright/test"

async function expectTouchTarget(locator: Locator) {
    const box = await locator.boundingBox()

    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
}

test("client form blocks blank names and trims saved customer details", async ({ page }) => {
    await page.goto("/clients")

    await expect(page.getByTestId("bottom-nav-more")).toHaveAttribute("aria-current", "page")

    await expect(page.getByTestId("empty-add-client-button")).toBeVisible()
    await page.getByTestId("empty-add-client-button").click()
    await expect(page.getByRole("button", { name: "Save Client" })).toBeDisabled()
    await expect(page.getByText("Enter a client name to save.")).toBeVisible()

    await page.getByPlaceholder("Customer name").fill("   ")
    await expect(page.getByRole("button", { name: "Save Client" })).toBeDisabled()

    await page.getByPlaceholder("Customer name").fill("  Trimmed Client  ")
    await page.getByPlaceholder("(555) 123-4567").fill("  (555) 333-2222  ")
    await page.getByPlaceholder("client@example.com").fill("  trimmed@example.com  ")
    await page.getByPlaceholder("Service address").fill("  123 Trim St  ")
    await page.getByPlaceholder("Gate code, preferences, or site notes").fill("  Gate code 4321  ")
    await expect(page.getByRole("button", { name: "Save Client" })).toBeEnabled()
    await page.getByRole("button", { name: "Save Client" }).click()

    await expect(page.getByText("Trimmed Client")).toBeVisible()
    await expect(page.getByTestId("client-recent-status")).toHaveText("Just saved")
    await expect(page.getByTestId("toast-message")).toHaveCount(0)
    await expect(page.getByText("(555) 333-2222")).toBeVisible()
    await expect(page.getByText("trimmed@example.com")).toBeVisible()
    await expect(page.getByText("123 Trim St")).toBeVisible()
    await expect(page.getByText("Gate code 4321")).toBeVisible()
})

test("client delete uses in-app confirmation instead of native browser confirm", async ({ page }) => {
    const dialogs: string[] = []
    page.on("dialog", async (dialog) => {
        dialogs.push(dialog.type())
        await dialog.dismiss()
    })

    await page.goto("/clients")

    await page.getByRole("button", { name: "New" }).click()
    await page.getByPlaceholder("Customer name").fill("QA Test Client")
    await page.getByPlaceholder("(555) 123-4567").fill("(555) 123-4567")
    await page.getByRole("button", { name: "Save Client" }).click()

    await expect(page.getByText("QA Test Client")).toBeVisible()

    await page.getByRole("button", { name: "Delete QA Test Client" }).click()
    await expect(page.getByRole("dialog", { name: "Delete QA Test Client?" })).toBeVisible()
    expect(dialogs).toEqual([])

    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByText("QA Test Client")).toBeVisible()

    await page.getByRole("button", { name: "Delete QA Test Client" }).click()
    await page.getByRole("button", { name: "Delete" }).click()
    await expect(page.getByText("QA Test Client")).toHaveCount(0)
})

test("client add dialog keeps save controls pinned on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/clients")

    await page.getByTestId("empty-add-client-button").click()
    await expect(page.getByRole("dialog", { name: "New Client" })).toBeVisible()

    const footerBox = await page.getByTestId("client-form-actions").boundingBox()
    const saveButtonBox = await page.getByRole("button", { name: "Save Client" }).boundingBox()
    const cancelButtonBox = await page.getByRole("button", { name: "Cancel" }).boundingBox()
    const viewport = page.viewportSize()

    expect(footerBox).not.toBeNull()
    expect(saveButtonBox).not.toBeNull()
    expect(cancelButtonBox).not.toBeNull()
    expect(viewport).not.toBeNull()
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(viewport!.height - 8)
    expect(saveButtonBox!.height).toBeGreaterThanOrEqual(44)
    expect(cancelButtonBox!.height).toBeGreaterThanOrEqual(44)

    await page.getByPlaceholder("Customer name").fill("Very Long Commercial Facilities Client With Multiple Contacts")
    await page.getByPlaceholder("Service address").fill("12345 Extremely Long Industrial Parkway Building C Service Entrance 9")
    await page.getByPlaceholder("Gate code, preferences, or site notes").fill(
        "Gate code 6161, use the far east side door, call the night supervisor before arrival, do not block loading dock three."
    )

    const filledFooterBox = await page.getByTestId("client-form-actions").boundingBox()
    const filledSaveButtonBox = await page.getByRole("button", { name: "Save Client" }).boundingBox()
    const fieldsBox = await page.getByTestId("client-form-fields").boundingBox()

    expect(filledFooterBox).not.toBeNull()
    expect(filledSaveButtonBox).not.toBeNull()
    expect(fieldsBox).not.toBeNull()
    expect(fieldsBox!.y + fieldsBox!.height).toBeLessThanOrEqual(filledFooterBox!.y)
    expect(filledFooterBox!.y + filledFooterBox!.height).toBeLessThanOrEqual(viewport!.height - 8)
    expect(filledSaveButtonBox!.y).toBeGreaterThanOrEqual(filledFooterBox!.y)
    expect(filledSaveButtonBox!.y + filledSaveButtonBox!.height).toBeLessThanOrEqual(filledFooterBox!.y + filledFooterBox!.height)
})

test("client search finds address and notes with mobile contact actions", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/clients")

    const backHomeBox = await page.getByLabel("Back to home").boundingBox()
    expect(backHomeBox).not.toBeNull()
    expect(backHomeBox!.width).toBeGreaterThanOrEqual(44)
    expect(backHomeBox!.height).toBeGreaterThanOrEqual(44)

    await page.getByRole("button", { name: "New" }).click()
    await page.getByPlaceholder("Customer name").fill("Jobsite Search Client")
    await page.getByPlaceholder("(555) 123-4567").fill("(555) 808-1010")
    await page.getByPlaceholder("client@example.com").fill("jobsite@example.com")
    await page.getByPlaceholder("Service address").fill("44 Hidden Jobsite Lane")
    await page.getByPlaceholder("Gate code, preferences, or site notes").fill("Gate code 2468, side entrance")
    await page.getByRole("button", { name: "Save Client" }).click()

    await page.getByPlaceholder("Search clients, addresses, notes").fill("2468")
    await expect(page.getByText("Jobsite Search Client")).toBeVisible()
    await expect(page.getByTestId("client-recent-status")).toHaveText("Just saved")
    await expect(page.getByTestId("toast-message")).toHaveCount(0)
    await expect(page.getByText("Gate code 2468, side entrance")).toBeVisible()
    await expect(page.getByText("Quote ready")).toBeVisible()
    await expect(page.getByRole("link", { name: "Call Jobsite Search Client" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Email Jobsite Search Client" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Start quote for Jobsite Search Client" })).toBeVisible()

    await page.getByTestId("client-card-actions").scrollIntoViewIfNeeded()
    const actionRowBox = await page.getByTestId("client-card-actions").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()
    expect(actionRowBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(actionRowBox!.y + actionRowBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
    await expectTouchTarget(page.getByRole("button", { name: "Edit Jobsite Search Client" }))
    await expectTouchTarget(page.getByRole("button", { name: "Delete Jobsite Search Client" }))

    await page.getByPlaceholder("Search clients, addresses, notes").fill("Hidden Jobsite")
    await expect(page.getByText("Jobsite Search Client")).toBeVisible()
    const clearSearchBox = await page.getByTestId("client-search-clear").boundingBox()
    expect(clearSearchBox).not.toBeNull()
    expect(clearSearchBox!.width).toBeGreaterThanOrEqual(44)
    expect(clearSearchBox!.height).toBeGreaterThanOrEqual(44)

    await page.getByTestId("client-search-input").fill("zzzz-no-match")
    await expect(page.getByTestId("client-list-count")).toHaveText("0 of 1 shown")
    await expect(page.getByTestId("client-search-empty-state")).toBeVisible()
    await expect(page.getByText("No matching clients")).toBeVisible()
    await expect(page.getByText("No clients found")).toHaveCount(0)
    await page.getByTestId("client-search-empty-clear").click()
    await expect(page.getByTestId("client-list-count")).toHaveText("1 shown")
    await expect(page.getByText("Jobsite Search Client")).toBeVisible()
})

test("clients desktop uses a two-column directory workbench", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/clients")

    await page.getByRole("button", { name: "New" }).click()
    await page.getByPlaceholder("Customer name").fill("Desktop Operations Client")
    await page.getByPlaceholder("(555) 123-4567").fill("(555) 707-2020")
    await page.getByPlaceholder("client@example.com").fill("desktop@example.com")
    await page.getByPlaceholder("Service address").fill("200 Operations Way")
    await page.getByPlaceholder("Gate code, preferences, or site notes").fill("Use loading bay two")
    await page.getByRole("button", { name: "Save Client" }).click()

    await expect(page.getByTestId("clients-summary-panel")).toBeVisible()
    await expect(page.getByTestId("clients-workbench")).toBeVisible()
    await expect(page.getByTestId("clients-directory-column")).toBeVisible()
    await expect(page.getByTestId("clients-search-panel")).toBeVisible()
    await expect(page.getByTestId("clients-list-section")).toBeVisible()
    await expect(page.getByTestId("clients-side-panel")).toBeVisible()
    await expect(page.getByText("Client readiness")).toBeVisible()
    await expect(page.getByText("Next quote shortcut")).toBeVisible()
    await expect(page.getByTestId("clients-next-quote-button")).toBeVisible()

    const workbenchBox = await page.getByTestId("clients-workbench").boundingBox()
    const directoryBox = await page.getByTestId("clients-directory-column").boundingBox()
    const sidePanelBox = await page.getByTestId("clients-side-panel").boundingBox()
    const searchPanelBox = await page.getByTestId("clients-search-panel").boundingBox()
    const firstClientTitleBox = await page.getByText("Desktop Operations Client").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(workbenchBox).not.toBeNull()
    expect(directoryBox).not.toBeNull()
    expect(sidePanelBox).not.toBeNull()
    expect(searchPanelBox).not.toBeNull()
    expect(firstClientTitleBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(workbenchBox!.width).toBeGreaterThan(900)
    expect(directoryBox!.x).toBeLessThan(sidePanelBox!.x)
    expect(Math.abs(directoryBox!.y - sidePanelBox!.y)).toBeLessThanOrEqual(2)
    expect(directoryBox!.width).toBeGreaterThan(620)
    expect(sidePanelBox!.width).toBeGreaterThan(300)
    expect(firstClientTitleBox!.y + firstClientTitleBox!.height).toBeLessThanOrEqual(navBox!.y - 8)

    await page.getByTestId("clients-next-quote-button").click()
    await expect(page).toHaveURL(/\/new-estimate\?capture=type/)
    await expect(page.getByTestId("input-client-context-card")).toContainText("Desktop Operations Client")
})

test("client card starts a quote with customer details prefilled", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/clients")

    await page.getByRole("button", { name: "New" }).click()
    await page.getByPlaceholder("Customer name").fill("Field Ready Client")
    await page.getByPlaceholder("(555) 123-4567").fill("+15559091212")
    await page.getByPlaceholder("client@example.com").fill("field@example.com")
    await page.getByPlaceholder("Service address").fill("77 Jobsite Lane")
    await page.getByPlaceholder("Gate code, preferences, or site notes").fill("Gate code 9090, use side door")
    await page.getByRole("button", { name: "Save Client" }).click()

    await expect(page.getByText("Field Ready Client")).toBeVisible()
    await page.getByRole("button", { name: "Start quote for Field Ready Client" }).click()

    await expect(page).toHaveURL(/\/new-estimate\?capture=type$/)
    await expect(page.getByTestId("input-client-details-summary")).toContainText("Field Ready Client")
    await expect(page.getByTestId("input-client-details-summary")).toContainText("77 Jobsite Lane")
    await expect(page.getByTestId("input-client-details-fields")).toHaveCount(0)
    await expect(page.getByTestId("input-client-context-card")).toBeVisible()
    await expect(page.getByTestId("input-client-context-card")).toContainText("Field Ready Client")
    await expect(page.getByTestId("input-client-context-card")).toContainText("Delivery ready")
    await expect(page.getByTestId("input-client-context-card")).toContainText("Address ready")
    await expect(page.getByTestId("input-client-context-card")).toContainText("Email ready")
    await expect(page.getByTestId("input-client-context-card")).toContainText("SMS ready")
    await expect(page.getByTestId("input-client-edit-contact-button")).toBeVisible()
    await expect(page.getByTestId("input-client-site-notes")).toContainText("Site note")
    await expect(page.getByTestId("input-client-site-notes")).toContainText("Gate code 9090, use side door")
    await expect(page.getByTestId("input-client-context-card")).toContainText("Add rough scope next")
    await expect(page.getByText("Client loaded. Add the job scope to finish the quote.")).toHaveCount(0)
    await expect(page.getByTestId("toast-message")).toHaveCount(0)
    await expect(page.getByTestId("job-description-input")).toBeFocused()

    await page.getByTestId("input-edit-client-details-button").click()
    await expect(page.getByPlaceholder("Client name")).toHaveValue("Field Ready Client")
    await expect(page.getByPlaceholder("Job address")).toHaveValue("77 Jobsite Lane")
    await page.getByTestId("input-client-edit-contact-button").click()
    await expect(page.getByTestId("input-client-delivery-contact-fields")).toBeVisible()
    await expect(page.getByTestId("input-client-email-input")).toHaveValue("field@example.com")
    await expect(page.getByTestId("input-client-phone-input")).toHaveValue("+15559091212")
    await page.getByTestId("input-client-email-input").fill("updated-field@example.com")
    await expect(page.getByTestId("input-client-email-input")).toHaveValue("updated-field@example.com")
    await expect(page.getByTestId("input-client-context-card")).toContainText("Email ready")

    await page.getByTestId("job-description-input").fill(
        "Replace leaking angle stop, test supply line, and clean under-sink area."
    )
    await expect(page.getByTestId("input-client-context-card")).toContainText("Scope is ready")
    await expect(page.getByTestId("input-client-generate-button")).toBeVisible()
    await expect(page.getByTestId("input-client-generate-button")).toContainText("Generate for Field Ready Client")
    await expect(page.getByTestId("generate-estimate-button")).toHaveCount(0)
    await expect(page.getByTestId("quick-generate-button")).toHaveCount(0)

    const contextCardBox = await page.getByTestId("input-client-context-card").boundingBox()
    const generateButtonBox = await page.getByTestId("input-client-generate-button").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()
    expect(contextCardBox).not.toBeNull()
    expect(generateButtonBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(contextCardBox!.y + contextCardBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
    expect(generateButtonBox!.y + generateButtonBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("client directory keeps long customer details readable with quote action first", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/clients")

    const longClientName = "Very Long Commercial Facilities Client With Multiple Contacts And A Repeated Service Name"

    await page.getByRole("button", { name: "New" }).click()
    await page.getByPlaceholder("Customer name").fill(longClientName)
    await page.getByPlaceholder("(555) 123-4567").fill("(555) 616-1212")
    await page.getByPlaceholder("client@example.com").fill("very.long.facilities.dispatch@example-contracting-company.com")
    await page.getByPlaceholder("Service address").fill("12345 Extremely Long Industrial Parkway Building C Service Entrance 9")
    await page.getByPlaceholder("Gate code, preferences, or site notes").fill(
        "Gate code 6161, use the far east side door, call the night supervisor before arrival, do not block loading dock three."
    )
    await page.getByRole("button", { name: "Save Client" }).click()

    const clientCard = page.getByTestId("client-card").filter({ hasText: "Very Long Commercial" })
    await expect(clientCard).toBeVisible()
    await expect(clientCard.getByTestId("client-card-name")).toContainText("Repeated Service Name")
    await expect(clientCard.getByText("very.long.facilities.dispatch@example-contracting-company.com")).toBeVisible()
    await expect(clientCard.getByText("12345 Extremely Long Industrial Parkway Building C Service Entrance 9")).toBeVisible()

    const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    const titleFits = await clientCard.getByTestId("client-card-name").evaluate((element) => {
        return element.scrollWidth <= element.clientWidth + 1
    })
    const startQuoteBox = await clientCard.getByTestId("client-start-estimate-button").boundingBox()
    const callBox = await clientCard.getByRole("link", { name: /Call Very Long Commercial/ }).boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(pageFits).toBe(true)
    expect(titleFits).toBe(true)
    expect(startQuoteBox).not.toBeNull()
    expect(callBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(startQuoteBox!.y).toBeLessThan(callBox!.y)
    expect(startQuoteBox!.y + startQuoteBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("long client handoff stays contained on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/clients")

    const longClientName = "Very Long Commercial Facilities Client With Multiple Contacts And A Repeated Service Name"
    const longSiteNote = "Gate code 6161, use the far east side door, call the night supervisor before arrival, do not block loading dock three, and document water shutoff photos before starting work."

    await page.getByRole("button", { name: "New" }).click()
    await page.getByPlaceholder("Customer name").fill(longClientName)
    await page.getByPlaceholder("(555) 123-4567").fill("(555) 616-1212")
    await page.getByPlaceholder("client@example.com").fill("very.long.facilities.dispatch@example-contracting-company.com")
    await page.getByPlaceholder("Service address").fill("12345 Extremely Long Industrial Parkway Building C Service Entrance 9")
    await page.getByPlaceholder("Gate code, preferences, or site notes").fill(longSiteNote)
    await page.getByRole("button", { name: "Save Client" }).click()

    await expect(page.getByText(longClientName)).toBeVisible()
    await expect(page.getByTestId("client-recent-status")).toHaveText("Just saved")
    await expect(page.getByTestId("toast-message")).toHaveCount(0)
    await page.getByRole("button", { name: /Start quote for Very Long Commercial Facilities Client/ }).click()

    await expect(page).toHaveURL(/\/new-estimate\?capture=type$/)
    await expect(page.getByTestId("input-client-context-card")).toContainText("SMS ready")
    await expect(page.getByTestId("input-client-delivery-contact-fields")).toHaveCount(0)
    await page.getByTestId("job-description-input").fill("Replace leaking hose bibb and test shutoff.")
    await expect(page.getByTestId("input-client-generate-button")).toBeVisible()
    await expect(page.getByTestId("generate-estimate-button")).toHaveCount(0)
    await expect(page.getByTestId("input-client-site-notes")).toContainText(longSiteNote)

    const buttonOverflows = await page.getByTestId("input-client-generate-button").evaluate((element) => {
        return element.scrollWidth > element.clientWidth + 1
    })
    const siteNoteBox = await page.getByTestId("input-client-site-notes").boundingBox()
    const contextCardBox = await page.getByTestId("input-client-context-card").boundingBox()
    const generateButtonBox = await page.getByTestId("input-client-generate-button").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(buttonOverflows).toBe(false)
    expect(siteNoteBox).not.toBeNull()
    expect(contextCardBox).not.toBeNull()
    expect(generateButtonBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(siteNoteBox!.height).toBeLessThanOrEqual(76)
    expect(contextCardBox!.y + contextCardBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
    expect(generateButtonBox!.y + generateButtonBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("no-contact client can add delivery contact during handoff", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/clients")

    await page.getByRole("button", { name: "New" }).click()
    await page.getByPlaceholder("Customer name").fill("No Contact Client")
    await page.getByPlaceholder("Service address").fill("91 Contact Later Road")
    await page.getByRole("button", { name: "Save Client" }).click()

    await expect(page.getByText("No Contact Client")).toBeVisible()
    await expect(page.getByTestId("client-recent-status")).toHaveText("Just saved")
    await expect(page.getByTestId("toast-message")).toHaveCount(0)
    await page.getByRole("button", { name: "Start quote for No Contact Client" }).click()

    await expect(page).toHaveURL(/\/new-estimate\?capture=type$/)
    await expect(page.getByTestId("input-client-context-card")).toContainText("Needs contact")
    await expect(page.getByTestId("input-client-context-card")).toContainText("Add email or phone before sending")
    await expect(page.getByTestId("input-client-delivery-contact-fields")).toBeVisible()
    await page.getByTestId("input-client-email-input").fill("nocontact@example.com")

    await expect(page.getByTestId("input-client-context-card")).toContainText("Delivery ready")
    await expect(page.getByTestId("input-client-context-card")).toContainText("Email ready")
    await expect(page.getByTestId("input-client-email-input")).toHaveValue("nocontact@example.com")

    await page.getByTestId("job-description-input").fill("Replace laundry shutoff and test supply valves.")
    await expect(page.getByTestId("input-client-generate-button")).toContainText("Generate for No Contact Client")
    await expect(page.getByTestId("generate-estimate-button")).toHaveCount(0)

    const contactFieldsBox = await page.getByTestId("input-client-delivery-contact-fields").boundingBox()
    const contextCardBox = await page.getByTestId("input-client-context-card").boundingBox()
    const generateButtonBox = await page.getByTestId("input-client-generate-button").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(contactFieldsBox).not.toBeNull()
    expect(contextCardBox).not.toBeNull()
    expect(generateButtonBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(contextCardBox!.y + contextCardBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
    expect(generateButtonBox!.y + generateButtonBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

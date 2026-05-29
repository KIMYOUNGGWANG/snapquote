import { expect, test, type Locator } from "@playwright/test"

async function expectTouchTarget(locator: Locator) {
    const box = await locator.boundingBox()

    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
}

test("empty time log can start the first timer", async ({ page }) => {
    await page.goto("/time-tracking")

    await page.getByPlaceholder("Project name (optional)").fill("First service call")
    const commandCenter = page.getByTestId("time-command-center")
    await expect(commandCenter).toBeVisible()
    await expect(commandCenter).toContainText("Start labor capture")
    const elapsedDisplayFits = await page.getByTestId("time-elapsed-display").evaluate((element) => {
        return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
    })
    const commandDescriptionFits = await page.getByTestId("time-next-action-description").evaluate((element) => {
        return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
    })
    const emptyDescriptionFits = await page.getByTestId("time-empty-state-description").evaluate((element) => {
        return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
    })

    const commandBox = await commandCenter.boundingBox()
    const emptyStartButtonBox = await page.getByTestId("empty-start-time-button").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(commandBox).not.toBeNull()
    expect(emptyStartButtonBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(elapsedDisplayFits).toBe(true)
    expect(commandDescriptionFits).toBe(true)
    expect(emptyDescriptionFits).toBe(true)
    expect(emptyStartButtonBox!.height).toBeGreaterThanOrEqual(44)
    expect(commandBox!.y + commandBox!.height).toBeLessThanOrEqual(navBox!.y - 8)

    await page.getByTestId("time-next-action-button").click()

    await expect(page.getByTestId("time-timer-status")).toHaveText("Running")
    await expect(page.getByText("First service call", { exact: true })).toBeVisible()
    await expect(page.getByText("Stop to save")).toBeVisible()
})

test("time tracking desktop uses a wide timer and log workbench", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/time-tracking")

    const shell = page.getByTestId("time-shell")
    const workbench = page.getByTestId("time-workbench")
    const timerPanel = page.getByTestId("time-timer-panel")
    const insightsPanel = page.getByTestId("time-insights-panel")
    const commandCenter = page.getByTestId("time-command-center")
    const entryList = page.getByTestId("time-entry-list")

    await expect(shell).toBeVisible()
    await expect(workbench).toBeVisible()
    await expect(timerPanel).toBeVisible()
    await expect(insightsPanel).toBeVisible()
    await expect(commandCenter).toBeVisible()
    await expect(entryList).toBeVisible()
    await expect(page.getByText("Current session")).toBeVisible()
    await expect(commandCenter).toContainText("Start labor capture")

    const shellBox = await shell.boundingBox()
    const workbenchBox = await workbench.boundingBox()
    const timerBox = await timerPanel.boundingBox()
    const insightsBox = await insightsPanel.boundingBox()
    const commandBox = await commandCenter.boundingBox()
    const entryListBox = await entryList.boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(shellBox).not.toBeNull()
    expect(workbenchBox).not.toBeNull()
    expect(timerBox).not.toBeNull()
    expect(insightsBox).not.toBeNull()
    expect(commandBox).not.toBeNull()
    expect(entryListBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(shellBox!.width).toBeGreaterThan(900)
    expect(workbenchBox!.width).toBeGreaterThan(900)
    expect(timerBox!.x).toBeLessThan(insightsBox!.x)
    expect(Math.abs(timerBox!.y - insightsBox!.y)).toBeLessThanOrEqual(2)
    expect(timerBox!.width).toBeGreaterThan(580)
    expect(insightsBox!.width).toBeGreaterThan(320)
    expect(commandBox!.x).toBeGreaterThanOrEqual(insightsBox!.x)
    expect(entryListBox!.y).toBeGreaterThan(commandBox!.y + commandBox!.height)
    expect(entryListBox!.y + entryListBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
})

test("saved time entry quote action stays clear of the mobile bottom navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/time-tracking")

    await page.getByPlaceholder("Project name (optional)").fill("Jones water heater")
    await page.getByRole("button", { name: "Start Timer" }).click()
    await expect(page.getByTestId("time-timer-status")).toHaveText("Running")
    await page.getByRole("button", { name: "Stop Timer" }).click()

    await expect(page.getByText("Jones water heater", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Start quote from time entry for Jones water heater" })).toBeVisible()

    const actionsBox = await page.getByTestId("time-entry-actions").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(actionsBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(actionsBox!.y + actionsBox!.height).toBeLessThanOrEqual(navBox!.y - 8)
    await expectTouchTarget(page.getByRole("button", { name: "Start quote from time entry for Jones water heater" }))
    await expectTouchTarget(page.getByRole("button", { name: "Delete time entry for Jones water heater" }))
})

test("time tracking keeps long project names readable on mobile and trims quote handoff", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/time-tracking")

    const longProjectName = "Very Long Commercial Labor Log With Multiple Service Areas And Emergency Dispatch Notes"

    await page.getByPlaceholder("Project name (optional)").fill(`  ${longProjectName}  `)
    await page.getByRole("button", { name: "Start Timer" }).click()
    await expect(page.getByTestId("time-timer-status")).toHaveText("Running")
    await expect(page.getByTestId("time-current-session-project")).toHaveText(longProjectName)
    await page.getByRole("button", { name: "Stop Timer" }).click()

    const entryRow = page.getByTestId("time-entry-row").filter({ hasText: longProjectName })
    await expect(entryRow).toBeVisible()
    await expect(page.getByTestId("toast-message")).toHaveCount(0)
    await expect(entryRow.getByTestId("time-entry-project-name")).toContainText("Emergency Dispatch Notes")
    await expect(page.getByTestId("time-command-center")).toContainText(longProjectName)

    const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    const rowProjectFits = await entryRow.getByTestId("time-entry-project-name").evaluate((element) => {
        return element.scrollWidth <= element.clientWidth + 1
    })
    const commandDescriptionFits = await page.getByTestId("time-next-action-description").evaluate((element) => {
        return element.scrollWidth <= element.clientWidth + 1
    })
    const actionsBox = await entryRow.getByTestId("time-entry-actions").boundingBox()
    const navBox = await page.getByTestId("bottom-navigation").boundingBox()

    expect(pageFits).toBe(true)
    expect(rowProjectFits).toBe(true)
    expect(commandDescriptionFits).toBe(true)
    expect(actionsBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(actionsBox!.y + actionsBox!.height).toBeLessThanOrEqual(navBox!.y - 8)

    await entryRow.getByTestId("time-entry-start-estimate-button").click()
    await expect(page).toHaveURL(/\/new-estimate\?capture=type$/)
    await expect(page.getByTestId("job-description-input")).toHaveValue(new RegExp(`Add labor time for ${longProjectName}`))
})

test("time entry delete uses in-app confirmation before removing a log", async ({ page }) => {
    await page.goto("/time-tracking")

    await page.getByPlaceholder("Project name (optional)").fill("Jones water heater")
    await page.getByRole("button", { name: "Start Timer" }).click()

    await expect(page.getByTestId("time-timer-status")).toHaveText("Running")
    await page.getByRole("button", { name: "Stop Timer" }).click()

    await expect(page.getByText("Jones water heater", { exact: true })).toBeVisible()

    let nativeDialogOpened = false
    page.on("dialog", async (dialog) => {
        nativeDialogOpened = true
        await dialog.dismiss()
    })

    await page.getByRole("button", { name: "Delete time entry for Jones water heater" }).click()
    await expect(page.getByRole("heading", { name: "Delete Jones water heater?" })).toBeVisible()
    expect(nativeDialogOpened).toBe(false)

    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByText("Jones water heater", { exact: true })).toBeVisible()

    await page.getByRole("button", { name: "Delete time entry for Jones water heater" }).click()
    await page.getByRole("button", { name: "Delete" }).click()
    await expect(page.getByText("Jones water heater", { exact: true })).not.toBeVisible()
})

test("time entry can start a quote with labor notes prefilled", async ({ page }) => {
    await page.goto("/time-tracking")

    await page.getByPlaceholder("Project name (optional)").fill("Kitchen rough-in")
    await page.getByRole("button", { name: "Start Timer" }).click()
    await expect(page.getByTestId("time-timer-status")).toHaveText("Running")
    await page.getByRole("button", { name: "Stop Timer" }).click()

    await expect(page.getByText("Kitchen rough-in", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Start quote from time entry for Kitchen rough-in" }).click()

    await expect(page).toHaveURL(/\/new-estimate\?capture=type$/)
    await expect(page.getByTestId("job-description-input")).toHaveValue(/Add labor time for Kitchen rough-in/)
    await expect(page.getByTestId("quick-generate-button")).toBeVisible()
    await expect(page.getByText("Time entry loaded. Add materials or scope before generating.")).toBeVisible()
})

test("time entry search filters saved labor logs and clears empty results", async ({ page }) => {
    await page.goto("/time-tracking")

    await page.getByPlaceholder("Project name (optional)").fill("Kitchen rough-in")
    await page.getByRole("button", { name: "Start Timer" }).click()
    await expect(page.getByTestId("time-timer-status")).toHaveText("Running")
    await page.getByRole("button", { name: "Stop Timer" }).click()

    await page.getByPlaceholder("Project name (optional)").fill("Hidden patio repair")
    await page.getByRole("button", { name: "Start Timer" }).click()
    await expect(page.getByTestId("time-timer-status")).toHaveText("Running")
    await page.getByRole("button", { name: "Stop Timer" }).click()

    await expect(page.getByTestId("time-command-center")).toContainText("Last labor log is quote-ready")
    await expect(page.getByTestId("time-command-center")).toContainText("2 saved logs")

    await page.getByTestId("time-entry-search-input").fill("kitchen")
    const clearSearchBox = await page.getByTestId("time-entry-clear-search").boundingBox()
    expect(clearSearchBox).not.toBeNull()
    expect(clearSearchBox!.width).toBeGreaterThanOrEqual(44)
    expect(clearSearchBox!.height).toBeGreaterThanOrEqual(44)
    const entryList = page.getByTestId("time-entry-list")
    await expect(entryList.getByText("Kitchen rough-in", { exact: true })).toBeVisible()
    await expect(entryList.getByText("Hidden patio repair", { exact: true })).not.toBeVisible()

    await page.getByTestId("time-entry-search-input").fill("nomatch")
    await expect(page.getByTestId("time-entry-empty-search")).toBeVisible()

    await page.getByTestId("time-entry-clear-search").click()
    await expect(entryList.getByText("Kitchen rough-in", { exact: true })).toBeVisible()
    await expect(entryList.getByText("Hidden patio repair", { exact: true })).toBeVisible()
})

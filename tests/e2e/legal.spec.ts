import { expect, test } from "@playwright/test"

const legalPages = [
    { path: "/privacy", title: "Privacy Policy" },
    { path: "/terms", title: "Terms of Service" },
]

for (const legalPage of legalPages) {
    test(`${legalPage.title} title stays unclipped on mobile and desktop`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(legalPage.path)
        await expect(page.getByTestId("legal-page-title")).toHaveText(legalPage.title)

        const mobileTitleFits = await page.getByTestId("legal-page-title").evaluate((element) => {
            return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
        })
        expect(mobileTitleFits).toBe(true)

        await page.setViewportSize({ width: 1440, height: 900 })
        const desktopTitleFits = await page.getByTestId("legal-page-title").evaluate((element) => {
            return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
        })
        expect(desktopTitleFits).toBe(true)
    })
}

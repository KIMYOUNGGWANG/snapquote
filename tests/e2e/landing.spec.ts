import { expect, test, type Locator } from "@playwright/test"

async function getContrastRatio(locator: Locator) {
    return locator.evaluate((element) => {
        const parseRgb = (color: string) => color.match(/\d+(\.\d+)?/g)?.slice(0, 3).map(Number) ?? [0, 0, 0]
        const hasVisibleBackground = (color: string) => {
            const values = color.match(/\d+(\.\d+)?/g)?.map(Number) ?? []
            return values.length < 4 || values[3] > 0
        }
        const luminance = (rgb: number[]) => {
            const [red, green, blue] = rgb.map((channel) => {
                const normalized = channel / 255
                return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
            })

            return 0.2126 * red + 0.7152 * green + 0.0722 * blue
        }
        const style = window.getComputedStyle(element)
        let backgroundColor = style.backgroundColor
        let parent = element.parentElement
        while (!hasVisibleBackground(backgroundColor) && parent) {
            backgroundColor = window.getComputedStyle(parent).backgroundColor
            parent = parent.parentElement
        }
        const foreground = luminance(parseRgb(style.color))
        const background = luminance(parseRgb(backgroundColor))
        const lighter = Math.max(foreground, background)
        const darker = Math.min(foreground, background)

        return (lighter + 0.05) / (darker + 0.05)
    })
}

async function expectTouchTarget(locator: Locator) {
    const box = await locator.boundingBox()

    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
}

test("landing page positions SnapQuote as a multilingual field-to-English quote tool", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/landing")

    const nav = page.getByTestId("landing-nav")
    await expect(nav).toBeVisible()
    await expect(nav.getByText("SnapQuote")).toBeVisible()
    await expectTouchTarget(page.getByTestId("landing-nav-cta"))
    const navBox = await nav.boundingBox()

    await expect(page.getByRole("heading", { name: /speak in spanish or korean\./i })).toBeVisible()
    await expect(page.getByText(/send the quote in english\./i)).toBeVisible()
    await expect(page.getByText(/english quote draft ready/i)).toBeVisible()
    const heroTitleFits = await page.getByTestId("landing-hero-title").evaluate((element) => {
        return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
    })
    const freeEstimatorUpload = page.getByRole("button", { name: /Drop or tap to upload/ })
    const receiptHelperContrast = await getContrastRatio(page.getByText("Receipt, invoice, or handwritten material list"))
    const uploadLimitContrast = await getContrastRatio(page.getByText("JPEG, PNG, WebP · Max 10MB"))

    expect(navBox).not.toBeNull()
    expect(navBox!.height).toBeGreaterThanOrEqual(56)
    expect(heroTitleFits).toBe(true)
    await expectTouchTarget(freeEstimatorUpload)
    expect(receiptHelperContrast).toBeGreaterThanOrEqual(4.5)
    expect(uploadLimitContrast).toBeGreaterThanOrEqual(4.5)

    await page.getByRole("link", { name: /try the quote flow/i }).click()
    await expect(page).toHaveURL(/\/new-estimate$/)
    await expect(page.getByText("New Estimate")).toBeVisible()
})

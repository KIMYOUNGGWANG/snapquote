import { defineConfig } from "@playwright/test"

const port = Number(process.env.PORT || "3000")
const hasExternalBaseUrl = Boolean(process.env.PLAYWRIGHT_BASE_URL)
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${port}`

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    timeout: 30_000,
    expect: {
        timeout: 10_000,
    },
    reporter: process.env.CI ? "dot" : "list",
    use: {
        baseURL,
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    webServer: hasExternalBaseUrl
        ? undefined
        : {
            command: `npm run dev -- --port ${port}`,
            url: baseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
        },
    projects: [
        {
            name: "chromium",
            use: {
                browserName: "chromium",
            },
        },
    ],
})

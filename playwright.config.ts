import { defineConfig } from "@playwright/test"

const port = Number(process.env.PORT || "3000")
const hasExternalBaseUrl = Boolean(process.env.PLAYWRIGHT_BASE_URL)
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`
const workers = Number(process.env.PLAYWRIGHT_WORKERS || "1")
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === "1"

export default defineConfig({
    testDir: "./tests/e2e",
    outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || "/private/tmp/snapquote-playwright-results",
    fullyParallel: false,
    workers,
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
            reuseExistingServer,
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

import { expect, type Page } from "@playwright/test"
import path from "node:path"
import { test, type NextFixture } from "next/experimental/testmode/playwright"

// Homeowner request link (/r/[slug]). The page reads the contractor profile from Supabase on the server,
// mocked through Next's test proxy (experimental.testProxy, dev only). The two public API routes are
// mocked in the browser; their server logic is covered by tests/api/customer-request-routes.test.mjs.

const OWNER_ID = "00000000-0000-4000-8000-000000000001"
const PHOTO_FILE = path.join(process.cwd(), "public/hero-contractor.png")

function mockContractorProfile(next: NextFixture, hidePriceRange = false) {
    next.onFetch(async (request) => {
        const url = new URL(request.url)
        if (request.method === "GET" && url.pathname.endsWith("/rest/v1/profiles")) {
            if (url.searchParams.get("public_slug") !== "eq.rivera-plumbing") {
                return new Response("[]", { headers: { "content-type": "application/json" } })
            }
            const row = {
                id: OWNER_ID,
                business_name: "Rivera Plumbing",
                logo_url: null,
                email: "owner@rivera.test",
                address: "12 King St, Toronto, ON",
                request_hide_price_range: hidePriceRange,
            }
            const wantsObject = (request.headers.get("accept") || "").includes("vnd.pgrst.object")
            return new Response(JSON.stringify(wantsObject ? row : [row]), { headers: { "content-type": "application/json" } })
        }
        return "abort"
    })
}

async function addPhotoAndDiagnose(page: Page) {
    await page.getByTestId("request-photo-input").setInputFiles(PHOTO_FILE)
    await expect(page.getByRole("img", { name: "Photo 1" })).toBeVisible()
    await page.getByRole("button", { name: "bathroom" }).click()
    await page.getByLabel(/What is happening/).fill("Dripping under the sink")
    await page.getByTestId("request-diagnose").click()
}

test("request link: photo → diagnosis → contact → request sent", async ({ page, next }) => {
    mockContractorProfile(next)
    let diagnoseBody: Record<string, unknown> = {}
    let requestBody: Record<string, unknown> = {}
    await page.route("**/api/public/diagnose", async (route) => {
        diagnoseBody = route.request().postDataJSON()
        await route.fulfill({
            json: {
                ok: true,
                diagnosis: {
                    cause: "Slow leak at the P-trap slip nut under the sink.",
                    urgency: "medium",
                    priceRange: { min: 150, max: 300, currency: "CAD" },
                    beforeVisit: ["Put a bucket under the trap"],
                    confidence: "medium",
                },
                priceRangeHidden: false,
                disclaimer: "Photo-based estimate. The final price is confirmed after an on-site check.",
            },
        })
    })
    await page.route("**/api/public/requests", async (route) => {
        requestBody = route.request().postDataJSON()
        await route.fulfill({ json: { ok: true, businessName: "Rivera Plumbing" } })
    })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto("/r/rivera-plumbing")
    await expect(page.getByTestId("request-business-name")).toHaveText("Rivera Plumbing")
    await expect(page.getByTestId("request-diagnose")).toBeDisabled()

    await addPhotoAndDiagnose(page)

    await expect(page.getByTestId("request-diagnosis-cause")).toHaveText("Slow leak at the P-trap slip nut under the sink.")
    await expect(page.getByTestId("request-price-range")).toContainText("150")
    await expect(page.getByText("Put a bucket under the trap")).toBeVisible()
    await expect(page.getByText(/final price is confirmed after an on-site check/)).toBeVisible()
    expect(diagnoseBody.slug).toBe("rivera-plumbing")
    expect(diagnoseBody.space).toBe("bathroom")
    expect(diagnoseBody.photos).toHaveLength(1)
    expect(String((diagnoseBody.photos as string[])[0])).toMatch(/^data:image\/jpeg;base64,/)

    await page.getByLabel("Name").fill("Dana Lee")
    await page.getByTestId("request-send").click()
    await expect(page.getByTestId("request-contact-form").getByRole("alert")).toContainText("email or a phone number")

    await page.getByLabel("Phone").fill("416 555 0100")
    await page.getByLabel("Neighbourhood").fill("Leslieville")
    await page.getByTestId("request-send").click()

    await expect(page.getByTestId("request-sent")).toBeVisible()
    expect(requestBody).toMatchObject({ slug: "rivera-plumbing", space: "bathroom", name: "Dana Lee", phone: "416 555 0100", areaLabel: "Leslieville" })
    expect((requestBody.diagnosis as { cause: string }).cause).toContain("P-trap")
    expect(requestBody.photos).toHaveLength(1)
})

test("request link: hidden price range and unknown links", async ({ page, next }) => {
    mockContractorProfile(next, true)
    await page.route("**/api/public/diagnose", (route) => route.fulfill({
        json: {
            ok: true,
            diagnosis: { cause: "Worn toilet flapper.", urgency: "low", beforeVisit: [], confidence: "high" },
            priceRangeHidden: true,
            disclaimer: "Photo-based estimate.",
        },
    }))

    await page.goto("/r/rivera-plumbing")
    await addPhotoAndDiagnose(page)
    await expect(page.getByTestId("request-diagnosis-cause")).toHaveText("Worn toilet flapper.")
    await expect(page.getByTestId("request-price-range")).toHaveCount(0)
    await expect(page.getByText("Rivera Plumbing will quote after a quick look.")).toBeVisible()

    await page.goto("/r/nobody-here")
    await expect(page.getByTestId("request-link-unavailable")).toBeVisible()
})

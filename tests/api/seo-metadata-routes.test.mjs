import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"

import sitemap from "../../app/sitemap.ts"
import robots from "../../app/robots.ts"

const ORIGINAL_ENV = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
}

afterEach(() => {
  for (const [name, value] of Object.entries(ORIGINAL_ENV)) {
    if (typeof value === "undefined") {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
})

describe("SEO metadata routes", () => {
  test("site URL falls back to the app URL, then our own production domain", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    process.env.NEXT_PUBLIC_APP_URL = "https://app.snapquote.test/"

    assert.equal(robots().sitemap, "https://app.snapquote.test/sitemap.xml")

    delete process.env.NEXT_PUBLIC_APP_URL

    assert.equal(sitemap()[0].url, "https://snapquotes.app")
    assert.equal(robots().sitemap, "https://snapquotes.app/sitemap.xml")
  })

  test("sitemap includes current public marketing and legal routes only", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.snapquote.test"

    const entries = sitemap()
    const urls = entries.map((entry) => entry.url)

    assert.deepEqual(urls, [
      "https://app.snapquote.test",
      "https://app.snapquote.test/pricing",
      "https://app.snapquote.test/login",
      "https://app.snapquote.test/landing",
      "https://app.snapquote.test/terms",
      "https://app.snapquote.test/privacy",
    ])
    assert.equal(urls.includes("https://app.snapquote.test/new-estimate"), false)
    assert.equal(urls.includes("https://app.snapquote.test/history"), false)
  })

  test("robots advertises sitemap and blocks private runtime surfaces", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.snapquote.test"

    const output = robots()
    const primaryRule = output.rules[0]

    assert.equal(output.sitemap, "https://app.snapquote.test/sitemap.xml")
    assert.equal(primaryRule.userAgent, "*")
    assert.equal(primaryRule.allow, "/")
    assert.deepEqual(primaryRule.disallow, [
      "/auth/",
      "/api/",
      "/new-estimate",
      "/profile",
      "/receipts",
      "/time-tracking",
      "/history",
      "/clients",
      "/automation",
      "/payment-success",
    ])
  })
})

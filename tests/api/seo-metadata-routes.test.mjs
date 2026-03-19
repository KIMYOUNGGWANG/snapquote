import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"

import sitemap from "../../app/sitemap.ts"
import robots from "../../app/robots.ts"

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL

afterEach(() => {
  if (typeof ORIGINAL_SITE_URL === "undefined") {
    delete process.env.NEXT_PUBLIC_SITE_URL
    return
  }

  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL
})

describe("SEO metadata routes", () => {
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

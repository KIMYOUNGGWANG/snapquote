import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { validateAndNormalizeBusinessProfile } from "../../lib/profile-validation.ts"

describe("profile validation", () => {
    it("rejects blank business names", () => {
        const result = validateAndNormalizeBusinessProfile({
            business_name: "   ",
            phone: "",
            email: "",
            address: "",
            license_number: "",
            tax_rate: 13,
        })

        assert.equal(result.ok, false)
        assert.equal(result.error, "Business name is required.")
    })

    it("trims profile fields before saving", () => {
        const result = validateAndNormalizeBusinessProfile({
            business_name: "  Clean Trade Co  ",
            phone: "  (555) 111-2222  ",
            email: "  crew@example.com  ",
            address: "  10 Jobsite Ln  ",
            license_number: "  LIC-123  ",
            logo_url: "  data:image/png;base64,abc  ",
            state_province: "  TX  ",
            estimate_template_url: "  data:image/png;base64,template  ",
            payment_link: "  https://pay.example/clean  ",
            tax_rate: 8.25,
        })

        assert.equal(result.ok, true)
        assert.deepEqual(result.profile, {
            business_name: "Clean Trade Co",
            phone: "(555) 111-2222",
            email: "crew@example.com",
            address: "10 Jobsite Ln",
            license_number: "LIC-123",
            logo_url: "data:image/png;base64,abc",
            state_province: "TX",
            estimate_template_url: "data:image/png;base64,template",
            payment_link: "https://pay.example/clean",
            tax_rate: 8.25,
            tradeType: "",
        })
    })

    it("rejects impossible tax rates", () => {
        const result = validateAndNormalizeBusinessProfile({
            business_name: "Clean Trade Co",
            phone: "",
            email: "",
            address: "",
            license_number: "",
            tax_rate: 101,
        })

        assert.equal(result.ok, false)
        assert.equal(result.error, "Tax rate must be between 0 and 100.")
    })
})

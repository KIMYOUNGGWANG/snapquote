import fs from "node:fs"
import path from "node:path"
import dotenv from "dotenv"

const argMap = new Map()

for (const rawArg of process.argv.slice(2)) {
  if (!rawArg.startsWith("--")) continue
  const [key, value] = rawArg.slice(2).split("=", 2)
  argMap.set(key, value ?? "true")
}

for (const filename of [".env.local", ".env"]) {
  const filePath = path.join(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false, quiet: true })
  }
}

const preset = (argMap.get("preset") || "beta").trim().toLowerCase()

const groups = {
  app: [
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ],
  billing: [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_BILLING_WEBHOOK_SECRET",
    "STRIPE_BILLING_PRICE_STARTER_MONTHLY",
    "STRIPE_BILLING_PRICE_PRO_MONTHLY",
    "STRIPE_BILLING_PRICE_TEAM_MONTHLY",
  ],
  messaging: [
    "RESEND_API_KEY",
    "OPS_ALERT_EMAIL",
  ],
  jobs: [
    "CRON_SECRET",
  ],
  upstash: [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ],
}

const presets = {
  core: ["app", "ai"],
  beta: ["app", "ai", "billing", "messaging", "jobs"],
  public: ["app", "ai", "billing", "messaging", "jobs", "upstash"],
}

if (!presets[preset]) {
  console.error(`Unknown preset: ${preset}`)
  console.error(`Use one of: ${Object.keys(presets).join(", ")}`)
  process.exit(1)
}

function getMissingKeys(keys) {
  return keys.filter((key) => !process.env[key]?.trim())
}

function getAiValidation() {
  const provider = (process.env.GENERATE_AI_PROVIDER || "auto").trim().toLowerCase()

  if (provider === "openai") {
    return {
      label: "ai",
      missing: getMissingKeys(["OPENAI_API_KEY"]),
      note: "OPENAI provider selected",
    }
  }

  if (provider === "gemini") {
    return {
      label: "ai",
      missing: getMissingKeys(["GEMINI_API_KEY"]),
      note: "GEMINI provider selected",
    }
  }

  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY?.trim())
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim())
  return {
    label: "ai",
    missing: hasOpenAi || hasGemini ? [] : ["OPENAI_API_KEY or GEMINI_API_KEY"],
    note: "AUTO provider selected",
  }
}

const results = []

for (const groupName of presets[preset]) {
  if (groupName === "ai") {
    results.push(getAiValidation())
    continue
  }

  results.push({
    label: groupName,
    missing: getMissingKeys(groups[groupName]),
    note: "",
  })
}

console.log(`Validating environment for preset: ${preset}`)
console.log("")

let hasFailures = false

for (const result of results) {
  if (result.missing.length === 0) {
    const suffix = result.note ? ` (${result.note})` : ""
    console.log(`OK     ${result.label}${suffix}`)
    continue
  }

  hasFailures = true
  const suffix = result.note ? ` (${result.note})` : ""
  console.log(`MISSING ${result.label}${suffix}`)
  for (const key of result.missing) {
    console.log(`  - ${key}`)
  }
}

console.log("")

if (!process.env.TWILIO_ACCOUNT_SID?.trim()) {
  console.log("Optional: Twilio is not configured. SMS flows will stay disabled.")
}

if (preset !== "public" && (process.env.RATE_LIMIT_PROVIDER || "").trim().toLowerCase() !== "upstash") {
  console.log("Recommended: set RATE_LIMIT_PROVIDER=upstash before scaling beyond a single instance.")
}

if (hasFailures) {
  console.log("")
  console.error("Environment validation failed.")
  process.exit(1)
}

console.log("Environment validation passed.")

const argMap = new Map()

for (const rawArg of process.argv.slice(2)) {
  if (!rawArg.startsWith("--")) continue
  const [key, value] = rawArg.slice(2).split("=", 2)
  argMap.set(key, value ?? "true")
}

const baseUrl = (argMap.get("base-url") || process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "")

const checks = [
  { path: "/", contains: "Quote the job before you drive off." },
  { path: "/landing", contains: "Create Your First Driveway Quote" },
  { path: "/pricing", contains: "Pricing for trade owner-operators" },
  { path: "/manifest.json", contains: "\"name\"" },
  { path: "/robots.txt", contains: "User-Agent" },
  { path: "/sitemap.xml", contains: "urlset" },
]

async function runCheck({ path, contains }) {
  const url = `${baseUrl}${path}`
  const response = await fetch(url, {
    headers: {
      "user-agent": "snapquote-smoke-check/1.0",
    },
  })

  const body = await response.text()

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`)
  }

  if (contains && !body.includes(contains)) {
    throw new Error(`${path} did not contain expected text: ${contains}`)
  }

  return {
    path,
    status: response.status,
  }
}

async function main() {
  console.log(`Running deploy smoke checks against ${baseUrl}`)

  const results = []
  for (const check of checks) {
    const result = await runCheck(check)
    results.push(result)
    console.log(`OK ${result.status} ${result.path}`)
  }

  console.log(`Passed ${results.length} smoke checks.`)
}

main().catch((error) => {
  console.error("Smoke check failed.")
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

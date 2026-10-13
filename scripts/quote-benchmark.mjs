// Compare SnapQuote and another quoting app on the same messy field notes.
//   pnpm benchmark:quotes run    -> generates SnapQuote quotes with the production prompt
//   pnpm benchmark:quotes score  -> scores SnapQuote and pasted competitor quotes, writes a report
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildGenerateSystemPrompt } from '../lib/ai/generate-prompt.ts'
import { buildOpenAiGenerateUserContent } from '../lib/ai/generate-provider-parts.ts'
import { parsePotentialJsonContent } from '../lib/ai/json.ts'
import { normalizeEstimatePayload } from '../lib/estimates/normalize.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE_PATH = path.join(ROOT, 'tests', 'fixtures', 'mixed-field-notes-benchmark.json')
const OUT_DIR = path.join(ROOT, 'benchmark-results')
const SNAPQUOTE_DIR = path.join(OUT_DIR, 'snapquote')
const COMPETITOR_DIR = path.join(OUT_DIR, 'competitor')
// Same market as the beta ICP: Spanish-speaking crews in Texas.
const BENCHMARK_PROFILE = { city: 'Houston', country: 'USA', taxRate: 8.25, businessName: 'Benchmark Crew' }

function normalizeText(text) {
  return ` ${String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
}

export function scoreTargets(text, targetGroups) {
  const haystack = normalizeText(text)
  const missing = []
  for (const group of targetGroups) {
    const found = group.some((term) => haystack.includes(normalizeText(term).trimEnd()))
    if (!found) missing.push(group[0])
  }
  return { hits: targetGroups.length - missing.length, total: targetGroups.length, missing }
}

export function quoteText(estimate) {
  const items = Array.isArray(estimate.items) ? estimate.items : []
  const sectionItems = Array.isArray(estimate.sections)
    ? estimate.sections.flatMap((section) => (Array.isArray(section?.items) ? section.items : []))
    : []
  return [...items, ...sectionItems]
    .map((item) => item?.description)
    .concat(estimate.summary_note)
    .filter((value) => typeof value === 'string' && value.trim())
    .join('\n')
}

async function loadFixtures() {
  return JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function generateSnapQuote(fixture, apiKey, model) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildGenerateSystemPrompt(BENCHMARK_PROFILE, 'residential', fixture.sourceLanguage) },
        { role: 'user', content: buildOpenAiGenerateUserContent({ notes: fixture.notes }) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1500,
    }),
  })
  if (!response.ok) {
    throw new Error(`OpenAI ${response.status} for ${fixture.id}: ${await response.text()}`)
  }
  const body = await response.json()
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error(`No content for ${fixture.id}`)
  return normalizeEstimatePayload(parsePotentialJsonContent(content))
}

async function run() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing. Run through `pnpm benchmark:quotes run` so .env.local is loaded.')
  const model = process.env.OPENAI_GENERATE_MODEL?.trim() || 'gpt-4o'
  await mkdir(SNAPQUOTE_DIR, { recursive: true })
  await mkdir(COMPETITOR_DIR, { recursive: true })

  for (const fixture of await loadFixtures()) {
    const estimate = await generateSnapQuote(fixture, apiKey, model)
    await writeFile(path.join(SNAPQUOTE_DIR, `${fixture.id}.json`), `${JSON.stringify(estimate, null, 2)}\n`)

    const competitorPath = path.join(COMPETITOR_DIR, `${fixture.id}.txt`)
    if ((await readOptional(competitorPath)) === null) {
      const header = `# Paste the competitor quote line items below this header.\n# Notes to enter: ${fixture.notes}\n`
      await writeFile(competitorPath, header)
    }
    console.log(`generated ${fixture.id}: ${estimate.items.length} lines`)
  }
}

function stripHeader(text) {
  return text.split('\n').filter((line) => !line.startsWith('#')).join('\n').trim()
}

function formatScore(result) {
  if (!result) return '-'
  const missing = result.missing.length ? ` (missing: ${result.missing.join(', ')})` : ''
  return `${result.hits}/${result.total}${missing}`
}

async function score() {
  const rows = []
  for (const fixture of await loadFixtures()) {
    const snapRaw = await readOptional(path.join(SNAPQUOTE_DIR, `${fixture.id}.json`))
    const competitorRaw = await readOptional(path.join(COMPETITOR_DIR, `${fixture.id}.txt`))
    const competitorText = competitorRaw === null ? '' : stripHeader(competitorRaw)
    const snapEstimate = snapRaw === null ? null : JSON.parse(snapRaw)

    rows.push({
      fixture,
      snap: snapEstimate ? scoreTargets(quoteText(snapEstimate), fixture.englishTargets) : null,
      snapTbd: snapEstimate ? snapEstimate.items.filter((item) => /price tbd/i.test(item.description)).length : null,
      competitor: competitorText ? scoreTargets(competitorText, fixture.englishTargets) : null,
    })
  }

  const sum = (key) => rows.reduce((total, row) => total + (row[key]?.hits ?? 0), 0)
  const possible = (key) => rows.reduce((total, row) => total + (row[key]?.total ?? 0), 0)
  const lines = [
    '# Quote benchmark report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Note | Language | SnapQuote terms | SnapQuote TBD lines | Competitor terms | SnapQuote sendable (1-5) | Competitor sendable (1-5) |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((row) => `| ${row.fixture.id} | ${row.fixture.sourceLanguage} | ${formatScore(row.snap)} | ${row.snapTbd ?? '-'} | ${formatScore(row.competitor)} | | |`),
    '',
    `SnapQuote term coverage: ${sum('snap')}/${possible('snap')}`,
    `Competitor term coverage: ${sum('competitor')}/${possible('competitor')}`,
    '',
    'Fill the two sendable columns by hand: 5 means you would send it to a customer without edits.',
  ]
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(path.join(OUT_DIR, 'report.md'), `${lines.join('\n')}\n`)
  console.log(lines.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2]
  const action = command === 'run' ? run : command === 'score' ? score : null
  if (!action) {
    console.error('Usage: pnpm benchmark:quotes <run|score>')
    process.exit(1)
  }
  action().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}

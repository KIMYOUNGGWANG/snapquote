import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'spanish-voice-to-english-beta.json')

async function loadFixtures() {
  const raw = await readFile(FIXTURE_PATH, 'utf8')
  return JSON.parse(raw)
}

describe('Spanish voice-to-English beta fixtures', () => {
  test('contains 20 curated Spanish trade-note scenarios', async () => {
    const fixtures = await loadFixtures()

    assert.equal(Array.isArray(fixtures), true)
    assert.equal(fixtures.length, 20)
  })

  test('covers core beta trades with unique ids and English normalization targets', async () => {
    const fixtures = await loadFixtures()
    const ids = new Set()
    const trades = new Set()

    for (const fixture of fixtures) {
      assert.equal(typeof fixture.id, 'string')
      assert.equal(ids.has(fixture.id), false)
      ids.add(fixture.id)

      assert.equal(typeof fixture.trade, 'string')
      trades.add(fixture.trade)

      assert.equal(typeof fixture.spanishNotes, 'string')
      assert.match(fixture.spanishNotes, /[a-z]/i)

      assert.equal(Array.isArray(fixture.englishTargets), true)
      assert.ok(fixture.englishTargets.length >= 2)
      for (const target of fixture.englishTargets) {
        assert.equal(typeof target, 'string')
        assert.ok(target.trim().length > 0)
      }

      assert.equal(typeof fixture.englishIntent, 'string')
      assert.match(fixture.englishIntent, /[A-Za-z]/)
    }

    assert.deepEqual(
      [...trades].sort(),
      ['electrical', 'general_repair', 'hvac', 'plumbing']
    )
  })
})

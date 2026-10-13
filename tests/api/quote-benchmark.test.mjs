import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, test } from 'node:test'

import { quoteText, scoreTargets } from '../../scripts/quote-benchmark.mjs'

describe('quote benchmark scoring', () => {
  test('counts a target group when any synonym appears, ignoring case and punctuation', () => {
    const text = 'Replace P-Trap under kitchen sink; new Angle-Stop valve'
    const result = scoreTargets(text, [['p trap'], ['angle stop', 'supply valve'], ['disposal', 'disposer']])

    assert.deepEqual(result, { hits: 2, total: 3, missing: ['disposal'] })
  })

  test('matches word starts so plurals count but substrings inside words do not', () => {
    assert.equal(scoreTargets('Replace 12 shingles', [['shingle']]).hits, 1)
    assert.equal(scoreTargets('Entrapment check', [['trap']]).hits, 0)
  })

  test('builds quote text from line descriptions and the summary', () => {
    const text = quoteText({ items: [{ description: 'Wax Ring' }], sections: [{ items: [{ description: 'Flapper' }] }], summary_note: 'Toilet repair' })

    assert.equal(text, 'Wax Ring\nFlapper\nToilet repair')
  })
})

describe('mixed field notes benchmark fixtures', () => {
  test('has 10 unique notes with language hints and target groups', async () => {
    const fixtures = JSON.parse(await readFile(new URL('../fixtures/mixed-field-notes-benchmark.json', import.meta.url), 'utf8'))
    const ids = new Set(fixtures.map((fixture) => fixture.id))

    assert.equal(fixtures.length, 10)
    assert.equal(ids.size, 10)
    for (const fixture of fixtures) {
      assert.ok(['es', 'ko', 'en', 'auto'].includes(fixture.sourceLanguage), fixture.id)
      assert.ok(fixture.notes.trim().length > 0, fixture.id)
      assert.ok(fixture.englishTargets.length >= 3, fixture.id)
      for (const group of fixture.englishTargets) {
        assert.ok(Array.isArray(group) && group.length > 0, fixture.id)
      }
    }
  })
})

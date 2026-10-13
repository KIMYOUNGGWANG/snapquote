import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { parsePotentialJsonContent, JsonContentParseError } from '@/lib/ai/json'

describe('AI JSON parsing helpers', () => {
  test('parses raw JSON content', () => {
    const parsed = parsePotentialJsonContent('{"items":[{"description":"Install valve"}]}')

    assert.deepEqual(parsed, {
      items: [
        {
          description: 'Install valve',
        },
      ],
    })
  })

  test('unwraps fenced JSON content', () => {
    const parsed = parsePotentialJsonContent(`
\`\`\`json
{
  "ok": true,
  "warnings": ["verify site access"]
}
\`\`\`
`)

    assert.deepEqual(parsed, {
      ok: true,
      warnings: ['verify site access'],
    })
  })

  test('throws a typed empty-content error with route-specific copy', () => {
    assert.throws(
      () => parsePotentialJsonContent('   ', { emptyMessage: 'Parse provider returned empty content' }),
      (error) => error instanceof JsonContentParseError
        && error.reason === 'empty'
        && error.message === 'Parse provider returned empty content'
    )
  })
})

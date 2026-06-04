import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  GeminiContentError,
  extractGeminiText,
  requireGeminiText,
} from '@/lib/ai/gemini'

describe('Gemini response helpers', () => {
  test('extracts the first non-empty text part', () => {
    const text = extractGeminiText({
      candidates: [
        {
          content: {
            parts: [
              { text: '   ' },
              { text: ' Follow up on estimate EST-100. ' },
            ],
          },
        },
      ],
    })

    assert.equal(text, 'Follow up on estimate EST-100.')
  })

  test('returns an empty string when no text parts are available', () => {
    const text = extractGeminiText({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType: 'image/png' } }],
          },
        },
      ],
    })

    assert.equal(text, '')
  })

  test('throws a typed block error when required text is blocked', () => {
    assert.throws(
      () => requireGeminiText({
        promptFeedback: {
          blockReason: 'SAFETY',
        },
      }),
      (error) => error instanceof GeminiContentError
        && error.reason === 'blocked'
        && error.message === 'Gemini blocked the request: SAFETY'
    )
  })

  test('throws a typed empty error when required text is missing', () => {
    assert.throws(
      () => requireGeminiText({ candidates: [] }),
      (error) => error instanceof GeminiContentError
        && error.reason === 'empty'
        && error.message === 'Gemini returned empty content'
    )
  })
})

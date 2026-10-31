import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateAiCostUsd } from '@/lib/ai/generate-provider'

test('prices AI usage per model and falls back to gpt-4o', () => {
  assert.equal(estimateAiCostUsd('gpt-4o', 1_000_000, 1_000_000), 12.5)
  assert.equal(estimateAiCostUsd('gemini-2.5-flash', 1_000_000, 1_000_000), 2.8)
  assert.equal(estimateAiCostUsd('some-new-model', 1_000_000, 0), 2.5)
  assert.equal(estimateAiCostUsd(undefined, 0, 0), 0)
})

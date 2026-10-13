import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { buildGenerateSystemPrompt } from '../../lib/ai/generate-prompt.ts'

describe('generate system prompt', () => {
  test('preserves escaped output placeholder literals in standard prompts', () => {
    // Given: a profile whose values would be obvious if placeholders were accidentally interpolated.
    const prompt = buildGenerateSystemPrompt(
      {
        country: 'USA',
        businessName: 'Pipe Co',
      },
      'residential',
      'es'
    )

    // When: the prompt is assembled for a standard estimate.
    // Then: legacy output-template placeholders remain literal inside the prompt text.
    assert.match(prompt, /\*\*ASSUME ALL CURRENCY IS LOCAL \(\$\{currencyCode\}\)\.\*\*/)
    assert.match(
      prompt,
      /"payment_terms": "\$\{country === 'Canada' \? 'Payment due upon completion\. E-transfer or credit card accepted\. HST applies\.' : 'Payment due upon completion\. Check, Zelle, or card accepted\.'\}"/
    )
    assert.match(
      prompt,
      /"closing_note": "Thank you for choosing \$\{businessName\}\. We stand behind our work with a 90-day guarantee\."/
    )
    assert.doesNotMatch(prompt, /\*\*ASSUME ALL CURRENCY IS LOCAL \(USD\)\.\*\*/)
    assert.doesNotMatch(prompt, /Thank you for choosing Pipe Co/)
  })

  test('preserves escaped output placeholder literals in photo estimate prompts', () => {
    // Given: photo estimate mode with business context and photo context.
    const prompt = buildGenerateSystemPrompt(
      {
        country: 'Canada',
        businessName: 'SnapQuote Field',
      },
      'commercial',
      'auto',
      'photo_estimate',
      'Customer wants a finish-ready repair.'
    )

    // When: the prompt is assembled for photo estimating.
    // Then: photo instructions are present and output-template placeholders remain literal.
    assert.match(prompt, /PHOTO ESTIMATE MODE/)
    assert.match(prompt, /Customer wants a finish-ready repair/)
    assert.match(prompt, /\*\*ASSUME ALL CURRENCY IS LOCAL \(\$\{currencyCode\}\)\.\*\*/)
    assert.match(prompt, /"payment_terms": "\$\{country === 'Canada' \?/)
    assert.match(prompt, /Thank you for choosing \$\{businessName\}/)
    assert.doesNotMatch(prompt, /\*\*ASSUME ALL CURRENCY IS LOCAL \(CAD\)\.\*\*/)
    assert.doesNotMatch(prompt, /Thank you for choosing SnapQuote Field/)
  })
})

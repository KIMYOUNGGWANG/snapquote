import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { buildGenerateSystemPrompt } from '../../lib/ai/generate-prompt.ts'

describe('generate system prompt', () => {
  test('uses US currency, pricing, and payment terms for a USA profile', () => {
    const prompt = buildGenerateSystemPrompt(
      {
        country: 'USA',
        businessName: 'Pipe Co',
      },
      'residential',
      'es'
    )

    assert.match(prompt, /\*\*ASSUME ALL CURRENCY IS LOCAL \(USD\)\.\*\*/)
    assert.match(prompt, /US market pricing \(USD\)/)
    assert.match(prompt, /"payment_terms": "Payment due upon completion\. Check, Zelle, or card accepted\."/)
    assert.match(prompt, /- Location: USA\n/)
    assert.doesNotMatch(prompt, /Canadian market pricing|Toronto|\$\{currencyCode\}/)
    // closing_note keeps its literal placeholder; only country-dependent fields changed.
    assert.match(
      prompt,
      /"closing_note": "Thank you for choosing \$\{businessName\}\. We stand behind our work with a 90-day guarantee\."/
    )
  })

  test('keeps a 0% tax rate instead of falling back to 13%', () => {
    const prompt = buildGenerateSystemPrompt({ country: 'USA', taxRate: 0 })

    assert.match(prompt, /- Tax Rate: 0%/)
  })

  test('uses Canadian currency and pricing for a Canada photo estimate', () => {
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
    // Then: photo instructions are present and Canadian pricing is used.
    assert.match(prompt, /PHOTO ESTIMATE MODE/)
    assert.match(prompt, /Customer wants a finish-ready repair/)
    assert.match(prompt, /\*\*ASSUME ALL CURRENCY IS LOCAL \(CAD\)\.\*\*/)
    assert.match(prompt, /Canadian market pricing \(CAD\)/)
    assert.match(prompt, /- Location: Toronto, Canada\n/)
    assert.match(prompt, /"payment_terms": "Payment due upon completion\. E-transfer or credit card accepted\. HST applies\."/)
    assert.match(prompt, /Thank you for choosing \$\{businessName\}/)
    assert.doesNotMatch(prompt, /US market pricing/)
  })

  test('tells the model to keep the price list item name as the line description', () => {
    const prompt = buildGenerateSystemPrompt(
      { country: 'USA', priceList: '- "Toilet Installation": $180/LS [LABOR] (keywords: toilet)' },
      'residential',
      'es'
    )

    assert.match(prompt, /use that item's exact name as the line description/)
  })
})

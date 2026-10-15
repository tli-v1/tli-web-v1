import { describe, expect, it } from 'vitest'
import { normalizeSpokenAmounts } from './spokenAmounts'

describe('normalizeSpokenAmounts', () => {
  it('normalizes spoken dollar amounts', () => {
    expect(normalizeSpokenAmounts(
      'Thirty thousand dollars in damages.',
    )).toBe('$30,000 in damages.')
  })

  it('normalizes damage amounts without an explicit dollar word', () => {
    expect(normalizeSpokenAmounts(
      'Around twenty thousand in property damage.',
    )).toBe('Around $20,000 in property damage.')
  })

  it('normalizes compound amounts', () => {
    expect(normalizeSpokenAmounts(
      'I had one hundred fifty dollars in medical bills.',
    )).toBe('I had $150 in medical bills.')
  })

  it('does not convert unrelated number words', () => {
    expect(normalizeSpokenAmounts(
      'I missed five days and talked to two people.',
    )).toBe('I missed five days and talked to two people.')
  })
})

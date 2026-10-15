import { describe, expect, it } from 'vitest'
import { normalizeSpokenNumberSequences } from './spokenNumbers'

describe('normalizeSpokenNumberSequences', () => {
  it('formats a ten-digit phone number spoken one digit at a time', () => {
    expect(normalizeSpokenNumberSequences(
      'Seven oh four two four one four nine seven nine.',
    )).toBe('(704) 241-4979.')
  })

  it('normalizes a phone number within a longer response', () => {
    expect(normalizeSpokenNumberSequences(
      'My phone number is nine one nine, five five five, zero one two three and I prefer text.',
    )).toBe('My phone number is (919) 555-0123 and I prefer text.')
  })

  it('formats a seven-digit local number', () => {
    expect(normalizeSpokenNumberSequences(
      'Two four one four nine seven nine.',
    )).toBe('241-4979.')
  })

  it('does not convert ordinary short uses of number words', () => {
    expect(normalizeSpokenNumberSequences(
      'One person called four times over two days.',
    )).toBe('One person called four times over two days.')
  })
})

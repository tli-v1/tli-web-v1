import { describe, expect, it } from 'vitest'
import { resolveLocation } from './locationNormalization'

describe('resolveLocation', () => {
  it('normalizes a full state name returned by extraction', () => {
    expect(resolveLocation('Kansas City', 'Missouri', '', { answers: {} })).toEqual({
      city: 'Kansas City',
      stateCode: 'MO',
      locationDetails: '',
    })
  })

  it('recovers city and state from the focused location answer', () => {
    expect(resolveLocation('', '', '', {
      answers: {
        location: 'It happened at Main Street in Kansas City, Missouri.',
      },
    })).toEqual({
      city: 'Kansas City',
      stateCode: 'MO',
      locationDetails: 'It happened at Main Street in Kansas City, Missouri.',
    })
  })

  it('supports postal state codes in a spoken location', () => {
    expect(resolveLocation('', '', '', {
      answers: { location: 'Near downtown Charlotte, NC.' },
    })).toEqual({
      city: 'downtown Charlotte',
      stateCode: 'NC',
      locationDetails: 'Near downtown Charlotte, NC.',
    })
  })
})

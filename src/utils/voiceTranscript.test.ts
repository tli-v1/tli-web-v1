import { describe, expect, it } from 'vitest'
import { normalizeVoiceTranscript } from './voiceTranscript'

describe('normalizeVoiceTranscript', () => {
  it('removes a matching spelled last-name clarification', () => {
    expect(normalizeVoiceTranscript(
      'Ethan Zhang, Z-H-A-N-G.',
    )).toBe('Ethan Zhang.')
  })

  it('removes multiple matching name clarifications', () => {
    expect(normalizeVoiceTranscript(
      'my name is Ethan, E-T-H-A-N, Zhang, Z H A N G.',
    )).toBe('My name is Ethan Zhang.')
  })

  it('removes a proper name repeated by speech recognition', () => {
    expect(normalizeVoiceTranscript(
      'Ethan Zhang Zhang',
    )).toBe('Ethan Zhang')
  })

  it('preserves intentional repeated lowercase words', () => {
    expect(normalizeVoiceTranscript(
      'it was very very painful',
    )).toBe('It was very very painful')
  })

  it('keeps a spelling that does not match the preceding word', () => {
    expect(normalizeVoiceTranscript(
      'The reference is code A-B-C.',
    )).toBe('The reference is code A-B-C.')
  })

  it('also formats spoken phone numbers', () => {
    expect(normalizeVoiceTranscript(
      'my name is Ethan Zhang, Z-H-A-N-G, and my number is seven oh four two four one four nine seven nine.',
    )).toBe('My name is Ethan Zhang and my number is (704) 241-4979.')
  })

  it('cleans transcript spacing without changing the words', () => {
    expect(normalizeVoiceTranscript(
      '  i was  injured yesterday ,  near downtown.  ',
    )).toBe('I was injured yesterday, near downtown.')
  })
})

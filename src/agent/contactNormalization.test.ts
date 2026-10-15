import { describe, expect, it } from 'vitest'
import {
  resolveFullName,
  resolvePhoneNumber,
  resolvePreferredContact,
} from './contactNormalization'

describe('resolvePhoneNumber', () => {
  it('extracts and normalizes a phone number from a voice transcript', () => {
    expect(resolvePhoneNumber('', {
      answers: {
        whatHappened: 'Agent: What is your phone number?\nUser: It is 404-555-0198.',
      },
    })).toBe('(404) 555-0198')
  })

  it('prioritizes the explicit contact answer', () => {
    expect(resolvePhoneNumber('(212) 555-0100', {
      answers: {
        whatHappened: 'The business phone number was 404-555-0198.',
        contact: 'My number is (678) 555-0142 and I prefer text.',
      },
    })).toBe('(678) 555-0142')
  })

  it('uses the structured value when the transcript has no phone number', () => {
    expect(resolvePhoneNumber('(212) 555-0100', {
      answers: { contact: 'I prefer a phone call.' },
    })).toBe('(212) 555-0100')
  })

  it('uses the latest phone number in a chronological voice transcript', () => {
    expect(resolvePhoneNumber('', {
      answers: {
        whatHappened: [
          'User: The business number is 404-555-0198.',
          'Agent: What is the best phone number to reach you?',
          'User: My number is 678-555-0142.',
        ].join('\n'),
      },
    })).toBe('(678) 555-0142')
  })

  it('recovers the name from focused contact answers', () => {
    expect(resolveFullName('', {
      answers: {
        contact: 'My name is Ethan Zhang.\n(704) 241-4979.\nEmail.',
      },
    })).toBe('Ethan Zhang')
  })

  it('removes a repeated spelled-name transcription', () => {
    expect(resolveFullName('Ethan Zhang Zhang', {
      answers: {},
    })).toBe('Ethan Zhang')
  })

  it('uses the latest preferred-contact answer', () => {
    expect(resolvePreferredContact('', {
      answers: {
        contact: 'Ethan Zhang.\n(704) 241-4979.\nI prefer a text message.',
      },
    })).toBe('text')
  })
})

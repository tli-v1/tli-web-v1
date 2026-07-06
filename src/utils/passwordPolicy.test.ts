import { describe, expect, it } from 'vitest'
import { getPasswordPolicyError } from './passwordPolicy'

describe('getPasswordPolicyError', () => {
  it('accepts a password that meets every requirement', () => {
    expect(getPasswordPolicyError('Correct-horse-7')).toBeNull()
  })

  it('rejects passwords shorter than 12 characters', () => {
    expect(getPasswordPolicyError('Short-7')).toBe(
      'Password must be at least 12 characters long.',
    )
  })

  it('requires an uppercase letter', () => {
    expect(getPasswordPolicyError('12345678901!')).toBe(
      'Password must include at least one uppercase letter.',
    )
  })

  it('does not count lowercase letters toward the uppercase requirement', () => {
    expect(getPasswordPolicyError('long-password7!')).toBe(
      'Password must include at least one uppercase letter.',
    )
  })

  it('requires a number', () => {
    expect(getPasswordPolicyError('Long-password!')).toBe(
      'Password must include at least one number.',
    )
  })

  it('requires a special character', () => {
    expect(getPasswordPolicyError('Longpassword7')).toBe(
      'Password must include at least one special character, such as !, @, #, $, or %.',
    )
  })

  it('does not count whitespace as a special character', () => {
    expect(getPasswordPolicyError('Long password7')).toBe(
      'Password must include at least one special character, such as !, @, #, $, or %.',
    )
  })
})

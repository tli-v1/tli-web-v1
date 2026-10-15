export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_REQUIREMENTS =
  `Use at least ${PASSWORD_MIN_LENGTH} characters, including an uppercase letter, a number, and a special character such as !, @, #, $, or %.`

export function getPasswordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter.'
  }
  if (!/\d/.test(password)) {
    return 'Password must include at least one number.'
  }
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    return 'Password must include at least one special character, such as !, @, #, $, or %.'
  }
  return null
}

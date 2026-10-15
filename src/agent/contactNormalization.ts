import type { ChatIntakeDraft } from './intakeFlow'

const US_PHONE_PATTERN =
  /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/

export function resolvePhoneNumber(
  extractedValue: unknown,
  draft: ChatIntakeDraft,
): string {
  const transcriptPhone = findPhoneNumber(draft)
  if (transcriptPhone) return transcriptPhone
  return typeof extractedValue === 'string' ? extractedValue.trim() : ''
}

export function resolveFullName(
  extractedValue: unknown,
  draft: ChatIntakeDraft,
): string {
  const extracted = normalizeRepeatedName(
    typeof extractedValue === 'string' ? extractedValue.trim() : '',
  )
  if (extracted) return extracted

  const contactLines = draft.answers.contact?.split('\n') ?? []
  for (const line of contactLines) {
    const candidate = line
      .replace(/^(?:my (?:full )?name is|i am|i'm|this is)\s+/i, '')
      .replace(/[.,]+$/, '')
      .trim()
    if (
      !/[\d@]/.test(candidate)
      && /^[A-Za-z][A-Za-z'-]+(?:\s+[A-Za-z][A-Za-z'-]+){1,4}$/.test(candidate)
    ) {
      return normalizeRepeatedName(candidate)
    }
  }

  return ''
}

export function resolvePreferredContact(
  extractedValue: unknown,
  draft: ChatIntakeDraft,
): 'email' | 'phone' | 'text' {
  const contactLines = draft.answers.contact?.split('\n').reverse() ?? []
  for (const line of contactLines) {
    const lower = line.toLowerCase()
    if (/\b(text|sms)\b/.test(lower)) return 'text'
    if (/\b(phone|call)\b/.test(lower)) return 'phone'
    if (/\bemail\b/.test(lower)) return 'email'
  }

  const extracted = typeof extractedValue === 'string'
    ? extractedValue.toLowerCase()
    : ''
  if (extracted === 'text' || extracted === 'phone') return extracted
  return 'email'
}

function findPhoneNumber(draft: ChatIntakeDraft): string {
  const prioritizedAnswers = [
    draft.answers.contact,
    ...Object.entries(draft.answers)
      .filter(([key]) => key !== 'contact')
      .map(([, value]) => value),
  ].filter((value): value is string => Boolean(value))

  for (const answer of prioritizedAnswers) {
    const matches = [...answer.matchAll(new RegExp(US_PHONE_PATTERN.source, 'g'))]
    const match = matches[matches.length - 1]
    if (!match) continue

    const digits = match[0].replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    }
  }

  return ''
}

function normalizeRepeatedName(value: string): string {
  return value.replace(/\b([A-Z][A-Za-z'-]{1,})\s+\1\b/g, '$1')
}

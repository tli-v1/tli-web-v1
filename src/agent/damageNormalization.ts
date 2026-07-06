import type { ChatIntakeDraft } from './intakeFlow'

const AMOUNT_PATTERN = String.raw`\$?\s*(\d+(?:[,.]\d+)?)\s*(k|thousand)?`
const MEDICAL_CONTEXT_PATTERN =
  String.raw`(?:medical(?:\s+(?:bills?|expenses?|costs?|damages?))?|hospital\s+bills?)`
const LOST_WAGES_CONTEXT_PATTERN =
  String.raw`(?:lost\s+(?:wages?|income)|income\s+loss)`
const PROPERTY_DAMAGE_CONTEXT_PATTERN =
  String.raw`(?:property\s+damage|vehicle\s+damage|car\s+damage|repairs?)`
const OTHER_EXPENSE_CONTEXT_PATTERN =
  String.raw`(?:other\s+expenses?|out[-\s]of[-\s]pocket(?:\s+(?:costs?|expenses?))?|transportation\s+(?:costs?|expenses?)|rental\s+(?:car\s+)?(?:costs?|expenses?))`
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
}

export function resolveMedicalBillsUsd(
  extractedValue: unknown,
  draft: ChatIntakeDraft,
): number {
  const explicitAmount = findMedicalAmount(draft)
  if (explicitAmount !== null) return explicitAmount
  return nonnegative(extractedValue)
}

export function resolveDaysMissed(
  extractedValue: unknown,
  draft: ChatIntakeDraft,
): number {
  for (const answer of prioritizedAnswers(draft)) {
    const match =
      /\b(?:missed|off|out of work(?:\s+for)?)\D{0,20}(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*(days?|weeks?)\b/i.exec(answer)
      || /\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*(days?|weeks?)\D{0,20}(?:missed|off|out of work)\b/i.exec(answer)

    if (!match?.[1]) continue
    const count = parseCount(match[1])
    return Math.round(count * (match[2]?.toLowerCase().startsWith('week') ? 5 : 1))
  }

  return Math.round(nonnegative(extractedValue))
}

export function resolvePropertyDamageUsd(
  extractedValue: unknown,
  draft: ChatIntakeDraft,
): number {
  for (const answer of prioritizedAnswers(draft)) {
    const amountBeforeContext = new RegExp(
      `${AMOUNT_PATTERN}\\s*(?:in\\s+)?${PROPERTY_DAMAGE_CONTEXT_PATTERN}`,
      'i',
    ).exec(answer)
    if (amountBeforeContext?.[1]) {
      return parseAmount(amountBeforeContext[1], amountBeforeContext[2])
    }

    const contextBeforeAmount = new RegExp(
      `${PROPERTY_DAMAGE_CONTEXT_PATTERN}[^\\d$]{0,48}${AMOUNT_PATTERN}`,
      'i',
    ).exec(answer)
    if (contextBeforeAmount?.[1]) {
      return parseAmount(contextBeforeAmount[1], contextBeforeAmount[2])
    }
  }

  return nonnegative(extractedValue)
}

export function resolveHourlyRateUsd(
  extractedValue: unknown,
  draft: ChatIntakeDraft,
): number {
  for (const answer of prioritizedAnswers(draft)) {
    const match =
      new RegExp(`${AMOUNT_PATTERN}\\s*(?:an?|per)\\s*hour`, 'i').exec(answer)
      || new RegExp(`hourly\\s+(?:rate|pay)[^\\d$]{0,24}${AMOUNT_PATTERN}`, 'i').exec(answer)

    if (match?.[1]) return parseAmount(match[1], match[2])
  }

  return nonnegative(extractedValue)
}

export function resolveOtherExpensesUsd(
  extractedValue: unknown,
  draft: ChatIntakeDraft,
): number {
  for (const answer of prioritizedAnswers(draft)) {
    const amountBeforeContext = new RegExp(
      `${AMOUNT_PATTERN}\\s*(?:in\\s+)?${OTHER_EXPENSE_CONTEXT_PATTERN}`,
      'i',
    ).exec(answer)
    if (amountBeforeContext?.[1]) {
      return parseAmount(amountBeforeContext[1], amountBeforeContext[2])
    }

    const contextBeforeAmount = new RegExp(
      `${OTHER_EXPENSE_CONTEXT_PATTERN}[^\\d$]{0,48}${AMOUNT_PATTERN}`,
      'i',
    ).exec(answer)
    if (contextBeforeAmount?.[1]) {
      return parseAmount(contextBeforeAmount[1], contextBeforeAmount[2])
    }
  }

  return nonnegative(extractedValue)
}

export function resolveLostWagesUsd(
  extractedValue: unknown,
  draft: ChatIntakeDraft,
  daysMissed: number,
  hourlyRateUsd: number,
): number {
  for (const answer of prioritizedAnswers(draft)) {
    const conversationalLoss = new RegExp(
      `\\blost\\s+(?:about\\s+|approximately\\s+)?${AMOUNT_PATTERN}\\s+(?:in\\s+)?(?:wages?|income)`,
      'i',
    ).exec(answer)
    if (conversationalLoss?.[1]) {
      return parseAmount(conversationalLoss[1], conversationalLoss[2])
    }

    const amountBeforeContext = new RegExp(
      `${AMOUNT_PATTERN}\\s*(?:in\\s+)?${LOST_WAGES_CONTEXT_PATTERN}`,
      'i',
    ).exec(answer)
    if (amountBeforeContext?.[1]) {
      return parseAmount(amountBeforeContext[1], amountBeforeContext[2])
    }

    const contextBeforeAmount = new RegExp(
      `${LOST_WAGES_CONTEXT_PATTERN}[^\\d$]{0,48}${AMOUNT_PATTERN}`,
      'i',
    ).exec(answer)
    if (contextBeforeAmount?.[1]) {
      return parseAmount(contextBeforeAmount[1], contextBeforeAmount[2])
    }
  }

  const extracted = nonnegative(extractedValue)
  if (extracted > 0) return extracted
  return daysMissed > 0 && hourlyRateUsd > 0
    ? roundToCents(daysMissed * 8 * hourlyRateUsd)
    : 0
}

function findMedicalAmount(draft: ChatIntakeDraft): number | null {
  for (const answer of prioritizedAnswers(draft)) {
    const amountBeforeContext = new RegExp(
      `${AMOUNT_PATTERN}\\s*(?:in\\s+)?${MEDICAL_CONTEXT_PATTERN}`,
      'i',
    ).exec(answer)
    if (amountBeforeContext?.[1]) {
      return parseAmount(amountBeforeContext[1], amountBeforeContext[2])
    }

    const contextBeforeAmount = new RegExp(
      `${MEDICAL_CONTEXT_PATTERN}[^\\d$]{0,48}${AMOUNT_PATTERN}`,
      'i',
    ).exec(answer)
    if (contextBeforeAmount?.[1]) {
      return parseAmount(contextBeforeAmount[1], contextBeforeAmount[2])
    }
  }

  return null
}

function parseAmount(rawValue: string, scale?: string): number {
  const parsed = Number(rawValue.replace(/,/g, ''))
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed * (scale ? 1_000 : 1)
}

function parseCount(value: string): number {
  return NUMBER_WORDS[value.toLowerCase()] ?? Number(value)
}

function prioritizedAnswers(draft: ChatIntakeDraft): string[] {
  return [
    draft.answers.damages,
    ...Object.entries(draft.answers)
      .filter(([key]) => key !== 'damages')
      .map(([, value]) => value),
  ].filter((value): value is string => Boolean(value))
}

function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function nonnegative(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

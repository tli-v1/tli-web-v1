import type { User } from '../types'
import {
  resolveFullName,
  resolvePhoneNumber,
  resolvePreferredContact,
} from './contactNormalization'
import {
  resolveDaysMissed,
  resolveHourlyRateUsd,
  resolveLostWagesUsd,
  resolveMedicalBillsUsd,
  resolveOtherExpensesUsd,
  resolvePropertyDamageUsd,
} from './damageNormalization'
import type { ChatIntakeDraft } from './intakeFlow'
import { resolveLocation } from './locationNormalization'
import type { StructuredIntake } from './processIntake'

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const SLASH_DATE_PATTERN = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/
const MONTH_DATE_PATTERN =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{2,4}))?\b/i

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

export function buildFallbackStructuredIntake(
  draft: ChatIntakeDraft,
  user: User,
  fallbackDate: string,
): StructuredIntake {
  const location = resolveLocation('', '', '', draft)
  const daysMissed = resolveDaysMissed(0, draft)
  const hourlyRateUsd = resolveHourlyRateUsd(0, draft)
  const lostWagesUsd = resolveLostWagesUsd(0, draft, daysMissed, hourlyRateUsd)
  const damagesAnswer = clean(draft.answers.damages)
  const insuranceAnswer = clean(draft.answers.insurerInfo)
  const consentAnswer = clean(draft.answers.consent)

  return {
    description:
      clean(draft.answers.whatHappened)
      || 'Conversational intake submitted without a description.',
    incidentDate: extractIncidentDate(draft.answers.incidentDate, fallbackDate),
    city: location.city,
    stateCode: location.stateCode,
    locationDetails: location.locationDetails,
    adverseParty: usefulText(draft.answers.adverseParty),
    insurerName: extractInsurerName(insuranceAnswer),
    policyNumber: extractNumberAfterLabel(insuranceAnswer, 'policy'),
    claimNumber: extractNumberAfterLabel(insuranceAnswer, 'claim'),
    injuries: damagesAnswer,
    treatment: extractTreatment(damagesAnswer),
    medicalBillsUsd: resolveMedicalBillsUsd(0, draft),
    propertyDamageUsd: resolvePropertyDamageUsd(0, draft),
    otherExpensesUsd: resolveOtherExpensesUsd(0, draft),
    daysMissed,
    hourlyRateUsd,
    lostWagesUsd,
    emotionalImpact: extractEmotionalImpact(damagesAnswer),
    otherDamages: '',
    damageDetails: damagesAnswer,
    fullName: resolveFullName('', draft),
    preferredContact: resolvePreferredContact('', draft),
    email: extractEmail(draft.answers.contact) || user.email,
    phone: resolvePhoneNumber('', draft),
    consentStore: isAffirmative(consentAnswer),
    consentContact: isAffirmative(consentAnswer),
  }
}

export function isAiProcessingUnavailable(error: unknown): boolean {
  const message = error instanceof Error
    ? `${error.name} ${error.message}`
    : String(error)
  return /\b(429|resource exhausted|quota|rate limit|rate-limit|too many requests|overloaded|unavailable|ai\/fetch-error)\b/i
    .test(message)
}

function extractIncidentDate(value: string | undefined, fallbackDate: string): string {
  const raw = clean(value)
  if (!raw) return fallbackDate

  const dateOnly = DATE_ONLY_PATTERN.exec(raw)
  if (dateOnly?.[1] && dateOnly[2] && dateOnly[3]) {
    return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`
  }

  const fallbackYear = Number(fallbackDate.slice(0, 4))
  const slashDate = SLASH_DATE_PATTERN.exec(raw)
  if (slashDate?.[1] && slashDate[2]) {
    const year = normalizeYear(slashDate[3], fallbackYear)
    return formatDateParts(year, Number(slashDate[1]), Number(slashDate[2])) ?? fallbackDate
  }

  const monthDate = MONTH_DATE_PATTERN.exec(raw)
  if (monthDate?.[1] && monthDate[2]) {
    const month = MONTH_INDEX[monthDate[1].toLowerCase()]
    const year = normalizeYear(monthDate[3], fallbackYear)
    if (month !== undefined) {
      return formatDateParts(year, month + 1, Number(monthDate[2])) ?? fallbackDate
    }
  }

  return fallbackDate
}

function normalizeYear(rawYear: string | undefined, fallbackYear: number): number {
  if (!rawYear) return fallbackYear
  const year = Number(rawYear)
  if (!Number.isFinite(year)) return fallbackYear
  return year < 100 ? 2000 + year : year
}

function formatDateParts(year: number, month: number, day: number): string | null {
  if (
    !Number.isInteger(year)
    || !Number.isInteger(month)
    || !Number.isInteger(day)
    || month < 1
    || month > 12
    || day < 1
    || day > 31
  ) {
    return null
  }

  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

function extractEmail(value: string | undefined): string {
  return clean(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? ''
}

function extractInsurerName(value: string): string {
  if (!value || isUnknown(value)) return ''
  const match =
    /\b(?:insurer|insurance(?: company)?)\s*(?:is|was|:)?\s*([A-Za-z0-9 &'.,-]{2,60})/i.exec(value)
  return clean(match?.[1]).replace(/[.;]+$/, '')
}

function extractNumberAfterLabel(value: string, label: 'policy' | 'claim'): string {
  if (!value || isUnknown(value)) return ''
  const match = new RegExp(`\\b${label}\\s*(?:number|#|no\\.)?\\s*(?:is|:)?\\s*([A-Z0-9-]{3,})`, 'i')
    .exec(value)
  return clean(match?.[1])
}

function extractTreatment(value: string): string {
  if (!/\b(treat(?:ed|ment)?|doctor|hospital|clinic|therapy|surgery|er|urgent care)\b/i.test(value)) {
    return ''
  }
  return value
}

function extractEmotionalImpact(value: string): string {
  if (!/\b(stress|anxiety|emotional|trauma|fear|sleep|nightmare|depress)\b/i.test(value)) {
    return ''
  }
  return value
}

function usefulText(value: string | undefined): string {
  const text = clean(value)
  return isUnknown(text) ? '' : text
}

function isUnknown(value: string): boolean {
  return /^(?:n\/a|na|none|no|not sure|unknown|don'?t know|do not know|no idea|not yet|nothing)$/i
    .test(value.trim())
}

function isAffirmative(value: string): boolean {
  return /\b(yes|yep|yeah|agree|agreed|consent|approve|ok|okay|sure)\b/i.test(value)
    && !/\b(no|not|don'?t|do not)\b/i.test(value)
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

import type { ChatIntakeDraft } from './intakeFlow'

const STATE_CODES: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
}

const VALID_STATE_CODES = new Set(Object.values(STATE_CODES))

export function resolveLocation(
  extractedCity: unknown,
  extractedState: unknown,
  extractedDetails: unknown,
  draft: ChatIntakeDraft,
): { city: string; stateCode: string; locationDetails: string } {
  const locationAnswer = draft.answers.location?.trim() ?? ''
  const stateCode =
    normalizeState(extractedState)
    || findState(locationAnswer)?.code
    || ''
  const city =
    clean(extractedCity)
    || extractCity(locationAnswer)
  const locationDetails = clean(extractedDetails) || locationAnswer

  return { city, stateCode, locationDetails }
}

function normalizeState(value: unknown): string {
  const state = clean(value)
  if (!state) return ''
  const upper = state.toUpperCase()
  if (VALID_STATE_CODES.has(upper)) return upper
  return STATE_CODES[state.toLowerCase()] ?? ''
}

function findState(value: string): { code: string; index: number } | null {
  const codeMatch = /(?:,\s*|\s+)([A-Z]{2})\b/.exec(value)
  if (codeMatch && VALID_STATE_CODES.has(codeMatch[1] ?? '')) {
    return {
      code: codeMatch[1]!,
      index: codeMatch.index,
    }
  }

  const lower = value.toLowerCase()
  const stateName = Object.keys(STATE_CODES)
    .sort((left, right) => right.length - left.length)
    .find((name) => new RegExp(`\\b${name}\\b`, 'i').test(lower))

  if (!stateName) return null
  return {
    code: STATE_CODES[stateName]!,
    index: lower.search(new RegExp(`\\b${stateName}\\b`, 'i')),
  }
}

function extractCity(value: string): string {
  const state = findState(value)
  if (!state) return ''

  let beforeState = value.slice(0, state.index)
    .replace(/[,\s]+$/, '')
    .trim()
  if (beforeState.includes(',')) {
    beforeState = beforeState.split(',').pop()?.trim() || beforeState
  }
  const prepositionParts = beforeState.split(/\b(?:in|near)\s+/i)
  beforeState = prepositionParts[prepositionParts.length - 1] ?? beforeState

  return beforeState
    .replace(/^(?:it|this|the accident|the incident)\s+(?:happened|occurred)\s+(?:at|on)?\s*/i, '')
    .replace(/^(?:at|on)\s+/i, '')
    .trim()
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

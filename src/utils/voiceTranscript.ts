import { normalizeSpokenNumberSequences } from './spokenNumbers'

const SPELLED_WORD_CLARIFICATION =
  /\b([A-Za-z][A-Za-z'-]{1,})\s*[,;:]?\s+((?:[A-Za-z](?:\s*-\s*|\s+)){2,}[A-Za-z])\s*,?/g
const REPEATED_PROPER_NAME =
  /\b([A-Z][A-Za-z'-]{1,})\s+\1\b/g

export function normalizeVoiceTranscript(transcript: string): string {
  const cleaned = transcript
    .replace(/\s+/g, ' ')
    .trim()

  const withoutRepeatedSpellings = cleaned.replace(
    SPELLED_WORD_CLARIFICATION,
    (fullMatch, word: string, spelledLetters: string) => {
      const spelling = spelledLetters.replace(/[^A-Za-z]/g, '')
      return spelling.toLowerCase() === word.replace(/[^A-Za-z]/g, '').toLowerCase()
        ? word
        : fullMatch
    },
  )

  // Speech recognition may resolve a spelled clarification before it reaches us,
  // turning “Zhang, Z H A N G” into “Zhang Zhang”.
  const withoutRepeatedProperNames = withoutRepeatedSpellings.replace(
    REPEATED_PROPER_NAME,
    '$1',
  )

  const polished = normalizeSpokenNumberSequences(withoutRepeatedProperNames)
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/([,.;!?])(?=[A-Za-z])/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return polished.replace(
    /^([^A-Za-z]*)([a-z])/,
    (_, prefix: string, firstLetter: string) => `${prefix}${firstLetter.toUpperCase()}`,
  )
}

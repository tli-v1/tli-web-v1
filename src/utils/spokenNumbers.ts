const DIGIT_WORDS: Record<string, string> = {
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
}

const DIGIT_WORD = Object.keys(DIGIT_WORDS).join('|')
const SPOKEN_DIGIT_SEQUENCE = new RegExp(
  String.raw`\b(?:${DIGIT_WORD})(?:[\s,.-]+(?:${DIGIT_WORD})){6,14}\b`,
  'gi',
)

export function normalizeSpokenNumberSequences(transcript: string): string {
  return transcript.replace(SPOKEN_DIGIT_SEQUENCE, (sequence) => {
    const digits = sequence
      .toLowerCase()
      .match(new RegExp(String.raw`\b(?:${DIGIT_WORD})\b`, 'g'))
      ?.map((word) => DIGIT_WORDS[word])
      .join('')

    if (!digits) return sequence
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
    }
    if (digits.length === 7) {
      return `${digits.slice(0, 3)}-${digits.slice(3)}`
    }
    return digits
  })
}

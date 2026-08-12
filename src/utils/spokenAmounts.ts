const SMALL_NUMBER_WORDS: Record<string, number> = {
  zero: 0,
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
}

const TENS_NUMBER_WORDS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

const NUMBER_WORDS = [
  ...Object.keys(SMALL_NUMBER_WORDS),
  ...Object.keys(TENS_NUMBER_WORDS),
  'hundred',
  'thousand',
  'million',
  'and',
].join('|')

const NUMBER_WORD_SEQUENCE = String.raw`(?:${NUMBER_WORDS})(?:[\s-]+(?:${NUMBER_WORDS}))*`

const CURRENCY_AMOUNT_PATTERN = new RegExp(
  String.raw`\b(${NUMBER_WORD_SEQUENCE})\s+(dollars?|bucks?|usd)\b`,
  'gi',
)

const DAMAGE_AMOUNT_PATTERN = new RegExp(
  String.raw`\b(${NUMBER_WORD_SEQUENCE})(?=\s+(?:in\s+)?(?:damages?|medical\s+bills?|medical\s+expenses?|property\s+damage|expenses?|lost\s+wages?|settlement|repairs?|costs?))`,
  'gi',
)

export function normalizeSpokenAmounts(text: string): string {
  return text
    .replace(CURRENCY_AMOUNT_PATTERN, (match, amountWords: string) => {
      const amount = parseSpokenNumber(amountWords)
      return amount === null ? match : formatCurrency(amount)
    })
    .replace(DAMAGE_AMOUNT_PATTERN, (match, amountWords: string) => {
      const amount = parseSpokenNumber(amountWords)
      return amount === null ? match : formatCurrency(amount)
    })
}

function parseSpokenNumber(rawWords: string): number | null {
  const words = rawWords
    .toLowerCase()
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter((word) => word && word !== 'and')

  if (!words.length) return null

  let total = 0
  let current = 0
  let sawNumber = false

  for (const word of words) {
    if (word in SMALL_NUMBER_WORDS) {
      current += SMALL_NUMBER_WORDS[word]
      sawNumber = true
      continue
    }

    if (word in TENS_NUMBER_WORDS) {
      current += TENS_NUMBER_WORDS[word]
      sawNumber = true
      continue
    }

    if (word === 'hundred') {
      if (current === 0) current = 1
      current *= 100
      sawNumber = true
      continue
    }

    if (word === 'thousand' || word === 'million') {
      const scale = word === 'thousand' ? 1_000 : 1_000_000
      if (current === 0) current = 1
      total += current * scale
      current = 0
      sawNumber = true
      continue
    }

    return null
  }

  if (!sawNumber) return null
  return total + current
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`
}

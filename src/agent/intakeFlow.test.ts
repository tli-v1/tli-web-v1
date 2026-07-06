import { describe, expect, it } from 'vitest'
import {
  applyIntakeAnswerAndAdvance,
  emptyChatIntakeDraft,
  getNextIntakeStep,
  isChatIntakeComplete,
  type ChatIntakeStep,
} from './intakeFlow'

describe('text conversational intake flow', () => {
  it('preserves every text answer through completion', () => {
    const answers: Array<[ChatIntakeStep, string]> = [
      ['whatHappened', 'A delivery truck struck my parked vehicle.'],
      ['incidentDate', 'July 1, 2026'],
      ['location', 'Main St and 5th Ave in Charlotte, North Carolina.'],
      ['adverseParty', 'The driver and Example Delivery LLC.'],
      ['insurerInfo', 'Acme Insurance, policy P-123, claim C-456.'],
      ['documents', 'I have a police report and three photos.'],
      [
        'damages',
        'Whiplash treated with physical therapy, $10,030 medical bills, '
          + '$20,000 property damage, $650.25 other expenses, five missed days '
          + 'at $32.50 per hour, and trouble sleeping.',
      ],
      ['contact', 'My name is Ethan Zhang, 704-241-4979, and I prefer text.'],
      ['consent', 'Yes, I consent to storage and contact.'],
    ]

    const completedDraft = answers.reduce((draft, [step, answer]) => {
      expect(getNextIntakeStep(draft)).toBe(step)
      return applyIntakeAnswerAndAdvance(draft, step, answer).draft
    }, emptyChatIntakeDraft)

    expect(isChatIntakeComplete(completedDraft)).toBe(true)
    expect(completedDraft.answers).toEqual(Object.fromEntries(answers))
  })
})

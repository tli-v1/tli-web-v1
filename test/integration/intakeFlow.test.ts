import { describe, expect, it } from 'vitest'
import {
  applyIntakeAnswerAndAdvance,
  emptyChatIntakeDraft,
  getNextIntakeStep,
  isChatIntakeComplete,
  type ChatIntakeDraft,
  type ChatIntakeStep,
} from '../../src/agent/intakeFlow'

function answer(
  draft: ChatIntakeDraft,
  step: ChatIntakeStep,
  value: string,
): ChatIntakeDraft {
  const result = applyIntakeAnswerAndAdvance(draft, step, value)
  expect(result.accepted, result.message).toBe(true)
  return result.draft
}

describe('conversational intake flow', () => {
  it('captures every key intake answer without requiring structured parsing', () => {
    let draft = emptyChatIntakeDraft

    draft = answer(draft, 'whatHappened', 'I was rear-ended while stopped at a light.')
    draft = answer(draft, 'incidentDate', 'Sometime around the middle of May')
    draft = answer(draft, 'location', 'Seattle, Washington')
    draft = answer(draft, 'adverseParty', "I don't know the driver's name")
    draft = answer(draft, 'insurerInfo', 'I have a photo of their insurance card')
    draft = answer(draft, 'documents', 'I have photos and authorize sharing for matching')
    draft = answer(draft, 'damages', 'My neck hurts and I missed a few shifts')
    draft = answer(draft, 'contact', 'Jane Client, jane@example.com, email is best')
    draft = answer(draft, 'consent', 'Yes, that is okay')

    expect(draft.answers.location).toBe('Seattle, Washington')
    expect(draft.answers.incidentDate).toBe('Sometime around the middle of May')
    expect(draft.answers.damages).toBe('My neck hurts and I missed a few shifts')
    expect(isChatIntakeComplete(draft)).toBe(true)
    expect(getNextIntakeStep(draft)).toBeNull()
  })

  it('advances one question at a time', () => {
    const draft = answer(emptyChatIntakeDraft, 'whatHappened', 'A delivery truck hit my parked car')
    expect(getNextIntakeStep(draft)).toBe('incidentDate')
  })

  it('only rejects an empty answer', () => {
    const result = applyIntakeAnswerAndAdvance(emptyChatIntakeDraft, 'location', '   ')
    expect(result.accepted).toBe(false)
    expect(result.message).toContain('approximate or incomplete')
  })
})

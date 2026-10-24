import { describe, expect, it } from 'vitest'
import { buildVoiceIntakeDraft, detectIntakeQuestionStep } from './voiceIntakeDraft'

describe('buildVoiceIntakeDraft', () => {
  it('groups voice answers by the question the agent asked', () => {
    const draft = buildVoiceIntakeDraft([
      { role: 'assistant', content: 'What happened?' },
      { role: 'user', content: 'I was rear-ended.' },
      { role: 'assistant', content: 'Where did it happen? Please share the city and place.' },
      { role: 'user', content: 'At Main Street in Kansas City, Missouri.' },
      { role: 'assistant', content: 'What medical expenses or missed work did you have?' },
      { role: 'user', content: 'I have $12,000 in medical bills and missed five days.' },
    ])

    expect(draft.answers.whatHappened).toBe('I was rear-ended.')
    expect(draft.answers.location).toBe('At Main Street in Kansas City, Missouri.')
    expect(draft.answers.damages).toBe(
      'I have $12,000 in medical bills and missed five days.',
    )
  })

  it('combines multiple focused contact answers', () => {
    const draft = buildVoiceIntakeDraft([
      { role: 'assistant', content: 'What is your full name?' },
      { role: 'user', content: 'Ethan Zhang.' },
      { role: 'assistant', content: 'What is the best phone number to reach you?' },
      { role: 'user', content: '704-241-4979.' },
      { role: 'assistant', content: 'Do you prefer email, a phone call, or a text message?' },
      { role: 'user', content: 'Email.' },
    ])

    expect(draft.answers.contact).toBe(
      'Ethan Zhang.\n704-241-4979.\nEmail.',
    )
  })
})


describe('shared conversational intake question detection', () => {
  it('keeps a date clarification on the date step instead of advancing by reply count', () => {
    expect(detectIntakeQuestionStep('That date seems to be in the future. What date did this happen?'))
      .toBe('incidentDate')
  })

  it('uses the current question rather than a recap of earlier answers', () => {
    expect(detectIntakeQuestionStep('You mentioned medical bills. What is your full name?'))
      .toBe('contact')
  })

  it('does not infer a new step from an unrelated-answer warning', () => {
    expect(detectIntakeQuestionStep('Please keep your answer related to the current question.'))
      .toBeNull()
  })
})

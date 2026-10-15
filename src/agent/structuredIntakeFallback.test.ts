import { describe, expect, it } from 'vitest'
import {
  buildFallbackStructuredIntake,
  isAiProcessingUnavailable,
} from './structuredIntakeFallback'
import type { ChatIntakeDraft } from './intakeFlow'
import type { User } from '../types'

const user: User = {
  id: 'user-1',
  email: 'fallback@example.com',
  full_name: 'Fallback User',
  role: 'client',
  created_at: '2026-08-04T00:00:00.000Z',
}

describe('isAiProcessingUnavailable', () => {
  it('recognizes quota exhaustion as a fallback-eligible processing failure', () => {
    expect(isAiProcessingUnavailable(
      new Error('[429] Resource exhausted. Please try again later. (AI/fetch-error)'),
    )).toBe(true)
  })

  it('does not hide unrelated processing errors', () => {
    expect(isAiProcessingUnavailable(new Error('Unable to create the processed case.'))).toBe(false)
  })
})

describe('buildFallbackStructuredIntake', () => {
  it('builds a usable structured case from raw intake answers without Gemini', () => {
    const draft: ChatIntakeDraft = {
      answers: {
        whatHappened: 'Car accident involving Alex Smith.',
        incidentDate: 'July 4, 2026',
        location: 'Thirty-sixth Street, Charlotte, North Carolina.',
        adverseParty: 'Alex Smith',
        insurerInfo: 'Other driver insurance is Acme Insurance, policy ABC-123, claim CLM-456.',
        damages: 'No injuries. Property damage is $20,000. I missed 20 days and make $32.50 per hour.',
        contact: 'Ethan Zhang, zhangeth61@gmail.com, (704) 241-4979, email please.',
        consent: 'Yes',
      },
    }

    expect(buildFallbackStructuredIntake(draft, user, '2026-08-04')).toMatchObject({
      description: 'Car accident involving Alex Smith.',
      incidentDate: '2026-07-04',
      city: 'Charlotte',
      stateCode: 'NC',
      adverseParty: 'Alex Smith',
      propertyDamageUsd: 20_000,
      daysMissed: 20,
      hourlyRateUsd: 32.5,
      lostWagesUsd: 5_200,
      email: 'zhangeth61@gmail.com',
      phone: '(704) 241-4979',
      preferredContact: 'email',
      consentStore: true,
      consentContact: true,
    })
  })
})

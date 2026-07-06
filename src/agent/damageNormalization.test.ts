import { describe, expect, it } from 'vitest'
import {
  resolveDaysMissed,
  resolveHourlyRateUsd,
  resolveLostWagesUsd,
  resolveMedicalBillsUsd,
  resolveOtherExpensesUsd,
  resolvePropertyDamageUsd,
} from './damageNormalization'

describe('resolveMedicalBillsUsd', () => {
  it('expands shorthand amounts before a medical-damages phrase', () => {
    expect(resolveMedicalBillsUsd(30, {
      answers: { whatHappened: 'User: I have 30K medical damages.' },
    })).toBe(30_000)
  })

  it('reads a medical amount after its label', () => {
    expect(resolveMedicalBillsUsd(0, {
      answers: { damages: 'Medical bills are about $30,000 and I missed two days.' },
    })).toBe(30_000)
  })

  it('supports the word thousand', () => {
    expect(resolveMedicalBillsUsd(0, {
      answers: { damages: 'Around 30 thousand in medical expenses.' },
    })).toBe(30_000)
  })

  it('does not mistake unrelated amounts for medical bills', () => {
    expect(resolveMedicalBillsUsd(1_250, {
      answers: { damages: 'My car has $30,000 in property damage.' },
    })).toBe(1_250)
  })

  it('extracts property damage separately from medical bills', () => {
    expect(resolvePropertyDamageUsd(0, {
      answers: { damages: 'The car has about $8,500 in property damage.' },
    })).toBe(8_500)
  })

  it('extracts other out-of-pocket expenses without replacing categorized losses', () => {
    expect(resolveOtherExpensesUsd(0, {
      answers: {
        damages: 'I also paid about $650 in out-of-pocket expenses for transportation.',
      },
    })).toBe(650)
  })

  it('extracts spoken missed work and an hourly rate', () => {
    const draft = {
      answers: {
        damages: 'I missed five days of work and make $32.50 an hour.',
      },
    }

    expect(resolveDaysMissed(0, draft)).toBe(5)
    expect(resolveHourlyRateUsd(0, draft)).toBe(32.5)
  })

  it('converts missed weeks to work days', () => {
    expect(resolveDaysMissed(0, {
      answers: { damages: 'I was out of work for 2 weeks.' },
    })).toBe(10)
  })

  it('extracts explicit lost wages', () => {
    expect(resolveLostWagesUsd(0, {
      answers: { damages: 'I lost about $3,200 in wages.' },
    }, 0, 0)).toBe(3_200)
  })

  it('calculates lost wages when days and rate are known', () => {
    expect(resolveLostWagesUsd(0, { answers: {} }, 5, 25)).toBe(1_000)
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildTextDamagesPayload,
  buildTextIncidentPayload,
} from './textIntakePayload'

describe('text intake payloads', () => {
  it('preserves complete incident location details', () => {
    expect(buildTextIncidentPayload('case-1', {
      whatHappened: ' A delivery truck struck my parked car. ',
      incidentDate: '2026-07-01',
      city: ' Charlotte ',
      state: ' NC ',
      locationDetails: ' Main St and 5th Ave near City Hall ',
    })).toEqual({
      case_id: 'case-1',
      description: 'A delivery truck struck my parked car.',
      incident_date: '2026-07-01',
      city: 'Charlotte',
      state_code: 'NC',
      location_details: 'Main St and 5th Ave near City Hall',
    })
  })

  it('maps every expanded damage field and calculates lost wages', () => {
    expect(buildTextDamagesPayload('case-1', {
      injuries: ' Whiplash ',
      treatment: ' Physical therapy ',
      emotionalImpact: ' Trouble sleeping ',
      otherDamages: ' Missed a certification exam ',
      damageDetails: ' Follow-up appointment scheduled. ',
      medicalBills: '10030',
      propertyDamage: '20000',
      otherExpenses: '650.25',
      daysMissed: '5',
      hourlyRate: '32.50',
    })).toEqual({
      case_id: 'case-1',
      injuries: 'Whiplash',
      treatment: 'Physical therapy',
      emotional_impact: 'Trouble sleeping',
      other_damages: 'Missed a certification exam',
      details: 'Follow-up appointment scheduled.',
      medical_bills_usd: 10030,
      property_damage_usd: 20000,
      other_expenses_usd: 650.25,
      days_missed: 5,
      hourly_rate_usd: 32.5,
      lost_wages_usd: 1300,
    })
  })
})

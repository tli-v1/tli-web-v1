interface TextIncidentFields {
  whatHappened: string
  incidentDate: string
  city: string
  state: string
  locationDetails: string
}

interface TextDamageFields {
  injuries: string
  treatment: string
  emotionalImpact: string
  otherDamages: string
  damageDetails: string
  medicalBills: string
  propertyDamage: string
  otherExpenses: string
  daysMissed: string
  hourlyRate: string
}

export function buildTextIncidentPayload(caseId: string, fields: TextIncidentFields) {
  return {
    case_id: caseId,
    description: fields.whatHappened.trim(),
    incident_date: fields.incidentDate || null,
    city: fields.city.trim(),
    state_code: fields.state.trim(),
    location_details: fields.locationDetails.trim(),
  }
}

export function buildTextDamagesPayload(caseId: string, fields: TextDamageFields) {
  const daysMissed = nonnegativeNumber(fields.daysMissed)
  const hourlyRateUsd = currencyNumber(fields.hourlyRate)

  return {
    case_id: caseId,
    injuries: fields.injuries.trim(),
    treatment: fields.treatment.trim(),
    emotional_impact: fields.emotionalImpact.trim(),
    other_damages: fields.otherDamages.trim(),
    details: fields.damageDetails.trim(),
    medical_bills_usd: currencyNumber(fields.medicalBills),
    property_damage_usd: currencyNumber(fields.propertyDamage),
    other_expenses_usd: currencyNumber(fields.otherExpenses),
    days_missed: daysMissed,
    hourly_rate_usd: hourlyRateUsd,
    lost_wages_usd: roundToCents(daysMissed * 8 * hourlyRateUsd),
  }
}

function nonnegativeNumber(value: string): number {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function currencyNumber(value: string): number {
  return roundToCents(nonnegativeNumber(value))
}

function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

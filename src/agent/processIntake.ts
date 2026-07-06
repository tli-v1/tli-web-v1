import { getAI, getGenerativeModel, Schema, VertexAIBackend } from 'firebase/ai'
import {
  createCase,
  createCaseContact,
  createDamages,
  createDocument,
  createIncident,
  createParties,
  deleteCase,
} from '../api/intake'
import { ensureUserProfile } from '../api/userProfile'
import { app } from '../config/firebase'
import type { User } from '../types'
import {
  resolveFullName,
  resolvePhoneNumber,
  resolvePreferredContact,
} from './contactNormalization'
import {
  resolveDaysMissed,
  resolveHourlyRateUsd,
  resolveLostWagesUsd,
  resolveMedicalBillsUsd,
  resolveOtherExpensesUsd,
  resolvePropertyDamageUsd,
} from './damageNormalization'
import type { ChatIntakeDraft } from './intakeFlow'
import { resolveLocation } from './locationNormalization'

export interface IntakeFile {
  name: string
  storagePath: string
}

export interface StructuredIntake {
  description: string
  incidentDate: string
  city: string
  stateCode: string
  locationDetails: string
  adverseParty: string
  insurerName: string
  policyNumber: string
  claimNumber: string
  injuries: string
  treatment: string
  medicalBillsUsd: number
  propertyDamageUsd: number
  otherExpensesUsd: number
  daysMissed: number
  hourlyRateUsd: number
  lostWagesUsd: number
  emotionalImpact: string
  otherDamages: string
  damageDetails: string
  fullName: string
  preferredContact: 'email' | 'phone' | 'text'
  email: string
  phone: string
  consentStore: boolean
  consentContact: boolean
}

const ai = getAI(app, { backend: new VertexAIBackend('us-central1') })
const structuredIntakeSchema = Schema.object({
  properties: {
    description: Schema.string(),
    incidentDate: Schema.string(),
    city: Schema.string(),
    stateCode: Schema.string(),
    locationDetails: Schema.string(),
    adverseParty: Schema.string(),
    insurerName: Schema.string(),
    policyNumber: Schema.string(),
    claimNumber: Schema.string(),
    injuries: Schema.string(),
    treatment: Schema.string(),
    medicalBillsUsd: Schema.number(),
    propertyDamageUsd: Schema.number(),
    otherExpensesUsd: Schema.number(),
    daysMissed: Schema.number(),
    hourlyRateUsd: Schema.number(),
    lostWagesUsd: Schema.number(),
    emotionalImpact: Schema.string(),
    otherDamages: Schema.string(),
    damageDetails: Schema.string(),
    fullName: Schema.string(),
    preferredContact: Schema.enumString({
      enum: ['email', 'phone', 'text'],
    }),
    email: Schema.string(),
    phone: Schema.string(),
    consentStore: Schema.boolean(),
    consentContact: Schema.boolean(),
  },
})

const processingModel = getGenerativeModel(ai, {
  model: 'gemini-2.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: structuredIntakeSchema,
    temperature: 0.1,
  },
})

export async function processIntakeIntoCase({
  draft,
  files,
  prepareFiles,
  user,
}: {
  draft: ChatIntakeDraft
  files: IntakeFile[]
  prepareFiles?: (caseId: string) => Promise<IntakeFile[]>
  user: User
}): Promise<{ caseId: string; structured: StructuredIntake }> {
  const currentDate = new Date().toISOString().slice(0, 10)
  const prompt = `Convert this completed conversational legal intake into the supplied JSON schema.

Rules:
- Use only information supported by the intake.
- Best-effort normalization is expected, but do not invent names, claim numbers, expenses, or contact details.
- Use empty strings for unknown text values and 0 for unknown numeric values.
- Resolve relative dates using today's date: ${currentDate}.
- incidentDate must be YYYY-MM-DD. If no date can be reasonably inferred, use ${currentDate}.
- stateCode should be a two-letter US postal code when possible, otherwise empty.
- locationDetails should preserve the complete place the user gave, including a street, intersection, building, landmark, or nearby description.
- Preserve the user's incident description faithfully and concisely.
- Expand monetary shorthand. For example, "30K" and "30 thousand" mean 30000.
- medicalBillsUsd includes medical bills, medical expenses, and medical damages stated by the user.
- propertyDamageUsd is the stated vehicle or other property repair/damage amount.
- otherExpensesUsd is a stated total for other out-of-pocket costs that is not already included in medical bills or property damage.
- daysMissed is the number of work days missed. Convert missed work weeks to five work days per week.
- hourlyRateUsd is the user's hourly pay rate, not a bill or total loss.
- lostWagesUsd is an explicitly stated lost-income total. If it is not stated but daysMissed and hourlyRateUsd are known, calculate daysMissed * 8 * hourlyRateUsd.
- injuries, treatment, emotionalImpact, and otherDamages should preserve supported non-financial details in their respective categories.
- damageDetails should concisely preserve the complete injuries, treatment, expenses, property damage, work loss, emotional effects, and other impacts answer, including details that do not fit another field.
- Preserve the user's phone number in the phone field. Do not confuse it with a policy or claim number.
- consentStore and consentContact are true only if the user agreed.
- preferredContact defaults to email.

Raw intake answers:
${JSON.stringify(draft.answers, null, 2)}`

  const result = await processingModel.generateContent(prompt)
  const structured = normalizeStructuredIntake(
    JSON.parse(result.response.text()) as Partial<StructuredIntake>,
    draft,
    user,
    currentDate,
  )

  const profile = await ensureUserProfile({
    userId: user.id,
    fullName: structured.fullName,
    phone: structured.phone,
    role: 'client',
  })
  if (profile.error) throw new Error(profile.error)

  const caseResult = await createCase({
    userId: user.id,
    consentStore: structured.consentStore,
    consentContact: structured.consentContact,
  })
  if (caseResult.error || !caseResult.data) {
    throw new Error(caseResult.error || 'Unable to create the processed case.')
  }

  const caseId = caseResult.data.id
  try {
    const [incident, damages, contact, parties] = await Promise.all([
      createIncident({
        case_id: caseId,
        description: structured.description,
        incident_date: structured.incidentDate,
        city: structured.city,
        state_code: structured.stateCode,
        location_details: structured.locationDetails,
      }),
      createDamages({
        case_id: caseId,
        injuries: structured.injuries,
        treatment: structured.treatment,
        medical_bills_usd: structured.medicalBillsUsd,
        property_damage_usd: structured.propertyDamageUsd,
        other_expenses_usd: structured.otherExpensesUsd,
        days_missed: structured.daysMissed,
        hourly_rate_usd: structured.hourlyRateUsd,
        lost_wages_usd: structured.lostWagesUsd,
        emotional_impact: structured.emotionalImpact,
        other_damages: structured.otherDamages,
        details: structured.damageDetails,
      }),
      createCaseContact({
        case_id: caseId,
        full_name: structured.fullName,
        method: structured.preferredContact,
        email: structured.email,
        phone: structured.phone || null,
      }),
      createParties([
        {
          case_id: caseId,
          role: 'defendant',
          name: structured.adverseParty || 'Unknown party',
        },
        ...(structured.insurerName
          ? [{
              case_id: caseId,
              role: 'insurer',
              name: structured.insurerName,
              insurer_name: structured.insurerName,
              policy_number: structured.policyNumber || null,
              claim_number: structured.claimNumber || null,
            }]
          : []),
      ]),
    ])

    const dataError = incident.error || damages.error || contact.error || parties.error
    if (dataError) throw new Error(dataError)

    const preparedFiles = prepareFiles ? await prepareFiles(caseId) : []
    for (const file of [...files, ...preparedFiles]) {
      const document = await createDocument({
        case_id: caseId,
        kind: documentKind(file.name),
        original_filename: file.name,
        storage_path: file.storagePath,
      })
      if (document.error) throw new Error(document.error)
    }

    return { caseId, structured }
  } catch (error) {
    await deleteCase(caseId)
    throw error
  }
}

function normalizeStructuredIntake(
  value: Partial<StructuredIntake>,
  draft: ChatIntakeDraft,
  user: User,
  fallbackDate: string,
): StructuredIntake {
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(value.incidentDate || '')
    ? value.incidentDate!
    : fallbackDate
  const location = resolveLocation(
    value.city,
    value.stateCode,
    value.locationDetails,
    draft,
  )
  const daysMissed = resolveDaysMissed(value.daysMissed, draft)
  const hourlyRateUsd = resolveHourlyRateUsd(value.hourlyRateUsd, draft)
  const lostWagesUsd = resolveLostWagesUsd(
    value.lostWagesUsd,
    draft,
    daysMissed,
    hourlyRateUsd,
  )

  return {
    description:
      clean(value.description)
      || clean(draft.answers.whatHappened)
      || 'Conversational intake submitted without a description.',
    incidentDate: validDate,
    city: location.city,
    stateCode: location.stateCode,
    locationDetails: location.locationDetails,
    adverseParty: clean(value.adverseParty),
    insurerName: clean(value.insurerName),
    policyNumber: clean(value.policyNumber),
    claimNumber: clean(value.claimNumber),
    injuries: clean(value.injuries),
    treatment: clean(value.treatment),
    medicalBillsUsd: resolveMedicalBillsUsd(value.medicalBillsUsd, draft),
    propertyDamageUsd: resolvePropertyDamageUsd(value.propertyDamageUsd, draft),
    otherExpensesUsd: resolveOtherExpensesUsd(value.otherExpensesUsd, draft),
    daysMissed,
    hourlyRateUsd,
    lostWagesUsd,
    emotionalImpact: clean(value.emotionalImpact),
    otherDamages: clean(value.otherDamages),
    damageDetails: clean(value.damageDetails) || clean(draft.answers.damages),
    fullName: resolveFullName(value.fullName, draft),
    preferredContact: resolvePreferredContact(value.preferredContact, draft),
    email: clean(value.email) || user.email,
    phone: resolvePhoneNumber(value.phone, draft),
    consentStore: Boolean(value.consentStore),
    consentContact: Boolean(value.consentContact),
  }
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function documentKind(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('medical') || lower.includes('bill') || lower.includes('er')) {
    return 'medical_bill'
  }
  if (lower.includes('police') || lower.includes('report')) return 'police_report'
  if (/\.(jpg|jpeg|png|heic)$/i.test(lower)) return 'photo'
  return 'other'
}

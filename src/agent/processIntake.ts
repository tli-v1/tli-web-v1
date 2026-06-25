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
import type { ChatIntakeDraft } from './intakeFlow'

interface IntakeFile {
  name: string
  storagePath: string
}

export interface StructuredIntake {
  description: string
  incidentDate: string
  city: string
  stateCode: string
  adverseParty: string
  insurerName: string
  policyNumber: string
  claimNumber: string
  medicalBillsUsd: number
  daysMissed: number
  hourlyRateUsd: number
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
    adverseParty: Schema.string(),
    insurerName: Schema.string(),
    policyNumber: Schema.string(),
    claimNumber: Schema.string(),
    medicalBillsUsd: Schema.number(),
    daysMissed: Schema.number(),
    hourlyRateUsd: Schema.number(),
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
  user,
}: {
  draft: ChatIntakeDraft
  files: IntakeFile[]
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
- Preserve the user's incident description faithfully and concisely.
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
      }),
      createDamages({
        case_id: caseId,
        medical_bills_usd: structured.medicalBillsUsd,
        days_missed: structured.daysMissed,
        hourly_rate_usd: structured.hourlyRateUsd,
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

    for (const file of files) {
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
  const stateCode = (value.stateCode || '').trim().toUpperCase()

  return {
    description:
      clean(value.description)
      || clean(draft.answers.whatHappened)
      || 'Conversational intake submitted without a description.',
    incidentDate: validDate,
    city: clean(value.city),
    stateCode: /^[A-Z]{2}$/.test(stateCode) ? stateCode : '',
    adverseParty: clean(value.adverseParty),
    insurerName: clean(value.insurerName),
    policyNumber: clean(value.policyNumber),
    claimNumber: clean(value.claimNumber),
    medicalBillsUsd: nonnegative(value.medicalBillsUsd),
    daysMissed: Math.round(nonnegative(value.daysMissed)),
    hourlyRateUsd: nonnegative(value.hourlyRateUsd),
    fullName: clean(value.fullName),
    preferredContact: ['email', 'phone', 'text'].includes(value.preferredContact || '')
      ? value.preferredContact!
      : 'email',
    email: clean(value.email) || user.email,
    phone: clean(value.phone),
    consentStore: Boolean(value.consentStore),
    consentContact: Boolean(value.consentContact),
  }
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function nonnegative(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
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

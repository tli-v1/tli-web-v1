import {
  getAI,
  getGenerativeModel,
  Schema,
  VertexAIBackend,
  type GenerativeModel,
} from 'firebase/ai'
import {
  createCase,
  createCaseContact,
  createDamages,
  createDocument,
  createIncident,
  createParties,
  deleteCase,
} from '../api/intake'
import {
  caseNotificationTitle,
  notifyMarketplaceCaseCreated,
} from '../api/marketplaceNotifications'
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
import {
  buildFallbackStructuredIntake,
  isAiProcessingUnavailable,
} from './structuredIntakeFallback'

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

export interface IntakeProcessingMetadata {
  usedFallback: boolean
  model: string
  location: string
  attemptCount: number
  errorCategory: string
}

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

const PROCESSING_MODEL_PLANS = [
  { location: 'global', model: 'gemini-3.5-flash-lite', attempts: 2 },
  { location: 'global', model: 'gemini-2.5-flash', attempts: 1 },
  { location: 'global', model: 'gemini-2.5-flash-lite', attempts: 2 },
  { location: 'us-central1', model: 'gemini-2.5-flash-lite', attempts: 1 },
] as const

const PROCESSING_MODEL_TIMEOUT_MS = 12_000
const RETRY_BASE_DELAY_MS = 900
const RETRY_MAX_DELAY_MS = 4_500
let aiProcessingQueue: Promise<void> = Promise.resolve()

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
}): Promise<{
  caseId: string
  structured: StructuredIntake
  processingMetadata: IntakeProcessingMetadata
}> {
  const currentDate = new Date().toISOString().slice(0, 10)
  const extraction = await enqueueAiProcessing(() =>
    extractStructuredIntakeWithResilience(draft, user, currentDate),
  )
  const { structured, metadata: processingMetadata } = extraction

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

    notifyMarketplaceCaseCreated({
      caseId,
      title: caseNotificationTitle({
        city: structured.city,
        stateCode: structured.stateCode,
      }),
      description: structured.description,
      stateCode: structured.stateCode,
      source: 'tli-web-case-created',
    }).catch((error) => {
      console.warn('Unable to enqueue marketplace case notification:', error)
    })

    return { caseId, structured, processingMetadata }
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

async function extractStructuredIntakeWithResilience(
  draft: ChatIntakeDraft,
  user: User,
  currentDate: string,
): Promise<{ structured: StructuredIntake; metadata: IntakeProcessingMetadata }> {
  const prompt = buildProcessingPrompt(draft, currentDate)
  let lastError: unknown = null
  let attemptCount = 0

  for (const plan of PROCESSING_MODEL_PLANS) {
    const model = createProcessingModel(plan.location, plan.model)

    for (let attempt = 1; attempt <= plan.attempts; attempt += 1) {
      attemptCount += 1
      try {
        const result = await model.generateContent(prompt)
        return {
          structured: normalizeStructuredIntake(
            JSON.parse(result.response.text()) as Partial<StructuredIntake>,
            draft,
            user,
            currentDate,
          ),
          metadata: {
            usedFallback: false,
            model: plan.model,
            location: plan.location,
            attemptCount,
            errorCategory: '',
          },
        }
      } catch (error) {
        lastError = error
        console.warn(
          `AI intake extraction failed with ${plan.model} in ${plan.location} `
          + `(attempt ${attempt}/${plan.attempts}).`,
          error,
        )

        if (attempt < plan.attempts && isAiProcessingUnavailable(error)) {
          await waitWithBackoff(attempt)
        } else {
          break
        }
      }
    }
  }

  console.warn('AI intake processing unavailable; using deterministic fallback.', lastError)
  return {
    structured: buildFallbackStructuredIntake(draft, user, currentDate),
    metadata: {
      usedFallback: true,
      model: 'deterministic-fallback',
      location: 'local',
      attemptCount,
      errorCategory: classifyProcessingError(lastError),
    },
  }
}

function classifyProcessingError(error: unknown): string {
  const message = error instanceof Error
    ? `${error.name} ${error.message}`
    : String(error)
  if (/\b(429|resource exhausted|quota|rate limit|too many requests)\b/i.test(message)) {
    return 'quota_or_rate_limit'
  }
  if (/\b(timeout|abort)\b/i.test(message)) return 'timeout'
  if (/\b(unavailable|overloaded)\b/i.test(message)) return 'model_unavailable'
  if (/\b(parse|json|schema)\b/i.test(message)) return 'parse_or_schema'
  return message ? 'unknown_ai_failure' : ''
}

function createProcessingModel(location: string, model: string): GenerativeModel {
  const ai = getAI(app, { backend: new VertexAIBackend(location) })
  return getGenerativeModel(
    ai,
    {
      model,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: structuredIntakeSchema,
        temperature: 0,
      },
    },
    {
      timeout: PROCESSING_MODEL_TIMEOUT_MS,
    },
  )
}

function buildProcessingPrompt(draft: ChatIntakeDraft, currentDate: string): string {
  return [
    'Convert this completed legal intake into the JSON schema.',
    `Today is ${currentDate}. Use YYYY-MM-DD dates; if missing, use today.`,
    'Use only supported facts. Unknown text = empty string. Unknown numbers = 0.',
    'Normalize US state to two-letter code. Preserve full location in locationDetails.',
    'Expand money shorthand: 30K/30 thousand = 30000.',
    'medicalBillsUsd = medical costs only. propertyDamageUsd = vehicle/property damage.',
    'daysMissed is work days; weeks = 5 work days. lostWagesUsd = daysMissed * 8 * hourlyRateUsd only if no explicit lost wage total exists.',
    'Phone goes only in phone, not policy/claim. preferredContact defaults to email.',
    'Consent booleans are true only if user agreed.',
    '',
    'Intake answers:',
    formatDraftAnswers(draft),
  ].join('\n')
}

function formatDraftAnswers(draft: ChatIntakeDraft): string {
  return Object.entries(draft.answers)
    .filter(([, value]) => value?.trim())
    .map(([key, value]) => `${key}: ${value!.trim()}`)
    .join('\n')
}

async function enqueueAiProcessing<T>(task: () => Promise<T>): Promise<T> {
  const previous = aiProcessingQueue
  let releaseQueue: () => void = () => undefined
  aiProcessingQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve
  })

  await previous.catch(() => undefined)
  try {
    return await task()
  } finally {
    releaseQueue()
  }
}

async function waitWithBackoff(attempt: number): Promise<void> {
  const exponentialDelay = Math.min(
    RETRY_MAX_DELAY_MS,
    RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
  )
  const jitter = Math.floor(Math.random() * RETRY_BASE_DELAY_MS)
  await new Promise((resolve) => {
    window.setTimeout(resolve, exponentialDelay + jitter)
  })
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

import { intakeFormSchema } from '../intake/intakeFormSchema'

export type ChatIntakeStep =
  | 'whatHappened'
  | 'incidentDate'
  | 'location'
  | 'adverseParty'
  | 'insurerInfo'
  | 'documents'
  | 'damages'
  | 'contact'
  | 'consent'

export interface ChatIntakeDraft {
  answers: Partial<Record<ChatIntakeStep, string>>
}

export interface IntakeUpdateResult {
  accepted: boolean
  draft: ChatIntakeDraft
  message?: string
}

export interface IntakeAnswerContext {
  attachedFileCount?: number
  userEmail?: string
}

const chatSteps = intakeFormSchema.chatSteps.map((step) => ({
  id: step.id as ChatIntakeStep,
  prompt: step.prompt,
}))

const stepOrder = chatSteps.map((step) => step.id)
const questions = Object.fromEntries(
  chatSteps.map((step) => [step.id, step.prompt]),
) as Record<ChatIntakeStep, string>

const stepLabels: Record<ChatIntakeStep, string> = {
  whatHappened: 'What happened',
  incidentDate: 'When it happened',
  location: 'Where it happened',
  adverseParty: 'Other people or organizations involved',
  insurerInfo: 'Insurance or claim information',
  documents: 'Documents and sharing authorization',
  damages: 'Injuries, expenses, and missed work',
  contact: 'Contact information',
  consent: 'Storage and contact consent',
}

export const emptyChatIntakeDraft: ChatIntakeDraft = {
  answers: {},
}

export function isIntakeRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim()
  return /\b(start|begin|submit|file|create|share|tell)\b.*\b(intake|case|claim|happened)\b/.test(normalized)
    || /\b(i have|i was|my case|my claim|i need a lawyer)\b/.test(normalized)
}

export function getInitialIntakeQuestion(): string {
  return questions.whatHappened
}

export function getNextIntakeStep(draft: ChatIntakeDraft): ChatIntakeStep | null {
  return stepOrder.find((step) => !draft.answers[step]?.trim()) ?? null
}

export function getIntakeQuestion(step: ChatIntakeStep): string {
  return questions[step]
}

export function getAllIntakeQuestions(): string[] {
  return stepOrder.map((step) => questions[step])
}

export function isChatIntakeComplete(draft: ChatIntakeDraft): boolean {
  return getNextIntakeStep(draft) === null
}

export function applyIntakeAnswer(
  draft: ChatIntakeDraft,
  step: ChatIntakeStep,
  answer: string,
  context: IntakeAnswerContext = {},
): IntakeUpdateResult {
  const trimmed = answer.trim()

  if (!trimmed) {
    return {
      accepted: false,
      draft,
      message: 'Share whatever you know. It is okay if the information is approximate or incomplete.',
    }
  }

  const fileNote =
    step === 'documents' && context.attachedFileCount
      ? `\n\nAttached files: ${context.attachedFileCount}`
      : ''

  return {
    accepted: true,
    draft: {
      answers: {
        ...draft.answers,
        [step]: `${trimmed}${fileNote}`,
      },
    },
  }
}

export function applyIntakeAnswerAndAdvance(
  draft: ChatIntakeDraft,
  step: ChatIntakeStep,
  answer: string,
  context: IntakeAnswerContext = {},
): IntakeUpdateResult {
  return applyIntakeAnswer(draft, step, answer, context)
}

export function buildIntakeSummary(draft: ChatIntakeDraft): string {
  const lines = stepOrder
    .filter((step) => step !== 'consent')
    .map((step) => `${stepLabels[step]}: ${draft.answers[step] || 'Not provided'}`)

  return ['Here is what I captured:', ...lines].join('\n')
}

export function getStepLabel(step: ChatIntakeStep): string {
  return stepLabels[step]
}

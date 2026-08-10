type GoogleTagEventParams = Record<string, string | number | boolean | null | undefined>

declare global {
  interface Window {
    gtag?: (
      command: 'event' | 'config' | 'js',
      target: string | Date,
      params?: GoogleTagEventParams,
    ) => void
  }
}

export const GOOGLE_ADS_ID = 'AW-18304215250'

export function trackGoogleEvent(
  eventName: string,
  params: GoogleTagEventParams = {},
) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return

  window.gtag('event', eventName, params)
}

function toAnalyticsEventSuffix(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 25)
}

export function trackIntakeStarted(mode: 'voice' | 'text' | 'form') {
  trackGoogleEvent('intake_started', {
    intake_mode: mode,
  })
}

export function trackIntakeModeSelected(mode: 'voice' | 'text') {
  trackGoogleEvent('intake_mode_selected', {
    intake_mode: mode,
  })
}

export function trackIntakeCompleted(mode: 'voice' | 'text' | 'form') {
  trackGoogleEvent('intake_completed', {
    intake_mode: mode,
  })
}

export function trackIntakeQuestionAnswered(
  mode: 'voice' | 'text',
  options: {
    questionId: string
    questionIndex: number
    answerLength: number
    complete?: boolean
    fileCount?: number
    inputMethod?: 'voice' | 'typed'
  },
) {
  const eventParams = {
    intake_mode: mode,
    input_method: options.inputMethod ?? mode,
    question_id: options.questionId,
    question_index: options.questionIndex,
    answer_length: options.answerLength,
    is_complete_after_answer: Boolean(options.complete),
    file_count: options.fileCount ?? 0,
    has_files: (options.fileCount ?? 0) > 0,
  }
  const questionEventName = `intake_answer_${toAnalyticsEventSuffix(options.questionId)}`

  trackGoogleEvent('intake_question_answered', eventParams)
  trackGoogleEvent(questionEventName, eventParams)
}

export function trackCaseSubmitted(
  mode: 'voice' | 'text' | 'form',
  options: { fileCount?: number } = {},
) {
  trackGoogleEvent('case_submitted', {
    intake_mode: mode,
    file_count: options.fileCount ?? 0,
    has_files: (options.fileCount ?? 0) > 0,
  })
}

export function trackAccountAuth(
  action: 'created' | 'signed_in',
  context: 'voice_intake' | 'text_intake' | 'form_intake' | 'dashboard',
  provider: 'email' | 'google' | 'apple' = 'email',
) {
  trackGoogleEvent(action === 'created' ? 'account_created' : 'account_signed_in', {
    auth_context: context,
    auth_provider: provider,
  })
}

export function trackFileSelected(
  context: 'voice_intake' | 'text_intake' | 'form_intake',
  fileCount: number,
) {
  trackGoogleEvent('case_file_selected', {
    file_context: context,
    file_count: fileCount,
    has_files: fileCount > 0,
  })
}

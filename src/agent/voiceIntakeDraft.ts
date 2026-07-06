import type { ChatIntakeDraft, ChatIntakeStep } from './intakeFlow'

interface VoiceIntakeMessage {
  role: 'user' | 'assistant'
  content: string
}

export function buildVoiceIntakeDraft(
  messages: VoiceIntakeMessage[],
): ChatIntakeDraft {
  const answers: ChatIntakeDraft['answers'] = {}
  let activeStep: ChatIntakeStep = 'whatHappened'

  for (const message of messages) {
    if (message.role === 'assistant') {
      activeStep = detectStep(message.content) ?? activeStep
      continue
    }

    const answer = message.content.trim()
    if (!answer) continue
    answers[activeStep] = [answers[activeStep], answer]
      .filter(Boolean)
      .join('\n')
  }

  return { answers }
}

function detectStep(message: string): ChatIntakeStep | null {
  const questionMatches = message.match(/[^.!?]*\?/g)
  const focusText = questionMatches?.length
    ? questionMatches[questionMatches.length - 1] ?? message
    : message
  const focus = focusText.toLowerCase()

  if (/\b(consent|permission|authorize|authorization|store|contact you)\b/.test(focus)) {
    return 'consent'
  }
  if (/\b(full name|your name|phone number|reach you|prefer email|phone call|text message|contact method)\b/.test(focus)) {
    return 'contact'
  }
  if (/\b(attach|upload|file|document|evidence|photo|report|record|receipt)\b/.test(focus)) {
    return 'documents'
  }
  if (/\b(injur|treatment|medical|expense|bill|property damage|missed work|days missed|lost (?:income|wages)|hourly rate|emotional|other losses)\b/.test(focus)) {
    return 'damages'
  }
  if (/\b(insurance|insurer|policy|claim number)\b/.test(focus)) {
    return 'insurerInfo'
  }
  if (/\b(who (?:was|else)|people|person|organization|involved|other driver|adverse party)\b/.test(focus)) {
    return 'adverseParty'
  }
  if (/\b(where|location|city|street|intersection|building|place)\b/.test(focus)) {
    return 'location'
  }
  if (/\b(when|what date|which date|what day|timeframe)\b/.test(focus)) {
    return 'incidentDate'
  }
  if (/\b(what happened|tell me what happened|describe (?:the )?(?:incident|accident))\b/.test(focus)) {
    return 'whatHappened'
  }

  return null
}

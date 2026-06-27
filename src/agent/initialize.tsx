import { getAI, getGenerativeModel, VertexAIBackend } from 'firebase/ai'
import { httpsCallable } from 'firebase/functions'
import { app, functions } from '../config/firebase'

export type ConversationalIntakeMessageRole = 'user' | 'assistant'

export interface ConversationalIntakeMessage {
  role: ConversationalIntakeMessageRole
  content: string
}

export interface SaveConversationalIntakeExchangeInput {
  sessionId: string | null
  userId?: string
  userMessage: ConversationalIntakeMessage
  assistantMessage: ConversationalIntakeMessage
  intake?: {
    step: string
    answer: string
    complete: boolean
  }
}

export interface ConversationalIntakeFile {
  name: string
  contentType: string
  size: number
  storagePath: string
}

interface PersistenceResponse {
  sessionId: string
}

const persistIntake = httpsCallable<Record<string, unknown>, PersistenceResponse>(
  functions,
  'persistConversationalIntake',
)

const ai = getAI(app, { backend: new VertexAIBackend('us-central1') })

export const minervaSystemInstruction = `You are True Legal's legal assistant for the website chat widget. Refer to yourself only as "our agent" or "your intake agent"; do not use a personal name.

Your job is to help visitors understand general legal concepts, think through next steps, and decide what information may be useful to gather before speaking with an attorney.

Rules:
- Be professional, concise, and practical.
- Do not claim to be a lawyer and do not create an attorney-client relationship.
- Do not provide definitive legal advice, predictions, or guarantees.
- Ask one focused follow-up question when more context is needed.
- For urgent deadlines, safety risks, criminal exposure, or active court matters, recommend speaking with a licensed attorney promptly.
- Keep the conversation in normal chat prose. Do not output intake JSON or structured extraction blocks.`

export const minervaModel = getGenerativeModel(ai, {
  model: 'gemini-2.5-flash-lite',
  systemInstruction: minervaSystemInstruction,
  generationConfig: {
    maxOutputTokens: 1024,
    temperature: 0.4,
    topP: 0.9,
  },
})

export async function saveConversationalIntakeExchange(
  input: SaveConversationalIntakeExchangeInput,
): Promise<string> {
  const response = await persistIntake({
    action: 'exchange',
    sessionId: input.sessionId,
    userMessage: input.userMessage,
    assistantMessage: input.assistantMessage,
    intake: input.intake,
  })
  return response.data.sessionId
}

export async function ensureConversationalIntakeSession(
  sessionId: string | null,
  _userId?: string,
): Promise<string> {
  const response = await persistIntake({
    action: 'ensure',
    sessionId,
  })
  return response.data.sessionId
}

export async function addConversationalIntakeFile(
  sessionId: string,
  file: ConversationalIntakeFile,
): Promise<void> {
  await persistIntake({
    action: 'file',
    sessionId,
    file,
  })
}

export async function updateConversationalIntakeProcessing(
  sessionId: string,
  input: {
    status: 'processing' | 'processed' | 'failed'
    structuredData?: unknown
    caseId?: string
    error?: string
  },
): Promise<void> {
  await persistIntake({
    action: 'processing',
    sessionId,
    ...input,
  })
}

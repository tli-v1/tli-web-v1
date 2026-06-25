import { httpsCallable } from 'firebase/functions'
import { functions } from '../config/firebase'
import type { ConversationalIntakeMessage } from '../agent/initialize'

interface RealtimeSessionResponse {
  value: string
  expiresAt: number | null
  model: string
  voice: string
}

interface PersistenceResponse {
  sessionId: string
}

const createSession = httpsCallable<Record<string, never>, RealtimeSessionResponse>(
  functions,
  'createMinervaRealtimeSession',
)

const persistIntake = httpsCallable<Record<string, unknown>, PersistenceResponse>(
  functions,
  'persistConversationalIntake',
)

export async function createMinervaRealtimeClientSecret(): Promise<RealtimeSessionResponse> {
  const response = await createSession({})
  return response.data
}

export async function ensureRealtimeIntakeSession(
  sessionId: string | null,
): Promise<string> {
  const response = await persistIntake({
    action: 'ensure',
    sessionId,
  })
  return response.data.sessionId
}

export async function persistRealtimeMessage(
  sessionId: string | null,
  message: ConversationalIntakeMessage,
): Promise<string> {
  const response = await persistIntake({
    action: 'message',
    sessionId,
    message,
  })
  return response.data.sessionId
}

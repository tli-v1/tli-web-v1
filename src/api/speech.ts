import { httpsCallable } from 'firebase/functions'
import { functions } from '../config/firebase'

interface SpeechResponse {
  audioContent: string
  contentType: string
  voice: string
  model?: string
}

const synthesizeSpeech = httpsCallable<{ text: string }, SpeechResponse>(
  functions,
  'synthesizeConversationalSpeech',
)

const speechCache = new Map<string, Promise<SpeechResponse>>()

export async function getConversationalSpeech(text: string): Promise<SpeechResponse> {
  const normalizedText = text.replace(/\s+/g, ' ').trim().slice(0, 1200)
  const cached = speechCache.get(normalizedText)
  if (cached) return cached

  const request = synthesizeSpeech({ text: normalizedText })
    .then((response) => response.data)
    .catch((error) => {
      speechCache.delete(normalizedText)
      throw error
    })

  speechCache.set(normalizedText, request)
  return request
}

export function preloadConversationalSpeech(text: string): void {
  void getConversationalSpeech(text).catch(() => {
    // Playback will retry if the user reaches this prompt.
  })
}

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  claimRealtimeIntakeSession,
  createMinervaRealtimeClientSecret,
  ensureRealtimeIntakeSession,
  persistRealtimeMessage,
} from '../api/realtime'
import { trackIntakeQuestionAnswered } from '../analytics/googleTags'
import { normalizeSpokenAmounts } from '../utils/spokenAmounts'
import { normalizeVoiceTranscript } from '../utils/voiceTranscript'

const MAX_SESSION_MS = 12 * 60 * 1000
const MAX_USER_TURNS = 20
const MAX_TOTAL_USER_CHARACTERS = 8000
const MAX_USER_MESSAGE_CHARACTERS = 2400
const WARNING_SESSION_MS = 10 * 60 * 1000
const WARNING_USER_TURNS = 16
const WARNING_TOTAL_USER_CHARACTERS = 6400
const CONNECTION_TIMEOUT_MS = 30 * 1000
const DISCONNECT_GRACE_MS = 25 * 1000
const VOICE_UNAVAILABLE_MESSAGE =
  'Voice is temporarily unavailable. You can continue this intake by text.'
const OFF_TOPIC_ENDING =
  'I’m going to pause this intake because the responses are not related to the questions.'
const REALTIME_GUARDRAIL_INSTRUCTIONS = `Track consecutive answers that do not plausibly answer your current intake question.
For the first and second irrelevant answer, briefly redirect to the same question and do not engage with unrelated content.
For the third consecutive irrelevant answer, say exactly: "I’m going to pause this intake because the responses are not related to the questions. You can start again when you’re ready." Do not ask another question.
Reset the count after a plausibly relevant answer. Ignore silence, background noise, isolated filler sounds, and unintelligible audio. Never infer an answer from them. Keep every response under 80 spoken words.
Do not ask the user to speak or type an email address. Account email is collected by the secure form.
Follow this intake order and do not skip ahead: first ask what happened; then when it happened; then where it happened; then who else was involved; then insurance or claim information; then files or notes; then injuries, treatment, expenses, missed work, property damage, emotional effects, and other losses; then name, phone if provided, and preferred contact method; then consent to securely store the information and contact the user about next steps.
Keep each question concise. If the user says they do not know or do not have optional information, accept that answer and move on.
When the legal intake is complete, say exactly: "Your intake is complete and ready to save. Please use the secure form below to sign in or create an account." Do not ask another question.`
const INTAKE_COMPLETE_PATTERN =
  /\b(intake is complete|intake complete|complete and ready to save|ready for processing)\b/i
const voiceQuestionSteps = [
  'whatHappened',
  'incidentDate',
  'location',
  'adverseParty',
  'insurerInfo',
  'documents',
  'damages',
  'contact',
  'consent',
] as const
export type RealtimeVoiceQuestionStep = typeof voiceQuestionSteps[number]

export interface RealtimeVoiceMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface RealtimeServerEvent {
  type?: string
  event_id?: string
  response_id?: string
  item_id?: string
  transcript?: string
  text?: string
  response?: {
    id?: string
    status?: string
  }
  error?: {
    message?: string
  }
}

interface PendingAssistantMessage {
  eventId: string
  content: string
}

interface RealtimeStartOptions {
  initialUserMessage?: string
  resume?: boolean
}

export function useRealtimeVoice() {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [messages, setMessages] = useState<RealtimeVoiceMessage[]>([])
  const [error, setError] = useState('')
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
  const [isProcessingUserInput, setIsProcessingUserInput] = useState(false)
  const [hasAssistantStarted, setHasAssistantStarted] = useState(false)
  const [limitReason, setLimitReason] = useState('')
  const [limitWarning, setLimitWarning] = useState('')
  const [isIntakeComplete, setIsIntakeComplete] = useState(false)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const persistedEventIdsRef = useRef(new Set<string>())
  const connectionAttemptRef = useRef(0)
  const startingRef = useRef(false)
  const connectedRef = useRef(false)
  const respondingRef = useRef(false)
  const sessionTimerRef = useRef<number | null>(null)
  const sessionWarningTimerRef = useRef<number | null>(null)
  const connectionTimerRef = useRef<number | null>(null)
  const disconnectTimerRef = useRef<number | null>(null)
  const connectionAbortRef = useRef<AbortController | null>(null)
  const userTurnCountRef = useRef(0)
  const totalUserCharactersRef = useRef(0)
  const pendingInputLockRef = useRef('')
  const pendingAssistantMessagesRef = useRef(new Map<string, PendingAssistantMessage[]>())
  const responsePausedLiveMicrophoneRef = useRef(false)
  const currentQuestionId: RealtimeVoiceQuestionStep | null = isIntakeComplete
    ? null
    : voiceQuestionSteps[
      Math.min(userTurnCountRef.current, voiceQuestionSteps.length - 1)
    ] ?? null

  const publicConnectionError = useCallback((message: string) => {
    const normalized = message.toLowerCase()
    if (
      normalized.includes('openai')
      || normalized.includes('api key')
      || normalized.includes('credential')
      || normalized.includes('client secret')
      || normalized.includes('quota')
      || normalized.includes('rate limit')
      || normalized.includes('realtime')
      || normalized.includes('https callable')
      || normalized.includes('internal')
      || message.trim().startsWith('{')
    ) {
      return VOICE_UNAVAILABLE_MESSAGE
    }

    return message
  }, [])

  const persistMessage = useCallback(async (
    role: RealtimeVoiceMessage['role'],
    content: string,
    eventId: string,
  ) => {
    const cleanContent = (
      role === 'user'
        ? normalizeSpokenAmounts(content)
        : content
    ).replace(/\s+/g, ' ').trim()
    if (!cleanContent || persistedEventIdsRef.current.has(eventId)) return
    persistedEventIdsRef.current.add(eventId)

    setMessages((current) => [
      ...current,
      { id: eventId, role, content: cleanContent },
    ])

    try {
      sessionIdRef.current = await persistRealtimeMessage(sessionIdRef.current, {
        role,
        content: cleanContent,
      })
    } catch (persistError) {
      console.warn('Unable to persist realtime message:', persistError)
    }
  }, [])

  const editMessage = useCallback((messageId: string, content: string) => {
    const cleanContent = normalizeSpokenAmounts(content).replace(/\s+/g, ' ').trim()
    if (!cleanContent) return false

    setMessages((current) => current.map((message) => (
      message.id === messageId && message.role === 'user'
        ? { ...message, content: cleanContent }
        : message
    )))
    return true
  }, [])

  const stop = useCallback(() => {
    connectionAttemptRef.current += 1
    startingRef.current = false
    connectedRef.current = false
    respondingRef.current = false
    responsePausedLiveMicrophoneRef.current = false
    setIsResponding(false)
    setIsProcessingUserInput(false)
    if (sessionTimerRef.current !== null) {
      window.clearTimeout(sessionTimerRef.current)
      sessionTimerRef.current = null
    }
    if (sessionWarningTimerRef.current !== null) {
      window.clearTimeout(sessionWarningTimerRef.current)
      sessionWarningTimerRef.current = null
    }
    if (connectionTimerRef.current !== null) {
      window.clearTimeout(connectionTimerRef.current)
      connectionTimerRef.current = null
    }
    if (disconnectTimerRef.current !== null) {
      window.clearTimeout(disconnectTimerRef.current)
      disconnectTimerRef.current = null
    }
    connectionAbortRef.current?.abort()
    connectionAbortRef.current = null
    pendingAssistantMessagesRef.current.clear()
    dataChannelRef.current?.close()
    dataChannelRef.current = null
    peerRef.current?.close()
    peerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.srcObject = null
      audioRef.current.remove()
      audioRef.current = null
    }
    setStatus('idle')
  }, [])

  const lockUserInput = useCallback((message: string) => {
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = false
    })
    setIsMicrophoneMuted(true)
    setLimitWarning('')
    setLimitReason(message)
  }, [])

  const registerUserInput = useCallback((
    content: string,
    inputMethod: 'voice' | 'typed',
  ) => {
    if (content.length > MAX_USER_MESSAGE_CHARACTERS) {
      setError(`Please keep each response under ${MAX_USER_MESSAGE_CHARACTERS} characters.`)
      return false
    }

    if (
      userTurnCountRef.current >= MAX_USER_TURNS
      || totalUserCharactersRef.current + content.length > MAX_TOTAL_USER_CHARACTERS
    ) {
      lockUserInput('This intake reached its input limit. Our agent can still finish responding.')
      return false
    }

    userTurnCountRef.current += 1
    totalUserCharactersRef.current += content.length
    const questionIndex = Math.min(userTurnCountRef.current, voiceQuestionSteps.length)
    const questionId = voiceQuestionSteps[questionIndex - 1] ?? 'additionalResponse'

    trackIntakeQuestionAnswered('voice', {
      questionId,
      questionIndex,
      answerLength: content.length,
      complete: questionIndex >= voiceQuestionSteps.length,
      inputMethod,
    })

    const turnsRemaining = MAX_USER_TURNS - userTurnCountRef.current
    const charactersRemaining =
      MAX_TOTAL_USER_CHARACTERS - totalUserCharactersRef.current

    if (turnsRemaining === 0 || charactersRemaining === 0) {
      pendingInputLockRef.current =
        'This intake reached its input limit. Our agent can still finish responding.'
      streamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = false
      })
      setIsMicrophoneMuted(true)
      setLimitWarning('Final response received. Our agent will finish before input closes.')
    } else if (
      userTurnCountRef.current >= WARNING_USER_TURNS
      || totalUserCharactersRef.current >= WARNING_TOTAL_USER_CHARACTERS
    ) {
      setLimitWarning(
        `You’re nearing the input limit: ${turnsRemaining} response${
          turnsRemaining === 1 ? '' : 's'
        } and ${charactersRemaining.toLocaleString()} characters remain.`,
      )
    }

    return true
  }, [lockUserInput])

  const toggleMicrophone = useCallback(() => {
    if (limitReason) return
    const audioTracks = streamRef.current?.getAudioTracks() ?? []
    if (!audioTracks.length) return

    const shouldMute = audioTracks.some((track) => track.enabled)
    audioTracks.forEach((track) => {
      track.enabled = !shouldMute
    })
    setIsMicrophoneMuted(shouldMute)
  }, [limitReason])

  const muteMicrophone = useCallback(() => {
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = false
    })
    setIsMicrophoneMuted(true)
  }, [])

  const queueAssistantMessage = useCallback((
    event: RealtimeServerEvent,
    content: string,
  ) => {
    const cleanContent = normalizeSpokenAmounts(content).replace(/\s+/g, ' ').trim()
    if (!cleanContent) return

    const responseId = event.response_id || event.response?.id || event.item_id || event.event_id
    if (!responseId) return

    const eventId = `assistant-${event.item_id ?? event.event_id ?? crypto.randomUUID()}`
    const existing = pendingAssistantMessagesRef.current.get(responseId) ?? []
    pendingAssistantMessagesRef.current.set(responseId, [
      ...existing.filter((message) => message.eventId !== eventId),
      { eventId, content: cleanContent },
    ])
  }, [])

  const finalizeAssistantMessages = useCallback((
    responseId: string | undefined,
    shouldPersist: boolean,
  ) => {
    if (!responseId) return

    const queued = pendingAssistantMessagesRef.current.get(responseId) ?? []
    pendingAssistantMessagesRef.current.delete(responseId)
    if (!shouldPersist) return

    for (const message of queued) {
      if (INTAKE_COMPLETE_PATTERN.test(message.content)) {
        setIsIntakeComplete(true)
        muteMicrophone()
      }
      if (message.content.includes(OFF_TOPIC_ENDING)) {
        window.setTimeout(() => {
          lockUserInput('This intake was paused after three unrelated responses.')
        }, 1200)
      }
      void persistMessage('assistant', message.content, message.eventId)
    }
  }, [lockUserInput, muteMicrophone, persistMessage])

  const sendTextMessage = useCallback((
    content: string,
    options: { preserveMicrophone?: boolean } = {},
  ) => {
    const cleanContent = normalizeSpokenAmounts(content).replace(/\s+/g, ' ').trim()
    const dataChannel = dataChannelRef.current

    if (
      !cleanContent
      || !dataChannel
      || dataChannel.readyState !== 'open'
      || respondingRef.current
      || limitReason
      || !registerUserInput(cleanContent, 'typed')
    ) {
      return false
    }

    if (!options.preserveMicrophone) {
      streamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = false
      })
      setIsMicrophoneMuted(true)
    }
    setError('')

    const messageId = `typed-${crypto.randomUUID()}`
    void persistMessage('user', cleanContent, messageId)

    dataChannel.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: cleanContent }],
      },
    }))
    dataChannel.send(JSON.stringify({
      type: 'response.create',
      response: {
        output_modalities: ['audio'],
        instructions: REALTIME_GUARDRAIL_INSTRUCTIONS,
      },
    }))
    return true
  }, [limitReason, persistMessage, registerUserInput])

  const handleServerEvent = useCallback((event: RealtimeServerEvent) => {
    if (event.type === 'input_audio_buffer.speech_started') {
      setIsProcessingUserInput(true)
      return
    }

    if (
      event.type === 'input_audio_buffer.speech_stopped'
      || event.type === 'conversation.item.input_audio_transcription.delta'
    ) {
      setIsProcessingUserInput(true)
      return
    }

    if (
      event.type === 'conversation.item.input_audio_transcription.completed'
      && event.transcript
    ) {
      setIsProcessingUserInput(false)
      const cleanTranscript = normalizeVoiceTranscript(event.transcript)
      const dataChannel = dataChannelRef.current
      if (!cleanTranscript || !registerUserInput(cleanTranscript, 'voice')) return

      void persistMessage(
        'user',
        cleanTranscript,
        `user-${event.item_id ?? crypto.randomUUID()}`,
      )
      if (dataChannel?.readyState === 'open' && !respondingRef.current) {
        dataChannel.send(JSON.stringify({
          type: 'response.create',
          response: {
            output_modalities: ['audio'],
            instructions: REALTIME_GUARDRAIL_INSTRUCTIONS,
          },
        }))
      }
      return
    }

    if (
      event.type === 'conversation.item.input_audio_transcription.completed'
      || event.type === 'conversation.item.input_audio_transcription.failed'
    ) {
      setIsProcessingUserInput(false)
      return
    }

    if (event.type === 'response.output_audio_transcript.done' && event.transcript) {
      setHasAssistantStarted(true)
      queueAssistantMessage(event, event.transcript)
      return
    }

    if (
      event.type === 'response.output_audio.delta'
      || event.type === 'response.output_audio_transcript.delta'
    ) {
      setHasAssistantStarted(true)
      return
    }

    if (event.type === 'response.output_text.done' && event.text) {
      setHasAssistantStarted(true)
      queueAssistantMessage(event, event.text)
      return
    }

    if (event.type === 'response.created') {
      respondingRef.current = true
      setIsResponding(true)
      const audioTracks = streamRef.current?.getAudioTracks() ?? []
      responsePausedLiveMicrophoneRef.current = audioTracks.some((track) => track.enabled)
      if (responsePausedLiveMicrophoneRef.current) {
        audioTracks.forEach((track) => {
          track.enabled = false
        })
        setIsMicrophoneMuted(true)
      }
      return
    }

    if (event.type === 'response.done') {
      respondingRef.current = false
      setIsResponding(false)
      finalizeAssistantMessages(
        event.response?.id || event.response_id,
        event.response?.status === 'completed',
      )
      if (
        responsePausedLiveMicrophoneRef.current
        && !pendingInputLockRef.current
        && !limitReason
      ) {
        streamRef.current?.getAudioTracks().forEach((track) => {
          track.enabled = true
        })
        setIsMicrophoneMuted(false)
      }
      responsePausedLiveMicrophoneRef.current = false
      if (pendingInputLockRef.current) {
        const message = pendingInputLockRef.current
        pendingInputLockRef.current = ''
        lockUserInput(message)
      }
      return
    }

    if (event.type === 'error') {
      console.warn('Realtime API request error:', event.error?.message || event)
      setError('Our agent had trouble processing that. Please try again.')
      respondingRef.current = false
      setIsResponding(false)
      setIsProcessingUserInput(false)
    }
  }, [
    finalizeAssistantMessages,
    limitReason,
    lockUserInput,
    persistMessage,
    queueAssistantMessage,
    registerUserInput,
  ])

  const ensureSession = useCallback(async () => {
    const sessionId = await ensureRealtimeIntakeSession(sessionIdRef.current)
    sessionIdRef.current = sessionId
    return sessionId
  }, [])

  const claimSession = useCallback(async () => {
    const sessionId = sessionIdRef.current ?? await ensureSession()
    await claimRealtimeIntakeSession(sessionId)
    return sessionId
  }, [ensureSession])

  const start = useCallback(async (options: RealtimeStartOptions = {}) => {
    if (startingRef.current || connectedRef.current) return
    const initialUserMessage = options.initialUserMessage?.replace(/\s+/g, ' ').trim() ?? ''
    const shouldResume = Boolean(options.resume)
    const connectionAttempt = connectionAttemptRef.current + 1
    connectionAttemptRef.current = connectionAttempt
    startingRef.current = true
    setStatus('connecting')
    setError('')
    setHasAssistantStarted(shouldResume && messages.length > 0)
    setLimitReason('')
    setLimitWarning('')
    if (!shouldResume) {
      setIsIntakeComplete(false)
    }
    setIsProcessingUserInput(false)
    pendingInputLockRef.current = ''
    if (!shouldResume) {
      userTurnCountRef.current = 0
      totalUserCharactersRef.current = 0
    }

    const failConnection = (message: string) => {
      if (connectionAttempt !== connectionAttemptRef.current) return
      stop()
      setStatus('error')
      setError(publicConnectionError(message))
    }

    connectionTimerRef.current = window.setTimeout(() => {
      failConnection('The voice connection timed out. Check your network and try again.')
    }, CONNECTION_TIMEOUT_MS)

    try {
      await ensureSession()
      if (connectionAttempt !== connectionAttemptRef.current) return

      const [{ value: ephemeralKey }, stream] = await Promise.all([
        createMinervaRealtimeClientSecret(),
        navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        }),
      ])
      if (connectionAttempt !== connectionAttemptRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      const peer = new RTCPeerConnection()
      const audio = new Audio()
      audio.autoplay = true
      audioRef.current = audio
      streamRef.current = stream
      setIsMicrophoneMuted(false)
      peerRef.current = peer

      peer.ontrack = (event) => {
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track])
        event.track.addEventListener('ended', () => {
          failConnection('The agent audio connection ended. Try reconnecting.')
        }, { once: true })
        void audio.play().catch(() => {
          failConnection('The browser could not play the agent audio. Try reconnecting.')
        })
      }

      stream.getAudioTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          failConnection('Microphone access ended. Check your browser permissions and try again.')
        }, { once: true })
        peer.addTrack(track, stream)
      })

      const dataChannel = peer.createDataChannel('oai-events')
      dataChannelRef.current = dataChannel
      dataChannel.addEventListener('message', (messageEvent) => {
        try {
          handleServerEvent(JSON.parse(messageEvent.data) as RealtimeServerEvent)
        } catch {
          console.warn('Received an invalid Realtime API event.')
        }
      })
      dataChannel.addEventListener('open', () => {
        if (connectionAttempt !== connectionAttemptRef.current) {
          dataChannel.close()
          peer.close()
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        startingRef.current = false
        connectedRef.current = true
        if (connectionTimerRef.current !== null) {
          window.clearTimeout(connectionTimerRef.current)
          connectionTimerRef.current = null
        }
        connectionAbortRef.current = null
        setStatus('connected')
        sessionWarningTimerRef.current = window.setTimeout(() => {
          setLimitWarning('About two minutes of input time remain in this intake.')
        }, WARNING_SESSION_MS)
        sessionTimerRef.current = window.setTimeout(() => {
          const message =
            'This intake reached its input-time limit. Our agent can still finish responding.'
          stream.getAudioTracks().forEach((track) => {
            track.enabled = false
          })
          setIsMicrophoneMuted(true)
          if (respondingRef.current) {
            pendingInputLockRef.current = message
            setLimitWarning('Input time ended. Our agent will finish the current response.')
          } else {
            lockUserInput(message)
          }
        }, MAX_SESSION_MS)
        dataChannel.send(JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            max_output_tokens: 'inf',
            audio: {
              input: {
                noise_reduction: {
                  type: 'near_field',
                },
                turn_detection: {
                  type: 'semantic_vad',
                  eagerness: 'low',
                  create_response: false,
                  interrupt_response: false,
                },
              },
            },
          },
        }))
        if (initialUserMessage) {
          const sentInitialMessage = sendTextMessage(initialUserMessage, {
            preserveMicrophone: true,
          })

          if (!sentInitialMessage) {
            dataChannel.send(JSON.stringify({
              type: 'response.create',
              response: {
                instructions:
                'Greet the user briefly, explain that you will ask one question at a time, and ask what happened.',
              },
            }))
          }
        } else if (shouldResume && messages.length > 0) {
          const transcript = messages
            .slice(-18)
            .map((message) => `${message.role === 'assistant' ? 'Agent' : 'User'}: ${message.content}`)
            .join('\n')

          dataChannel.send(JSON.stringify({
            type: 'response.create',
            response: {
              instructions:
                `${REALTIME_GUARDRAIL_INSTRUCTIONS}\n\nResume this existing intake without restarting from the first question. Use the conversation so far to identify the next missing intake question and ask only that next question. Do not repeat questions already answered.\n\nConversation so far:\n${transcript}`,
            },
          }))
        } else {
          dataChannel.send(JSON.stringify({
            type: 'response.create',
            response: {
              instructions:
                'Greet the user briefly, explain that you will ask one question at a time, and ask what happened.',
            },
          }))
        }
      })
      dataChannel.addEventListener('error', () => {
        failConnection('The realtime data connection failed. Try reconnecting.')
      })
      dataChannel.addEventListener('close', () => {
        failConnection('The realtime session disconnected. Try reconnecting.')
      })

      peer.addEventListener('connectionstatechange', () => {
        if (connectionAttempt !== connectionAttemptRef.current) return

        if (peer.connectionState === 'connected') {
          if (disconnectTimerRef.current !== null) {
            window.clearTimeout(disconnectTimerRef.current)
            disconnectTimerRef.current = null
          }
          return
        }

        if (peer.connectionState === 'disconnected') {
          if (disconnectTimerRef.current === null) {
            disconnectTimerRef.current = window.setTimeout(() => {
              disconnectTimerRef.current = null
              failConnection('The realtime session disconnected. Try reconnecting.')
            }, DISCONNECT_GRACE_MS)
          }
          return
        }

        if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
          failConnection('The realtime session disconnected. Try reconnecting.')
        }
      })

      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      const connectionAbort = new AbortController()
      connectionAbortRef.current = connectionAbort
      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        signal: connectionAbort.signal,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
      })

      if (!sdpResponse.ok) {
        throw new Error(await sdpResponse.text() || 'OpenAI rejected the realtime connection.')
      }

      if (connectionAttempt !== connectionAttemptRef.current) {
        dataChannel.close()
        peer.close()
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      await peer.setRemoteDescription({
        type: 'answer',
        sdp: await sdpResponse.text(),
      })
    } catch (startError) {
      if (connectionAttempt !== connectionAttemptRef.current) return
      failConnection(
        startError instanceof Error && startError.name !== 'AbortError'
          ? startError.message
          : 'The voice connection timed out. Check your network and try again.',
      )
    }
  }, [
    ensureSession,
    handleServerEvent,
    lockUserInput,
    messages,
    publicConnectionError,
    sendTextMessage,
    stop,
  ])

  useEffect(() => stop, [stop])

  return {
    supported: Boolean(navigator.mediaDevices?.getUserMedia && window.RTCPeerConnection),
    status,
    messages,
    error,
    hasAssistantStarted,
    isMicrophoneMuted,
    isResponding,
    isProcessingUserInput,
    isIntakeComplete,
    currentQuestionId,
    limitReason,
    limitWarning,
    claimSession,
    editMessage,
    ensureSession,
    sendTextMessage,
    start,
    stop,
    toggleMicrophone,
  }
}

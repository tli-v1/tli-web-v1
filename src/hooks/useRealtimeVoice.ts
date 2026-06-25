import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createMinervaRealtimeClientSecret,
  ensureRealtimeIntakeSession,
  persistRealtimeMessage,
} from '../api/realtime'

const MAX_SESSION_MS = 8 * 60 * 1000
const MAX_USER_TURNS = 20
const MAX_TOTAL_USER_CHARACTERS = 6000
const MAX_USER_MESSAGE_CHARACTERS = 800
const WARNING_SESSION_MS = 6 * 60 * 1000
const WARNING_USER_TURNS = 16
const WARNING_TOTAL_USER_CHARACTERS = 4800
const OFF_TOPIC_ENDING =
  'I’m going to pause this intake because the responses are not related to the questions.'
const REALTIME_GUARDRAIL_INSTRUCTIONS = `Track consecutive answers that do not plausibly answer your current intake question.
For the first and second irrelevant answer, briefly redirect to the same question and do not engage with unrelated content.
For the third consecutive irrelevant answer, say exactly: "I’m going to pause this intake because the responses are not related to the questions. You can start again when you’re ready." Do not ask another question.
Reset the count after a plausibly relevant answer. Ignore silence, background noise, isolated filler sounds, and unintelligible audio. Never infer an answer from them. Keep every response under 80 spoken words.
Do not ask the user to speak or type an email address. Account email is collected by the secure form.
Follow this intake order and do not skip ahead: what happened; when; where; involved people or organizations; insurance or claim information; injuries, treatment, expenses, property damage, work or income loss, emotional effects, and other losses; then one generic optional file-upload step; then contact preferences and consent.
The file-upload step must not occur until the incident, timing, location, parties, insurance, injuries, treatment, and damages questions have been addressed. At that point, ask once whether the user wants to attach any relevant files, such as reports, medical records or bills, photos, videos, insurance documents, receipts, or correspondence. Tell them the attachment button is below. Do not ask for file categories separately, do not request each file type individually, and do not revisit uploads after that step. Continue normally if they have no files or want to upload later.
When the legal intake is complete, say exactly: "Your intake is complete and ready to save. Please use the secure form below to sign in or create an account." Do not ask another question.`
const INTAKE_COMPLETE_PATTERN =
  /\b(intake is complete|intake complete|complete and ready to save|ready for processing)\b/i

export interface RealtimeVoiceMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface RealtimeServerEvent {
  type?: string
  event_id?: string
  item_id?: string
  transcript?: string
  text?: string
  error?: {
    message?: string
  }
}

export function useRealtimeVoice() {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [messages, setMessages] = useState<RealtimeVoiceMessage[]>([])
  const [error, setError] = useState('')
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
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
  const userTurnCountRef = useRef(0)
  const totalUserCharactersRef = useRef(0)
  const pendingInputLockRef = useRef('')

  const persistMessage = useCallback(async (
    role: RealtimeVoiceMessage['role'],
    content: string,
    eventId: string,
  ) => {
    const cleanContent = content.replace(/\s+/g, ' ').trim()
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

  const stop = useCallback(() => {
    connectionAttemptRef.current += 1
    startingRef.current = false
    connectedRef.current = false
    respondingRef.current = false
    setIsResponding(false)
    if (sessionTimerRef.current !== null) {
      window.clearTimeout(sessionTimerRef.current)
      sessionTimerRef.current = null
    }
    if (sessionWarningTimerRef.current !== null) {
      window.clearTimeout(sessionWarningTimerRef.current)
      sessionWarningTimerRef.current = null
    }
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

  const registerUserInput = useCallback((content: string) => {
    if (content.length > MAX_USER_MESSAGE_CHARACTERS) {
      setError(`Please keep each response under ${MAX_USER_MESSAGE_CHARACTERS} characters.`)
      return false
    }

    if (
      userTurnCountRef.current >= MAX_USER_TURNS
      || totalUserCharactersRef.current + content.length > MAX_TOTAL_USER_CHARACTERS
    ) {
      lockUserInput('This intake reached its input limit. Minerva can still finish responding.')
      return false
    }

    userTurnCountRef.current += 1
    totalUserCharactersRef.current += content.length

    const turnsRemaining = MAX_USER_TURNS - userTurnCountRef.current
    const charactersRemaining =
      MAX_TOTAL_USER_CHARACTERS - totalUserCharactersRef.current

    if (turnsRemaining === 0 || charactersRemaining === 0) {
      pendingInputLockRef.current =
        'This intake reached its input limit. Minerva can still finish responding.'
      streamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = false
      })
      setIsMicrophoneMuted(true)
      setLimitWarning('Final response received. Minerva will finish before input closes.')
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

  const sendTextMessage = useCallback((content: string) => {
    const cleanContent = content.replace(/\s+/g, ' ').trim()
    const dataChannel = dataChannelRef.current

    if (
      !cleanContent
      || !dataChannel
      || dataChannel.readyState !== 'open'
      || respondingRef.current
      || limitReason
      || !registerUserInput(cleanContent)
    ) {
      return false
    }

    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = false
    })
    setIsMicrophoneMuted(true)
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
    if (
      event.type === 'conversation.item.input_audio_transcription.completed'
      && event.transcript
    ) {
      const cleanTranscript = event.transcript.replace(/\s+/g, ' ').trim()
      const dataChannel = dataChannelRef.current
      if (!cleanTranscript || !registerUserInput(cleanTranscript)) return

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

    if (event.type === 'response.output_audio_transcript.done' && event.transcript) {
      if (INTAKE_COMPLETE_PATTERN.test(event.transcript)) {
        setIsIntakeComplete(true)
        muteMicrophone()
      }
      if (event.transcript.includes(OFF_TOPIC_ENDING)) {
        window.setTimeout(() => {
          lockUserInput('This intake was paused after three unrelated responses.')
        }, 1200)
      }
      void persistMessage(
        'assistant',
        event.transcript,
        `assistant-${event.item_id ?? crypto.randomUUID()}`,
      )
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
      if (INTAKE_COMPLETE_PATTERN.test(event.text)) {
        setIsIntakeComplete(true)
        muteMicrophone()
      }
      void persistMessage(
        'assistant',
        event.text,
        `assistant-${event.item_id ?? crypto.randomUUID()}`,
      )
      return
    }

    if (event.type === 'response.created') {
      respondingRef.current = true
      setIsResponding(true)
      return
    }

    if (event.type === 'response.done') {
      respondingRef.current = false
      setIsResponding(false)
      if (pendingInputLockRef.current) {
        const message = pendingInputLockRef.current
        pendingInputLockRef.current = ''
        lockUserInput(message)
      }
      return
    }

    if (event.type === 'error') {
      console.warn('Realtime API request error:', event.error?.message || event)
      setError('Minerva had trouble processing that. Please try again.')
      respondingRef.current = false
      setIsResponding(false)
    }
  }, [lockUserInput, muteMicrophone, persistMessage, registerUserInput])

  const ensureSession = useCallback(async () => {
    const sessionId = await ensureRealtimeIntakeSession(sessionIdRef.current)
    sessionIdRef.current = sessionId
    return sessionId
  }, [])

  const start = useCallback(async () => {
    if (startingRef.current || connectedRef.current) return
    const connectionAttempt = connectionAttemptRef.current + 1
    connectionAttemptRef.current = connectionAttempt
    startingRef.current = true
    setStatus('connecting')
    setError('')
    setHasAssistantStarted(false)
    setLimitReason('')
    setLimitWarning('')
    setIsIntakeComplete(false)
    pendingInputLockRef.current = ''
    userTurnCountRef.current = 0
    totalUserCharactersRef.current = 0

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
        void audio.play().catch(() => undefined)
      }

      stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream))

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
        setStatus('connected')
        sessionWarningTimerRef.current = window.setTimeout(() => {
          setLimitWarning('About two minutes of input time remain in this intake.')
        }, WARNING_SESSION_MS)
        sessionTimerRef.current = window.setTimeout(() => {
          const message =
            'This intake reached its input-time limit. Minerva can still finish responding.'
          stream.getAudioTracks().forEach((track) => {
            track.enabled = false
          })
          setIsMicrophoneMuted(true)
          if (respondingRef.current) {
            pendingInputLockRef.current = message
            setLimitWarning('Input time ended. Minerva will finish the current response.')
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
                  type: 'server_vad',
                  threshold: 0.75,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 700,
                  create_response: false,
                  interrupt_response: false,
                },
              },
            },
          },
        }))
        dataChannel.send(JSON.stringify({
          type: 'response.create',
          response: {
            instructions:
              'Greet the user briefly, explain that you will ask one question at a time, and ask what happened.',
          },
        }))
      })
      dataChannel.addEventListener('close', () => {
        if (connectionAttempt !== connectionAttemptRef.current) return
        connectedRef.current = false
        respondingRef.current = false
        setIsResponding(false)
        setStatus('error')
        setError('The realtime session disconnected. Try reconnecting.')
      })

      peer.addEventListener('connectionstatechange', () => {
        if (
          connectionAttempt !== connectionAttemptRef.current
          || !['failed', 'disconnected'].includes(peer.connectionState)
        ) {
          return
        }
        connectedRef.current = false
        respondingRef.current = false
        setIsResponding(false)
        setStatus('error')
        setError('The realtime session disconnected. Try reconnecting.')
      })

      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
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
      stop()
      setStatus('error')
      setError(startError instanceof Error ? startError.message : 'Unable to start voice intake.')
    }
  }, [ensureSession, handleServerEvent, lockUserInput, stop])

  useEffect(() => stop, [stop])

  return {
    supported: Boolean(navigator.mediaDevices?.getUserMedia && window.RTCPeerConnection),
    status,
    messages,
    error,
    hasAssistantStarted,
    isMicrophoneMuted,
    isResponding,
    isIntakeComplete,
    limitReason,
    limitWarning,
    claimSession: ensureSession,
    ensureSession,
    sendTextMessage,
    start,
    stop,
    toggleMicrophone,
  }
}

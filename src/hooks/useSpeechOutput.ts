import { useCallback, useEffect, useRef, useState } from 'react'
import { getConversationalSpeech } from '../api/speech'

const silentWav =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
let sharedAudio: HTMLAudioElement | null = null

function getAudioElement(): HTMLAudioElement {
  sharedAudio ??= new Audio()
  return sharedAudio
}

export function unlockConversationalAudio(): void {
  const unlockAudio = new Audio(silentWav)
  unlockAudio.volume = 0
  void unlockAudio.play().then(() => {
    unlockAudio.pause()
    unlockAudio.removeAttribute('src')
  }).catch(() => undefined)
}

interface UseSpeechOutputOptions {
  onStart?: () => void
  onEnd?: () => void
  onError?: (message: string) => void
}

export function useSpeechOutput({ onStart, onEnd, onError }: UseSpeechOutputOptions = {}) {
  const [muted, setMuted] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [loading, setLoading] = useState(false)
  const audioUrlRef = useRef<string | null>(null)
  const lastTextRef = useRef('')
  const mutedRef = useRef(false)
  const requestIdRef = useRef(0)
  const cacheRef = useRef(new Map<string, { audioContent: string; contentType: string }>())

  const stop = useCallback(() => {
    requestIdRef.current += 1
    const audio = getAudioElement()
    audio.pause()
    audio.currentTime = 0
    setLoading(false)
    setSpeaking(false)
  }, [])

  useEffect(() => {
    return () => {
      stop()
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    }
  }, [stop])

  const speak = useCallback(async (text: string) => {
    const cleanText = text.replace(/\s+/g, ' ').trim().slice(0, 1200)
    if (!cleanText || mutedRef.current) return

    lastTextRef.current = cleanText
    stop()
    const requestId = requestIdRef.current
    setLoading(true)

    try {
      let speech = cacheRef.current.get(cleanText)
      if (!speech) {
        const response = await getConversationalSpeech(cleanText)
        speech = {
          audioContent: response.audioContent,
          contentType: response.contentType,
        }
        cacheRef.current.set(cleanText, speech)
      }

      if (requestId !== requestIdRef.current || mutedRef.current) return

      const bytes = Uint8Array.from(atob(speech.audioContent), (character) => character.charCodeAt(0))
      const blob = new Blob([bytes], { type: speech.contentType })
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = URL.createObjectURL(blob)

      const audio = getAudioElement()
      audio.src = audioUrlRef.current
      audio.volume = 1
      audio.playbackRate = 1.24
      audio.preservesPitch = true
      const finish = () => {
        setLoading(false)
        setSpeaking(false)
        onEnd?.()
      }
      audio.onended = finish
      audio.onerror = finish
      setLoading(false)
      setSpeaking(true)
      onStart?.()
      await audio.play()
    } catch (error) {
      console.error('Premium voice playback failed:', error)
      setLoading(false)
      setSpeaking(false)
      onError?.('Premium voice is temporarily unavailable. You can continue by text.')
    }
  }, [onEnd, onError, onStart, stop])

  const replay = useCallback(() => {
    if (lastTextRef.current) void speak(lastTextRef.current)
  }, [speak])

  const toggleMuted = useCallback(() => {
    const nextMuted = !mutedRef.current
    mutedRef.current = nextMuted
    setMuted(nextMuted)
    if (nextMuted) stop()
  }, [stop])

  return {
    supported: true,
    muted,
    speaking,
    loading,
    speak,
    stop,
    replay,
    toggleMuted,
  }
}

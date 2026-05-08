import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

interface SpeechRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  start: () => void
  stop: () => void
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<{
    isFinal: boolean
    0: {
      transcript: string
    }
  }>
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

interface UseVoiceInputOptions {
  onTranscript: (transcript: string) => void
  onError?: (message: string) => void
}

export function useVoiceInput({ onTranscript, onError }: UseVoiceInputOptions) {
  const [supported, setSupported] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const enabledRef = useRef(false)
  const stoppingRef = useRef(false)
  const restartTimerRef = useRef<number | null>(null)

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    enabledRef.current = false
    stoppingRef.current = true
    clearRestartTimer()
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setEnabled(false)
    setListening(false)
  }, [clearRestartTimer])

  const start = useCallback(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      onError?.('Voice input is not supported in this browser. Try Chrome or Edge, or type your message.')
      return
    }

    clearRestartTimer()
    stoppingRef.current = false
    enabledRef.current = true
    setEnabled(true)

    const recognition = new Recognition()
    recognitionRef.current = recognition
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = false

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (transcript) {
        onTranscript(transcript)
      }
    }

    recognition.onerror = (event) => {
      setListening(false)
      if (event.error && !['aborted', 'no-speech'].includes(event.error)) {
        onError?.('I could not capture that voice input. Please try again or type your message.')
      }
    }

    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)

      if (!enabledRef.current || stoppingRef.current) return

      restartTimerRef.current = window.setTimeout(() => {
        if (enabledRef.current && !recognitionRef.current) {
          start()
        }
      }, 250)
    }

    try {
      recognition.start()
      setListening(true)
    } catch {
      stop()
      onError?.('I could not start voice input. Please try again or type your message.')
    }
  }, [clearRestartTimer, onError, onTranscript, stop])

  const toggle = useCallback(() => {
    if (enabledRef.current) {
      stop()
      return
    }

    start()
  }, [start, stop])

  useEffect(() => {
    setSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition))
    return stop
  }, [stop])

  return {
    supported,
    enabled,
    listening,
    toggle,
    stop,
  }
}

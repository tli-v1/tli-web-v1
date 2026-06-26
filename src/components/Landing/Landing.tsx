import { useEffect, useRef, useState } from 'react'
import { MessageSquareText, Mic } from 'lucide-react'
import RealtimeVoiceIntake from '../RealtimeVoiceIntake'
import Footer from '../Footer'
import './Landing.css'

function Landing() {
  const marketplaceRef = useRef<HTMLElement | null>(null)
  const launchTimerRef = useRef<number | null>(null)
  const [isMarketplaceVisible, setIsMarketplaceVisible] = useState(false)
  const [isIntakeOpen, setIsIntakeOpen] = useState(false)
  const [isIntakeLaunching, setIsIntakeLaunching] = useState(false)
  const [intakeMode, setIntakeMode] = useState<'text' | 'voice'>('voice')

  useEffect(() => {
    const section = marketplaceRef.current

    if (!section || !('IntersectionObserver' in window)) {
      setIsMarketplaceVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsMarketplaceVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.22 },
    )

    observer.observe(section)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      if (launchTimerRef.current !== null) {
        window.clearTimeout(launchTimerRef.current)
      }
    }
  }, [])

  const launchVoiceIntake = () => {
    if (isIntakeLaunching) return

    setIsIntakeLaunching(true)
    launchTimerRef.current = window.setTimeout(() => {
      launchTimerRef.current = null
      setIsIntakeOpen(true)
      setIsIntakeLaunching(false)
    }, 560)
  }

  return (
    <main className="landing">
      <section
        id="home"
        className={`hero full-height full-bleed ${isIntakeLaunching ? 'is-launching' : ''}`}>
        <div className="hero-title">
          <h1>The best lawyers</h1>
          <h1 className="hero-title__emphasis">are here for you</h1>
        </div>

        <div className="hero-voice-action">
          <span className="hero-voice-label">Share what happened</span>
          <div
            className={`hero-mode-toggle is-${intakeMode} ${isIntakeLaunching ? 'is-launching' : ''}`}
            role="group"
            aria-label="Choose intake mode"
          >
            <span className="hero-mode-toggle__thumb" aria-hidden="true" />
            <button
              className={intakeMode === 'voice' ? 'hero-mode-option is-active' : 'hero-mode-option'}
              type="button"
              aria-label={intakeMode === 'voice' ? 'Start voice intake' : 'Use voice intake mode'}
              aria-pressed={intakeMode === 'voice'}
              disabled={isIntakeLaunching}
              onClick={() => {
                if (intakeMode === 'voice') {
                  launchVoiceIntake()
                  return
                }
                setIntakeMode('voice')
              }}
            >
              <Mic aria-hidden="true" />
              <span>Voice</span>
            </button>
            <button
              className={intakeMode === 'text' ? 'hero-mode-option is-active' : 'hero-mode-option'}
              type="button"
              aria-label="Use text intake mode"
              aria-pressed={intakeMode === 'text'}
              disabled={isIntakeLaunching}
              onClick={() => setIntakeMode('text')}
            >
              <MessageSquareText aria-hidden="true" />
              <span>Text</span>
            </button>
          </div>
          <span className="hero-mode-helper">
            {intakeMode === 'voice'
              ? 'Tap to start · Naturally converse with our agent'
              : "Tap to start · Best for silence and if you would prefer to type / text"}
          </span>
        </div>
      </section>

      {isIntakeOpen && (
        <div className="hero-chat-overlay" role="dialog" aria-modal="true" aria-label="Conversational intake">
          <button
            className="hero-chat-overlay__backdrop"
            type="button"
            aria-label="Close conversational intake"
            onClick={() => {
              setIsIntakeOpen(false)
              setIsIntakeLaunching(false)
            }}
          />
          <RealtimeVoiceIntake
            onClose={() => {
              setIsIntakeOpen(false)
              setIsIntakeLaunching(false)
            }}
          />
        </div>
      )}

      <Footer />
    </main>
  )
}

export default Landing

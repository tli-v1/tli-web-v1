import { useEffect, useRef, useState } from 'react'
import { BriefcaseBusiness, Check, FileText, MessageSquareText, Mic, Scale, X } from 'lucide-react'
import RealtimeVoiceIntake from '../RealtimeVoiceIntake'
import { ChatWidget } from '../ChatWidget/ChatWidget'
import Footer from '../Footer'
import HowItWorks from '../HowItWorks'
import { getSession, onAuthStateChange } from '../../api/auth'
import { trackGoogleEvent, trackIntakeStarted } from '../../analytics/googleTags'
import type { User } from '../../types'
import './Landing.css'

function Landing() {
  const launchTimerRef = useRef<number | null>(null)
  const [isIntakeOpen, setIsIntakeOpen] = useState(false)
  const [isIntakeLaunching, setIsIntakeLaunching] = useState(false)
  const [intakeMode, setIntakeMode] = useState<'text' | 'voice'>('voice')
  const [sessionUser, setSessionUser] = useState<User | null>(null)

  useEffect(() => {
    return () => {
      if (launchTimerRef.current !== null) {
        window.clearTimeout(launchTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    void getSession().then((user) => {
      if (isMounted) setSessionUser(user)
    })
    const unsubscribe = onAuthStateChange(setSessionUser)

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  const launchVoiceIntake = () => {
    if (isIntakeLaunching) return

    setIsIntakeLaunching(true)
    launchTimerRef.current = window.setTimeout(() => {
      launchTimerRef.current = null
      trackIntakeStarted('voice')
      setIsIntakeOpen(true)
      setIsIntakeLaunching(false)
    }, 560)
  }

  const launchTextIntake = () => {
    if (isIntakeLaunching) return

    setIsIntakeLaunching(true)
    launchTimerRef.current = window.setTimeout(() => {
      launchTimerRef.current = null
      trackIntakeStarted('text')
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
              onClick={() => {
                if (intakeMode === 'text') {
                  launchTextIntake()
                  return
                }
                setIntakeMode('text')
              }}
            >
              <MessageSquareText aria-hidden="true" />
              <span>Text</span>
            </button>
          </div>
          <span className="hero-mode-helper">
            {intakeMode === 'voice'
              ? 'Tap to start · Naturally converse with our agent'
              : "Tap to start · Best for silent texting"}
          </span>
        </div>
      </section>

      <HowItWorks />

      <section className="dashboard-preview-section" aria-labelledby="dashboard-preview-title">
        <div className="dashboard-preview-section__inner">
          <div className="dashboard-preview-copy">
            <span className="dashboard-preview-eyebrow">After intake</span>
            <h2 id="dashboard-preview-title">Watch your case workspace come together.</h2>
            <p>
              Your answers become a clear case snapshot, then we review the matter, contact matching lawyers,
              and show offers as they come in.
            </p>
          </div>

          <div className="dashboard-preview-demo" aria-label="Animated preview of a filled out case dashboard">
            <div className="dashboard-preview-card dashboard-preview-card--main">
              <div className="dashboard-preview-card__topline">
                <span>Case workspace</span>
                <strong>Under review</strong>
              </div>
              <div className="dashboard-preview-card__title">
                <FileText aria-hidden="true" />
                <div>
                  <span>What happened</span>
                  <strong className="dashboard-preview-title-cycle">
                    <span>
                      Auto Accident
                      <small>Charlotte, NC</small>
                    </span>
                    <span>
                      Employment Issue
                      <small>Austin, TX</small>
                    </span>
                    <span>
                      Contract Dispute
                      <small>Denver, CO</small>
                    </span>
                  </strong>
                </div>
              </div>
              <div className="dashboard-preview-examples" aria-label="Example case descriptions">
                <p>
                  <span>Car crash caused neck pain</span>
                  <span>and medical bills.</span>
                </p>
                <p>
                  <span>Fired after reporting</span>
                  <span>unsafe work conditions.</span>
                </p>
                <p>
                  <span>Contractor kept my deposit</span>
                  <span>and left repairs unfinished.</span>
                </p>
              </div>
              <div className="dashboard-preview-grid">
                <div>
                  <span>Incident date</span>
                  <strong>Jul 4, 2026</strong>
                </div>
                <div>
                  <span>Medical bills</span>
                  <strong>$10,030</strong>
                </div>
                <div>
                  <span>Property damage</span>
                  <strong>$20,000</strong>
                </div>
              </div>
            </div>

            <div className="dashboard-preview-side">
              <div className="dashboard-preview-card dashboard-preview-card--compact dashboard-preview-card--files">
                <FileText aria-hidden="true" />
                <div>
                  <span>Case files</span>
                  <strong>3 files organized</strong>
                </div>
              </div>
              <div className="dashboard-preview-card dashboard-preview-card--compact dashboard-preview-card--lawyers">
                <Scale aria-hidden="true" />
                <div>
                  <span>Lawyers contacted</span>
                  <strong>5 matched firms</strong>
                </div>
              </div>
              <div className="dashboard-preview-card dashboard-preview-card--offer">
                <div className="dashboard-preview-offer-head">
                  <BriefcaseBusiness aria-hidden="true" />
                  <span>New offer received</span>
                </div>
                <div className="dashboard-preview-lawyer-list">
                  <div className="dashboard-preview-lawyer-row">
                    <strong>Grant Smith</strong>
                    <small>12 yrs exp · Columbia Law · Trial counsel</small>
                  </div>
                  <div className="dashboard-preview-lawyer-row">
                    <strong>Sarah Lee</strong>
                    <small>18 yrs exp · UCLA Law · Injury claims</small>
                  </div>
                  <div className="dashboard-preview-lawyer-row">
                    <strong>Marcus Strong</strong>
                    <small>9 yrs exp · Georgetown Law · Employment</small>
                  </div>
                </div>
              </div>
            </div>

            <div className="dashboard-preview-timeline" aria-hidden="true">
              <span className="is-complete">Intake complete</span>
              <span className="is-active">Reviewing match</span>
              <span>Offers arrive</span>
            </div>
          </div>
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
          {intakeMode === 'voice' ? (
            <RealtimeVoiceIntake
              onFallbackToText={() => {
                trackGoogleEvent('voice_fallback_to_text')
                setIntakeMode('text')
                setIsIntakeLaunching(false)
              }}
              onClose={() => {
                setIsIntakeOpen(false)
                setIsIntakeLaunching(false)
              }}
            />
          ) : (
            <TextIntakeModal
              user={sessionUser}
              onClose={() => {
                setIsIntakeOpen(false)
                setIsIntakeLaunching(false)
              }}
            />
          )}
        </div>
      )}

      <Footer />
    </main>
  )
}

interface TextIntakeModalProps {
  user: User | null
  onClose: () => void
}

function TextIntakeModal({ user, onClose }: TextIntakeModalProps) {
  const [stage, setStage] = useState<'loading' | 'ready' | 'chat'>('loading')

  useEffect(() => {
    const readyTimer = window.setTimeout(() => setStage('ready'), 900)
    const chatTimer = window.setTimeout(() => setStage('chat'), 2050)

    return () => {
      window.clearTimeout(readyTimer)
      window.clearTimeout(chatTimer)
    }
  }, [])

  if (stage !== 'chat') {
    return (
      <section
        className={`realtime-intake ${
          stage === 'ready' ? 'realtime-intake--all-set' : 'realtime-intake--loading'
        }`}
        aria-label="Preparing text legal intake"
        aria-live="polite"
      >
        <button
          className="realtime-intake__close realtime-intake__loading-close"
          type="button"
          onClick={onClose}
          aria-label="Close text intake"
        >
          <X aria-hidden="true" />
        </button>
        {stage === 'ready' ? (
          <div className="realtime-intake__loading-content realtime-intake__all-set-content">
            <div className="realtime-intake__loading-mark realtime-intake__all-set-mark" aria-hidden="true">
              <Check />
            </div>
            <h2>All Set!</h2>
            <p>Our agent is ready to chat.</p>
          </div>
        ) : (
          <div className="realtime-intake__loading-content">
            <div className="realtime-intake__loading-mark" aria-hidden="true">
              <MessageSquareText />
            </div>
            <h2>Getting things ready for you!</h2>
            <p>Our agent will be with you in just a moment</p>
            <span className="realtime-intake__loading-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="text-intake-modal__chat">
      <ChatWidget
        user={user}
        variant="hero"
        intakeMode
        voiceEnabled={false}
        onClose={onClose}
      />
    </div>
  )
}

export default Landing

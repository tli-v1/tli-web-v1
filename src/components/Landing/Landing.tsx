import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  BriefcaseBusiness,
  Check,
  Clock3,
  FileText,
  LockKeyhole,
  Mic,
  Scale,
  SendHorizontal,
  ShieldCheck,
} from 'lucide-react'
import RealtimeVoiceIntake from '../RealtimeVoiceIntake'
import Footer from '../Footer'
import HowItWorks from '../HowItWorks'
import {
  trackGoogleEvent,
  trackIntakeModeSelected,
  trackIntakeStarted,
} from '../../analytics/googleTags'
import billboardGraphic from '../../assets/highway_accident_billboard.png'
import lowSettlementGraphic from '../../assets/settlement_offer.png'
import threeStepGraphic from '../../assets/marketing_promises.png'
import './Landing.css'

function Landing() {
  const launchTimerRef = useRef<number | null>(null)
  const heroPromptRef = useRef<HTMLTextAreaElement | null>(null)
  const [isIntakeOpen, setIsIntakeOpen] = useState(false)
  const [isIntakeLaunching, setIsIntakeLaunching] = useState(false)
  const [intakeMode, setIntakeMode] = useState<'text' | 'voice'>('text')
  const [heroPrompt, setHeroPrompt] = useState('')
  const [isHeroPromptFocused, setIsHeroPromptFocused] = useState(false)
  const [initialTextPrompt, setInitialTextPrompt] = useState('')
  const [initialVoicePrompt, setInitialVoicePrompt] = useState('')

  useEffect(() => {
    if (!isHeroPromptFocused || isIntakeOpen) return
    const viewport = window.visualViewport
    let frame = 0
    const keepPromptVisible = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!window.matchMedia('(max-width: 1050px)').matches) return
        const input = heroPromptRef.current
        if (!input || document.activeElement !== input) return
        const bounds = input.form?.getBoundingClientRect()
        if (!bounds) return
        // Mobile keyboards shrink/pan the visual viewport without necessarily
        // resizing the layout viewport. Measure against the visible area.
        const top = (viewport?.offsetTop ?? 0) + 80
        const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 20
        const delta = bounds.bottom > bottom
          ? bounds.bottom - bottom
          : bounds.top < top ? bounds.top - top : 0
        if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'instant' })
      })
    }
    keepPromptVisible()
    // Also run after browsers finish their automatic focus/keyboard scrolling.
    const settled = window.setTimeout(keepPromptVisible, 350)
    viewport?.addEventListener('resize', keepPromptVisible)
    viewport?.addEventListener('scroll', keepPromptVisible)
    window.addEventListener('resize', keepPromptVisible)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(settled)
      viewport?.removeEventListener('resize', keepPromptVisible)
      viewport?.removeEventListener('scroll', keepPromptVisible)
      window.removeEventListener('resize', keepPromptVisible)
    }
  }, [isHeroPromptFocused, isIntakeOpen])

  useEffect(() => {
    if (!isIntakeOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [isIntakeOpen])

  useEffect(() => {
    return () => {
      if (launchTimerRef.current !== null) {
        window.clearTimeout(launchTimerRef.current)
      }
    }
  }, [])


  useEffect(() => {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll<HTMLElement>('.landing-reveal').forEach((element) => {
        element.classList.add('is-visible')
      })
      return
    }

    const revealElements = Array.from(document.querySelectorAll<HTMLElement>('.landing-reveal'))
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      {
        threshold: 0.16,
        rootMargin: '0px 0px -12% 0px',
      },
    )

    revealElements.forEach((element) => observer.observe(element))

    return () => observer.disconnect()
  }, [])

  const launchVoiceIntake = (initialPrompt = '') => {
    if (isIntakeLaunching) return

    setIsIntakeLaunching(true)
    launchTimerRef.current = window.setTimeout(() => {
      launchTimerRef.current = null
      trackIntakeModeSelected('voice')
      trackIntakeStarted('voice')
      setInitialVoicePrompt(initialPrompt.trim())
      setIsIntakeOpen(true)
      setIsIntakeLaunching(false)
    }, 560)
  }

  const launchTextIntake = (initialPrompt = '') => {
    if (isIntakeLaunching) return

    setIsIntakeLaunching(true)
    if (launchTimerRef.current !== null) {
      window.clearTimeout(launchTimerRef.current)
      launchTimerRef.current = null
    }

    trackIntakeModeSelected('text')
    trackIntakeStarted('text')
    setInitialTextPrompt(initialPrompt.trim())
    setIsIntakeOpen(true)
    setIsIntakeLaunching(false)
  }

  const handleHeroPromptSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanPrompt = (heroPromptRef.current?.value ?? heroPrompt).trim()
    trackGoogleEvent('hero_prompt_submitted', {
      answer_length: cleanPrompt.length,
      has_prompt: cleanPrompt.length > 0,
    })
    setIntakeMode('text')
    launchTextIntake(cleanPrompt)
  }

  return (
    <main className="landing">
      <section
        id="home"
        className={[
          'hero full-height full-bleed',
          isIntakeLaunching ? 'is-launching' : '',
        ].filter(Boolean).join(' ')}
      >
        <div className="hero-title">
          <h1>Find a lawyer</h1>

          <p className="hero-title__emphasis">We’ll build your case and connect you with top lawyers</p>
        </div>

        <div className="hero-proof-points" aria-label="True Legal Innovations highlights">
          <span><Check aria-hidden="true" />100% free</span>
          <span><Clock3 aria-hidden="true" />Takes about 3 minutes</span>
          <span><ShieldCheck aria-hidden="true" />Reviewed by real attorneys</span>
          <span><LockKeyhole aria-hidden="true" />No obligation</span>
        </div>

        <div className="hero-intake-stage">
          <form className="hero-intake-prompt" onSubmit={handleHeroPromptSubmit}>
            <div
              className={`hero-intake-prompt__placeholder${heroPrompt.trim() || isHeroPromptFocused ? ' is-hidden' : ''}`}
              aria-hidden="true"
            >
              <span className="hero-intake-prompt__intro">Start here:</span>
              <span className="hero-intake-prompt__examples" aria-label="Example case descriptions">
                <span>“Car crash caused neck pain and medical bills.”</span>
                <span>“Fired after reporting unsafe work conditions.”</span>
                <span>“Contractor kept my deposit and left repairs unfinished.”</span>
              </span>
            </div>
            <textarea
              ref={heroPromptRef}
              id="hero-intake-prompt"
              value={heroPrompt}
              rows={1}
              disabled={isIntakeLaunching}
              aria-label="Start your legal intake"
              placeholder=""
              onFocus={() => setIsHeroPromptFocused(true)}
              onBlur={() => setIsHeroPromptFocused(false)}
              onChange={(event) => setHeroPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
            />
            <div className="hero-intake-prompt__actions">
              <div className="hero-intake-prompt__right-actions">
                <button
                  className="hero-intake-prompt__mic"
                  type="button"
                  aria-label="Start voice intake"
                  disabled={isIntakeLaunching}
                  onClick={() => {
                    setIntakeMode('voice')
                    launchVoiceIntake((heroPromptRef.current?.value ?? heroPrompt).trim())
                  }}
                >
                  <Mic aria-hidden="true" />
                  <span className="hero-intake-prompt__tooltip" aria-hidden="true">Start Voice</span>
                </button>
                <button
                  className="hero-intake-prompt__submit"
                  type="submit"
                  aria-label="Start text intake"
                  disabled={isIntakeLaunching}
                >
                  <SendHorizontal aria-hidden="true" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      <HowItWorks />

      <section className="dashboard-preview-section landing-reveal" aria-labelledby="dashboard-preview-title">
        <div className="dashboard-preview-section__inner">
          <div className="dashboard-preview-copy">
            <span className="dashboard-preview-eyebrow">After intake</span>
            <h2 id="dashboard-preview-title">Watch your case come together</h2>
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

      <section className="landing-final-cta landing-reveal" aria-labelledby="landing-final-cta-title">
        <div className="landing-final-cta__inner">
          <span className="landing-final-cta__eyebrow">The problem we fix</span>
          <h2 id="landing-final-cta-title">The truth about billboards</h2>
          <p>
            High-volume law firms spend millions on ads, not always on your case. Here’s what that can mean for you.
          </p>

          <div className="landing-final-cta__story" aria-label="Why matching with focused attorneys matters">
            <article className="landing-final-cta__story-card">
              <h3>Spending on ads</h3>
              <p>Millions go into flashy billboards and TV commercials.</p>
              <div className="landing-final-cta__graphic-panel" aria-hidden="true">
                <img src={billboardGraphic} alt="" loading="lazy" decoding="async" />
              </div>
            </article>

            <article className="landing-final-cta__story-card">
              <h3>Big promises</h3>
              <p>Sound Familiar? Fast settlements. Top dollar. We’ll handle everything.</p>
              <div className="landing-final-cta__graphic-panel" aria-hidden="true">
                <img src={threeStepGraphic} alt="" loading="lazy" decoding="async" />
              </div>
            </article>

            <article className="landing-final-cta__story-card">
              <h3>In reality, you get less </h3>
              <p>Firms and insurance companies settle quick, lowballing you.</p>
              <div className="landing-final-cta__graphic-panel" aria-hidden="true">
                <img src={lowSettlementGraphic} alt="" loading="lazy" decoding="async" />
              </div>
            </article>
          </div>

          <div className="landing-final-cta__bottom">
            <div className="landing-final-cta__shield" aria-hidden="true">✓</div>
            <div>
              <strong>You deserve better</strong>
              <p>We connect you with qualified attorneys who focus on your case, not their ads.</p>
            </div>
            <div className="landing-final-cta__action">
              <a className="landing-final-cta__button" href="#home">
                Start free intake
              </a>
              <small>100% free · No obligation · Private &amp; secure</small>
            </div>
          </div>
        </div>
      </section>

      {isIntakeOpen && intakeMode === 'text' && (
        <div className="hero-chat-overlay" role="dialog" aria-modal="true" aria-label="Text intake">
          <button
            className="hero-chat-overlay__backdrop"
            type="button"
            aria-label="Close text intake"
            onClick={() => {
              setIsIntakeOpen(false)
              setIsIntakeLaunching(false)
              setInitialTextPrompt('')
            }}
          />
          <RealtimeVoiceIntake
            key={`hero-text-intake-${initialTextPrompt || 'empty'}`}
            mode="text"
            initialUserMessage={initialTextPrompt}
            onClose={() => {
              setIsIntakeOpen(false)
              setIsIntakeLaunching(false)
              setInitialTextPrompt('')
            }}
          />
        </div>
      )}

      {isIntakeOpen && intakeMode === 'voice' && (
        <div className="hero-chat-overlay" role="dialog" aria-modal="true" aria-label="Conversational intake">
          <button
            className="hero-chat-overlay__backdrop"
            type="button"
            aria-label="Close conversational intake"
            onClick={() => {
              setIsIntakeOpen(false)
              setIsIntakeLaunching(false)
              setInitialVoicePrompt('')
            }}
          />
          <RealtimeVoiceIntake
            initialUserMessage={initialVoicePrompt}
            onFallbackToText={() => {
              trackGoogleEvent('voice_fallback_to_text')
              setInitialTextPrompt(initialVoicePrompt)
              setInitialVoicePrompt('')
              setIntakeMode('text')
              setIsIntakeOpen(true)
              setIsIntakeLaunching(false)
            }}
            onClose={() => {
              setIsIntakeOpen(false)
              setIsIntakeLaunching(false)
              setInitialVoicePrompt('')
            }}
          />
        </div>
      )}

      <Footer />
    </main>
  )
}

export default Landing

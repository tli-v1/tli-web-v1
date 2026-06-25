import { useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'
import RealtimeVoiceIntake from '../RealtimeVoiceIntake'
import Footer from '../Footer'
import './Landing.css'

function Landing() {
  const marketplaceRef = useRef<HTMLElement | null>(null)
  const [isMarketplaceVisible, setIsMarketplaceVisible] = useState(false)
  const [isIntakeOpen, setIsIntakeOpen] = useState(false)

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

  return (
    <main className="landing">
      <section
        id="home"
        className="hero full-height full-bleed">
        <div className="hero-title">
          <h1>The best lawyers</h1>
          <h1 className="hero-title__emphasis">are here for you</h1>
        </div>

        <div className="hero-voice-action">
          <div className="hero-voice-highlight">
            <button
              className="hero-voice-button"
              type="button"
              aria-label="Start conversational intake"
              onClick={() => setIsIntakeOpen(true)}
            >
              <Mic aria-hidden="true" />
            </button>
          </div>
          <span className="hero-voice-label">Share what happened</span>
        </div>
      </section>

      {isIntakeOpen && (
        <div className="hero-chat-overlay" role="dialog" aria-modal="true" aria-label="Conversational intake">
          <button
            className="hero-chat-overlay__backdrop"
            type="button"
            aria-label="Close conversational intake"
            onClick={() => setIsIntakeOpen(false)}
          />
          <RealtimeVoiceIntake onClose={() => setIsIntakeOpen(false)} />
        </div>
      )}

      <Footer />
    </main>
  )
}

export default Landing

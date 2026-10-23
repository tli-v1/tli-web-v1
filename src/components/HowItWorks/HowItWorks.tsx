import { useEffect, useRef, useState } from 'react'
import {
  FileCheck,
  Handshake,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react'
import './HowItWorks.css'

const steps: Array<{
  title: string
  description: string
  Icon: LucideIcon
}> = [
  {
    title: 'Tell us what happened',
    description:
      'Share your story by voice or text, at your own pace.',
    Icon: MessageCircle,
  },
  {
    title: 'We build your profile',
    description:
      'We organize your case. Your identity stays private until you choose a lawyer.',
    Icon: FileCheck,
  },
  {
    title: 'Choose your lawyer',
    description:
      'Compare offers, fees, and experience. Choose who you want to speak with.',
    Icon: Handshake,
  },
]

export default function HowItWorks() {
  const sectionRef = useRef<HTMLElement | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const section = sectionRef.current

    if (!section || !('IntersectionObserver' in window)) {
      setIsVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.22 },
    )

    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className={`how-it-works full-bleed${isVisible ? ' is-visible' : ''}`}
    >
      <div className="how-it-works__intro">
        <p className="eyebrow">How it works</p>
        <h2>
          Let Attorneys Compete
        </h2>
        <p>
          Your case becomes a simple profile we match with lawyers best suited for you
        </p>
      </div>

      <div className="how-it-works__steps" aria-label="How it works steps">
        {steps.map(({ title, description, Icon }, index) => (
          <article
            className="how-it-works__card"
            key={title}
          >
            <div className="how-it-works__card-heading">
              <span className="how-it-works__icon">
                <Icon aria-hidden="true" />
              </span>
              <span className="how-it-works__number" aria-label={`Step ${index + 1}`}>
                {String(index + 1)}
              </span>
              <h3>{title}</h3>
            </div>
            <p>{description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

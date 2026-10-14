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
    title: 'Build your case profile',
    description:
      'Chat or text with our agent so we get an idea of what happened. You can finish in one sitting or come back and edit in the dashboard.',
    Icon: MessageCircle,
  },
  {
    title: 'We prepare it',
    description:
      'We organize your answers into a short, anonymous case profile. Your name and contact info stay private until you pick a lawyer.',
    Icon: FileCheck,
  },
  {
    title: 'Firms compete',
    description:
      'Lawyers send you simple, clear offers that show their fees, experience, and plan for your case. Compare them easily and choose who you want to speak with.',
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
          Let Attorneys Compete for Your Case
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
              <span className="how-it-works__number">Step {index + 1}</span>
              <h3>{title}</h3>
            </div>
            <p>{description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

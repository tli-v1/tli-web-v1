import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import './HowItWorks.css'

const steps = [
  {
    title: 'Build your case profile',
    description:
      'Chat or text with our agent so we get an idea of what happened. You can finish in one sitting or come back and edit in the dashboard.',
  },
  {
    title: 'We prepare it',
    description:
      'We organize your answers into a short, anonymous case profile. Your name and contact info stay private until you pick a lawyer.',
  },
  {
    title: 'Firms compete',
    description:
      'Lawyers send you simple, clear offers that show their fees, experience, and plan for your case. Compare them easily and choose who you want to speak with.',
  },
]

export default function HowItWorks() {
  const sectionRef = useRef<HTMLElement | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [rotationResetToken, setRotationResetToken] = useState(0)

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

  useEffect(() => {
    if (!isVisible) return undefined

    const interval = window.setInterval(() => {
      setActiveStepIndex((current) => (current + 1) % steps.length)
    }, 5200)

    return () => window.clearInterval(interval)
  }, [isVisible, rotationResetToken])

  const resetRotationTimer = () => {
    setRotationResetToken((current) => current + 1)
  }

  const goToPreviousStep = () => {
    resetRotationTimer()
    setActiveStepIndex((current) => (current - 1 + steps.length) % steps.length)
  }

  const goToNextStep = () => {
    resetRotationTimer()
    setActiveStepIndex((current) => (current + 1) % steps.length)
  }

  const goToStep = (index: number) => {
    resetRotationTimer()
    setActiveStepIndex(index)
  }

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

      <div className="how-it-works__carousel" aria-label="How it works carousel">
        <button
          className="how-it-works__control"
          type="button"
          aria-label="Show previous step"
          onClick={goToPreviousStep}
        >
          <ChevronLeft aria-hidden="true" />
        </button>

        <div className="how-it-works__viewport">
          <div
            className="how-it-works__track"
            style={{ transform: `translateX(-${activeStepIndex * 100}%)` }}
          >
        {steps.map(({ title, description }, index) => (
          <article
            className={`how-it-works__card${index === activeStepIndex ? ' is-active' : ''}`}
            key={title}
            aria-hidden={index !== activeStepIndex}
          >
            <div className="how-it-works__card-heading">
              <span className="how-it-works__number">{index + 1}</span>
              <h3>{title}</h3>
            </div>
            <p>{description}</p>
          </article>
        ))}
          </div>
        </div>

        <button
          className="how-it-works__control"
          type="button"
          aria-label="Show next step"
          onClick={goToNextStep}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>

      <div className="how-it-works__dots" aria-label="Choose how it works step">
        {steps.map(({ title }, index) => (
          <button
            className={index === activeStepIndex ? 'is-active' : ''}
            type="button"
            key={title}
            aria-label={`Show step ${index + 1}: ${title}`}
            aria-current={index === activeStepIndex ? 'step' : undefined}
            onClick={() => goToStep(index)}
          />
        ))}
      </div>
    </section>
  )
}

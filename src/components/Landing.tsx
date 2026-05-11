import { Link } from 'react-router-dom'
import heroLegalSupport from '../assets/hero-legal-support.png'

function Landing() {
  return (
    <main className="landing">
      <section
        id="home"
        className="hero full-height full-bleed"
        style={{ '--hero-image': `url(${heroLegalSupport})` }}
      >
        <div className="section">
          <h1>Let Top Lawyers Compete for Your Case</h1>
          <p className="lead">
            Were you injured or affected by an incident?
            Submit a secure intake detailing what happened. Trusted law firms review your case and send their best offers. You choose who to talk to, with no pressure and no sales calls.
          </p>
          <div className="hero-actions">
            <Link className="btn accent" to="/base/intake">
              Get Your Case on the Marketplace
            </Link>
            <a className="btn secondary" href="#how-it-works">
              Learn How It Works
            </a>
          </div>
        </div>

        <div className="hero-card">
          <h3>How the Marketplace Works</h3>
          <ul className="hero-steps">
            <li className="hero-step">
              <span className="step-badge">1</span>
              <div>
                <strong>Submit Your Case</strong>
                <span>
                  Complete a secure intake that captures the facts, documents, and damages.
                </span>
              </div>
            </li>
            <li className="hero-step">
              <span className="step-badge">2</span>
              <div>
                <strong>Firms Review &amp; Make Offers</strong>
                <span>
                  Vetted trial firms see an anonymized profile and send their best pitch to represent you.
                </span>
              </div>
            </li>
            <li className="hero-step">
              <span className="step-badge">3</span>
              <div>
                <strong>Compare and Choose</strong>
                <span>
                  Review fees, experience, and strategy side-by-side, then pick the lawyer that feels right.
                </span>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section id="how-it-works" className="section full-height">
        <div className="section-intro">
          <h2>How the TLI marketplace works</h2>
          <p>
            We turn your information into a simple profile lawyers can quickly understand. Instead of
            you calling around, the right lawyers reach out with their best offers.
          </p>
        </div>

        <div className="how-grid">
          <article className="process-card">
            <p className="eyebrow">Step 1</p>
            <h3>Build your case profile</h3>
            <p>
              Answer a few clear questions about what happened and upload any photos or documents.
              You can finish in one sitting or come back anytime.
            </p>
          </article>
          <article className="process-card">
            <p className="eyebrow">Step 2</p>
            <h3>We prepare it for the marketplace</h3>
            <p>
              We organize your answers into a short, anonymous case profile. Your name and contact
              info stay private until you pick a lawyer.
            </p>
          </article>
          <article className="process-card">
            <p className="eyebrow">Step 3</p>
            <h3>Firms compete to represent you</h3>
            <p>
              Lawyers send you simple, clear offers that show their fees, experience, and plan for
              your case. Compare them easily and choose who you want to speak with.
            </p>
          </article>
        </div>

        <div className="info-panels">
          <article className="info-panel info-panel--dark">
            <h3>For people with a case</h3>
            <p>
              You fill out one secure profile, and interested firms send you clear offers so you can
              choose what&apos;s best for you.
            </p>
            <ul className="feature-list feature-list--dark">
              <li>One simple profile, multiple firm offers</li>
              <li>Easy-to-compare fees and next steps</li>
              <li>You stay in control at every step</li>
            </ul>
          </article>
          <article className="info-panel">
            <h3>Built around ethics and transparency</h3>
            <p>
              We keep things simple and honest. Your information stays private, firms must follow our
              standards, and you choose when to connect.
            </p>
            <ul className="feature-list feature-list--light">
              <li>Your case stays private</li>
              <li>Firms follow clear rules</li>
              <li>You control when contact happens</li>
            </ul>
          </article>
        </div>
      </section>

      <section id="for-law-firms" className="firm-section full-bleed">
        <div className="firm-inner">
          <div>
            <h2>High-quality, structured cases for serious trial firms.</h2>
            <p>
              TLI is designed for firms that want strong cases, not just more leads. We bring you
              structured case files with documents, timelines, and basic damages captured up front, so
              you spend less time screening and more time lawyering.
            </p>
            <ul className="feature-list feature-list--dark">
              <li>Pre-screened, structured case profiles</li>
              <li>Clear expectations around communication and fees</li>
              <li>Better client fit through transparent matching</li>
            </ul>
          </div>

          <div className="firm-card">
            <h3>What participation looks like</h3>
            <ul className="feature-list feature-list--dark">
              <li>Receive anonymized case profiles that match your practice areas and jurisdictions.</li>
              <li>Submit tailored pitches that explain your experience, approach, and proposed fee structure.</li>
              <li>Connect with clients who have already gathered key information and documents.</li>
            </ul>
            <p>
              We are currently speaking with firms about getting onboarded to the marketplace. If you
              would like to learn more, reach out below.
            </p>
            <a className="btn accent" href="#contact">
              Get in touch about firm access
            </a>
          </div>
        </div>
      </section>

      <section id="about" className="about-section">
        <div className="section-intro">
          <p className="eyebrow">Why we exist</p>
          <h2>About True Legal Innovations</h2>
        </div>
        <div className="about-grid">
          <article className="contact-card about-card">
            <span className="about-card__label">Founders' note</span>
            <p>
              TLI was founded by people who have seen, from the inside, how hard it is for individuals
              to get straight answers after something goes wrong. Most people only interact with the
              legal system when they are already under stress, and they rarely have the information
              they need to make a confident choice.
            </p>
          </article>
          <article className="contact-card about-card">
            <span className="about-card__label">Our mission</span>
            <p>
              Our mission is to make it easier for people with real cases to find the right lawyers,
              and for good lawyers to find the clients they can genuinely help. We believe your lawyer
              should be chosen on the strength of their experience and approach to your case, not just
              the size of their ad budget.
            </p>
          </article>
        </div>
      </section>

      <section id="contact" className="section contact contact-section full-bleed">
        <div className="contact-inner">
          <div className="section-intro">
            <h2>Get in Touch</h2>
            <p>
              Have questions about how the marketplace works, or interested in getting early access as
              a firm or partner? Reach out and we&apos;ll follow up with more details.
            </p>
          </div>

          <div className="contact-grid">
            <article className="contact-card">
              <h4>General inquiries</h4>
              <p>Email us any time with questions about the product, partnerships, or press.</p>
              <a href="mailto:alex@truelegalinnovations.com">alex@truelegalinnovations.com</a>
            </article>
            <article className="contact-card contact-card--dark">
              <h4>For law firms</h4>
              <p>
                If you&apos;re a firm interested in learning more about participating in the marketplace,
                send us a note with your practice areas and jurisdictions.
              </p>
              <a href="mailto:alex@truelegalinnovations.com">alex@truelegalinnovations.com</a>
            </article>
          </div>
        </div>
      </section>

      <footer className="footer">
        <span>© 2025 True Legal Innovations, LLC.</span>
        <span>Not a law firm and does not provide legal advice. Matches do not guarantee outcomes.</span>
      </footer>
    </main>
  )
}

export default Landing

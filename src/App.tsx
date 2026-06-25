import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import Logo from './assets/tli_logo.png'
import IntakeForm from './components/IntakeForm'
import Landing from './components/Landing'
import Dashboard from './components/Dashboard'
import CaseDetails from './components/CaseDetails'
import ResetPassword from './components/ResetPassword'

function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)

  const scrollToSection = (sectionId) => {
    const section = document.getElementById(sectionId)
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleNavClick = (event, sectionId) => {
    event.preventDefault()
    if (location.pathname !== '/') {
      navigate('/', { state: { scrollTo: sectionId } })
      setNavOpen(false)
      return
    }
    scrollToSection(sectionId)
    setNavOpen(false)
  }

  const onLanding = location.pathname === '/'

  useEffect(() => {
    if (!onLanding) return
    const target = location.state?.scrollTo
    if (!target) return

    const timeout = setTimeout(() => scrollToSection(target), 0)
    navigate(location.pathname, { replace: true, state: {} })

    return () => clearTimeout(timeout)
  }, [location, navigate, onLanding])

  return (
    <div className="site-shell">
      <nav className={`navbar ${navOpen ? 'nav-open' : ''}`}>
        <div className="nav-left">
          <Link to="/" className="logo">
            <img src={Logo} alt="True Legal Innovations logo" className="logo-img" />
            <span className="logo-text">True Legal Innovations</span>
          </Link>

          <button
            type="button"
            className="menu-toggle"
            aria-label="Toggle navigation menu"
            aria-expanded={navOpen}
            onClick={(event) => {
              setNavOpen((open) => !open)
              event.currentTarget.blur()
            }}
          >
            <span className={navOpen ? 'menu-line line-top open' : 'menu-line line-top'} />
            <span className={navOpen ? 'menu-line line-mid open' : 'menu-line line-mid'} />
            <span className={navOpen ? 'menu-line line-bottom open' : 'menu-line line-bottom'} />
          </button>

          <div className="nav-links">
            <a href="#home" onClick={(event) => handleNavClick(event, 'home')}>
              Home
            </a>
            <a href="#about" onClick={(event) => handleNavClick(event, 'about')}>
              About Us
            </a>
            <a href="#how-it-works" onClick={(event) => handleNavClick(event, 'how-it-works')}>
              How It Works
            </a>
            <a href="#contact" onClick={(event) => handleNavClick(event, 'contact')}>
              Contact Us
            </a>
            <a href="#for-law-firms" onClick={(event) => handleNavClick(event, 'for-law-firms')}>
              For Law Firms
            </a>
          </div>
        </div>

        <div className="nav-actions">
          <Link to="/dashboard" className="nav-intake" onClick={() => setNavOpen(false)}>
            Dashboard
          </Link>
          <Link to="/base/intake" className="btn accent slim" onClick={() => setNavOpen(false)}>
            Start Intake
          </Link>
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/base/intake" element={<IntakeForm />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/cases/:caseId" element={<CaseDetails />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

export default App

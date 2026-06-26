import { useState } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../../assets/tli_logo.png'
import './Navbar.css'

function Navbar() {
  const [navOpen, setNavOpen] = useState(false)

  const closeNav = () => setNavOpen(false)

  return (
    <nav className={`navbar ${navOpen ? 'nav-open' : ''}`}>
      <div className="nav-left">
        <Link to="/" className="logo" onClick={closeNav}>
          <img src={Logo} alt="True Legal Innovations logo" className="logo-img" />
            TRUE <span>LEGAL</span> INNOVATIONS
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
      </div>

      <div className="nav-actions">
        <Link to="/dashboard" className="nav-intake" onClick={closeNav}>
          Dashboard
        </Link>
        <Link to="/base/intake" className="btn accent slim" onClick={closeNav}>
          Start Intake
        </Link>
      </div>
    </nav>
  )
}

export default Navbar

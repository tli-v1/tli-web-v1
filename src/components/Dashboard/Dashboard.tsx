import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getUserCases } from '../../api/cases'
import { getSession, onAuthStateChange, signUp, signInWithPassword, signOut, resetPasswordForEmail } from '../../api/auth'
import { getUserProfile } from '../../api/userProfile'
import type { User, CaseSummary } from '../../types'
import './Dashboard.css'

function Dashboard() {
  const [sessionUser, setSessionUser] = useState<User | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [casesLoading, setCasesLoading] = useState(false)
  const [casesError, setCasesError] = useState('')
  const [profileName, setProfileName] = useState('')

  const formatDate = (iso: string | null | undefined): string => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return '—'
    }
  }

  useEffect(() => {
    let isMounted = true

    getSession().then((user) => {
      if (!isMounted) return
      setSessionUser(user)
      setCheckingSession(false)
    })

    const unsubscribe = onAuthStateChange((user) => {
      setSessionUser(user)
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!sessionUser) {
      setProfileName('')
      return
    }
    let cancel = false
    const loadProfile = async () => {
      console.log('signed in : ', sessionUser.id)
      const { data, error } = await getUserProfile(sessionUser.id)
      if (cancel) return
      if (error) {
        setProfileName('')
        return
      }
      console.log(data)
      setProfileName(data?.full_name || '')
    }
    loadProfile()
    return () => {
      cancel = true
    }
  }, [sessionUser])

  useEffect(() => {
    if (!sessionUser) {
      setCases([])
      return
    }
    let cancel = false
    const loadCases = async () => {
      setCasesLoading(true)
      setCasesError('')
      const { data, error } = await getUserCases(sessionUser.id)
      if (cancel) return
      if (error) {
        setCasesError('No cases found.')
        setCases([])
      } else {
        setCases(data || [])
      }
      setCasesLoading(false)
    }
    loadCases()
    return () => {
      cancel = true
    }
  }, [sessionUser])

  if (checkingSession) {
    return (
      <main className="dashboard">
        <section className="card dashboard-card">
          <p className="helper-text">Loading your dashboard...</p>
        </section>
      </main>
    )
  }

  const handleAuthAction = async () => {
    const email = authEmail.trim()
    if (!email) {
      setAuthError('Enter your email.')
      return
    }
    if (authPassword.length < 6) {
      setAuthError('Password must be at least 6 characters long.')
      return
    }

    setAuthLoading(true)
    setAuthError('')
    setAuthMessage('')

    try {
      if (authMode === 'signup') {
        const { user, session, error } = await signUp(email, authPassword)

        if (error?.code === 'user_exists') {
          setAuthMode('login')
          setAuthError('Looks like that email already has an account. Log in instead.')
          return
        }

        if (error) throw error

        setSessionUser(user)
        setAuthMessage(
          session
            ? 'Account created and signed in.'
            : 'Account created! Please confirm via email to finish signing in.'
        )
      } else {
        const { user, error } = await signInWithPassword(email, authPassword)
        if (error) throw error
        setSessionUser(user)
        setAuthMessage('Signed in successfully.')
      }
      setAuthPassword('')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Invalid email or password')
    } finally {
      setAuthLoading(false)
    }
  }

  const handlePasswordReset = async () => {
    const email = authEmail.trim()
    if (!email) {
      setAuthError('Enter your email first.')
      return
    }
    setAuthLoading(true)
    setAuthError('')
    setAuthMessage('')
    try {
      const { error } = await resetPasswordForEmail(email, `${window.location.origin}/reset-password`)
      if (error) throw error
      setAuthMessage('If an account exists for that email, you will receive a password reset link.')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Password reset failed')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    setSignOutError('')
    const { error } = await signOut()
    if (error) {
      setSignOutError(error.message)
    } else {
      setSessionUser(null)
    }
    setSigningOut(false)
  }

  if (!sessionUser) {
    return (
      <main className="dashboard">
        <section className="card dashboard-card auth-gate">
          <div className="dashboard-head">
            <div>
              <p className="eyebrow">Secure dashboard</p>
              <h1>{authMode === 'signup' ? 'Create Account' : 'Sign In'}</h1>
            </div>
          </div>

          <div className="auth-toggle">
            <button
              type="button"
              className={`chip ${authMode === 'login' ? 'chip--active' : ''}`}
              onClick={() => {
                setAuthMode('login')
                setAuthError('')
                setAuthMessage('')
              }}
            >
              Log in
            </button>
            <button
              type="button"
              className={`chip ${authMode === 'signup' ? 'chip--active' : ''}`}
              onClick={() => {
                setAuthMode('signup')
                setAuthError('')
                setAuthMessage('')
              }}
            >
              Create account
            </button>
          </div>

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={authEmail}
              onChange={(event) => {
                setAuthEmail(event.target.value)
                setAuthError('')
              }}
              placeholder="you@email.com"
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={authPassword}
              onChange={(event) => {
                setAuthPassword(event.target.value)
                setAuthError('')
              }}
              placeholder="At least 6 characters"
            />
          </label>

          {authMode === 'login' && (
            <button type="button" className="link-button" onClick={handlePasswordReset} disabled={authLoading}>
              Forgot password? Email me a reset link
            </button>
          )}

          <button type="button" className="btn accent" onClick={handleAuthAction} disabled={authLoading}>
            {authLoading ? 'Saving...' : authMode === 'signup' ? 'Create account' : 'Log in'}
          </button>

          {authError && <p className="error">{authError}</p>}
          {authMessage && !authError && <p className="notice">{authMessage}</p>}

          <div className="auth-footer">
            <p className="helper-text">
              Prefer the guided intake? You can also authenticate in the contact step of the intake form.
            </p>
            <Link to="/base/intake" className="btn secondary">
              Go to intake flow
            </Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="dashboard">
      <section className="card dashboard-card">
        <header className="dashboard-head">
          <div>
            <p className="eyebrow">Welcome back</p>
            <h1>Hi, {profileName || sessionUser.email}</h1>
            <p className="lead">
              Track the matters you&apos;ve submitted and pick up where you left off.
            </p>
          </div>
          <div className="dashboard-actions">
            <Link to="/base/intake" className="btn accent">
              Start new intake
            </Link>
            <button type="button" className="btn secondary" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </header>

        <section className="cases-section">
          <div className="cases-head">
            <h2>Your submitted cases</h2>
            {casesError && <p className="error">{casesError}</p>}
            {!casesError && <p className="helper-text">Click a case to view its full details.</p>}
          </div>

          {casesLoading && <p className="helper-text">Loading your cases…</p>}

          {!casesLoading && cases.length === 0 && !casesError && (
            <div className="empty-state">
              <p className="lead">No cases yet</p>
              <p className="helper-text">Start an intake to see it appear here.</p>
            </div>
          )}

          {!casesLoading && cases.length > 0 && (
            <div className="cases-grid">
              {cases.map((item) => {
                const location = [item.city, item.state].filter(Boolean).join(', ') || 'Unspecified location'
                return (
                  <Link
                    key={item.case_id}
                    to={`/dashboard/cases/${item.case_id}`}
                    className="case-card case-card--link"
                  >
                    <div className="case-card__body">
                      <p className="case-title">Incident · {location}</p>
                      <p className="case-meta">Submitted {formatDate(item.created_at)}</p>
                      <p className="case-meta">Docs uploaded: {item.doc_count}</p>
                      <p className="case-meta">Agreements: {item.agreement_count}</p>
                    </div>
                    <span className="status-pill">{item.status}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
        {signOutError && <p className="error">{signOutError}</p>}
      </section>
    </main>
  )
}

export default Dashboard

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { getSession, onAuthStateChange, signUp, signInWithPassword, signOut, resetPasswordForEmail } from '../api/auth'
import { getStateCodes, type StateCode } from '../api/stateCodes'
import { ensureUserProfile } from '../api/userProfile'
import { createCase, deleteCase, createIncident, createDamages, createCaseContact, createParties, createDocument } from '../api/intake'
import { uploadFile, removeFiles } from '../storage/fileUpload'
import type { User } from '../types'

const steps = [
  {
    name: 'Incident basics',
    title: 'Tell us what happened',
    description:
      'Capture the essential facts so we understand the event and when it occurred.',
  },
  {
    name: 'Parties',
    title: 'Insurance Information (Optional)',
    description:
      'Share any insurance information you have',
  },
  {
    name: 'Documents',
    title: 'Supporting documents',
    description:
      'Upload what you have, or authorize us to retrieve reports on your behalf.',
  },
  {
    name: 'Damages',
    title: 'Damages to date',
    description:
      'Rough numbers help us scope exposure and prioritize next steps.',
  },
  {
    name: 'Contact & consent',
    title: 'How should we reach you?',
    description:
      'Provide your preferred contact details and confirm we can store your information.',
  },
]

interface FormData {
  whatHappened: string;
  incidentDate: string;
  city: string;
  state: string;
  adverseParty: string;
  insurerName: string;
  policyNumber: string;
  claimNumber: string;
  policeReportFile: string;
  incidentPhotosFile: string;
  medicalSummaryFile: string;
  authorizeDocuments: boolean;
  medicalBills: string;
  daysMissed: string;
  hourlyRate: string;
  fullName: string;
  preferredContact: string;
  email: string;
  phone: string;
  consentProcess: boolean;
  consentContact: boolean;
}

interface SelectedFiles {
  policeReportFile: File | null;
  incidentPhotosFile: File | null;
  medicalSummaryFile: File | null;
}

const initialFormData: FormData = {
  whatHappened: '',
  incidentDate: '',
  city: '',
  state: '',
  adverseParty: '',
  insurerName: '',
  policyNumber: '',
  claimNumber: '',
  policeReportFile: '',
  incidentPhotosFile: '',
  medicalSummaryFile: '',
  authorizeDocuments: false,
  medicalBills: '',
  daysMissed: '',
  hourlyRate: '',
  fullName: '',
  preferredContact: 'email',
  email: '',
  phone: '',
  consentProcess: false,
  consentContact: false,
}

const roundToCents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const currencyInputValue = (value: string) => {
  if (value.trim() === '') return ''
  const amount = Number(value)
  return Number.isFinite(amount) ? roundToCents(amount).toFixed(2) : value
}

const currencyNumber = (value: string) => roundToCents(Number(value) || 0)

const formatCurrency = (value: number) =>
  `$${roundToCents(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

function FieldHelp({ text }: { text: string }) {
  return (
    <span className="field-help">
      <button
        type="button"
        className="field-help__button"
        aria-label={text}
      >
        ?
      </button>
      <span className="field-help__tooltip" role="tooltip">
        {text}
      </span>
    </span>
  )
}

function IntakeForm() {
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [currentStep, setCurrentStep] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [submittedCaseId, setSubmittedCaseId] = useState('')
  const [sessionUser, setSessionUser] = useState<User | null>(null)
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<SelectedFiles>({
    policeReportFile: null,
    incidentPhotosFile: null,
    medicalSummaryFile: null,
  })
  const [profileEnsuredUserId, setProfileEnsuredUserId] = useState('')
  const [stateCodes, setStateCodes] = useState<StateCode[]>([])
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false)

  const totalSteps = steps.length
  const progress = ((currentStep + 1) / totalSteps) * 100
  const visibleStateCodes = stateCodes.filter((item) => {
    const query = formData.state.trim().toLowerCase()
    if (!query) return true
    return item.code.toLowerCase().startsWith(query) || item.name.toLowerCase().startsWith(query)
  })

  const computedLostWages = useMemo(() => {
    const days = Number(formData.daysMissed) || 0
    const hourlyRate = Number(formData.hourlyRate) || 0
    return roundToCents(days * 8 * hourlyRate)
  }, [formData.daysMissed, formData.hourlyRate])

  useEffect(() => {
    let isMounted = true
    getSession().then((user) => {
      if (isMounted) {
        console.log(user)
        setSessionUser(user)
      }
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
    getStateCodes().then(({ data, error }) => {
      if (!error && data) {
        setStateCodes(data)
      }
    })
  }, [])

  useEffect(() => {
    if (!sessionUser) return
    if (profileEnsuredUserId === sessionUser.id) return

    setFormData((prev) => ({
      ...prev,
      email: prev.email || sessionUser.email,
    }))

    ensureUserProfile({
      userId: sessionUser.id,
      role: 'client',
    }).then(({ error }) => {
      if (error) {
        setAuthError(error)
      } else {
        setProfileEnsuredUserId(sessionUser.id)
      }
    })
  }, [sessionUser, profileEnsuredUserId])

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = event.target as HTMLInputElement;
    const { name, value, type } = target;
    const checked = 'checked' in target ? target.checked : false;
    const nextValue = type === 'checkbox' ? checked : value

    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }))
    setSubmitted(false)
    setSubmitError('')
  }

  const handleCurrencyBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    setFormData((prev) => ({
      ...prev,
      [name]: currencyInputValue(value),
    }))
  }

  const normalizeStateValue = (value) => value.toUpperCase().slice(0, 2)

  const getClosestStateCode = (value) => {
    const upper = normalizeStateValue(value)
    if (!upper) return ''
    const exact = stateCodes.find((item) => item.code === upper)
    if (exact) return exact.code
    const prefixMatch = stateCodes.find((item) => item.code.startsWith(upper))
    if (prefixMatch) return prefixMatch.code
    const nameMatch = stateCodes.find((item) =>
      item.name.toLowerCase().startsWith(value.trim().toLowerCase())
    )
    return nameMatch ? nameMatch.code : upper
  }

  const handleFileChange = (event) => {
    const { name, files } = event.target
    const file = files?.[0] ?? null
    setFormData((prev) => ({
      ...prev,
      [name]: file?.name ?? '',
    }))
    setSelectedFiles((prev) => ({
      ...prev,
      [name]: file,
    }))
    setSubmitted(false)
    setSubmitError('')
  }

  const handleStateChange = (event) => {
    const normalized = normalizeStateValue(event.target.value)
    setFormData((prev) => ({
      ...prev,
      state: normalized,
    }))
    setStateDropdownOpen(true)
    setSubmitted(false)
    setSubmitError('')
  }

  const handleStateBlur = () => {
    const closest = getClosestStateCode(formData.state)
    setFormData((prev) => ({
      ...prev,
      state: closest,
    }))
  }

  const handleStateSelect = (code: string) => {
    setFormData((prev) => ({
      ...prev,
      state: code,
    }))
    setStateDropdownOpen(false)
    setSubmitted(false)
    setSubmitError('')
  }

  const handleIncidentDateKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Backspace' && event.key !== 'Delete') return
    if (!formData.incidentDate) return

    event.preventDefault()
    setFormData((prev) => ({
      ...prev,
      incidentDate: '',
    }))
    setSubmitted(false)
    setSubmitError('')
  }

  const handleAuthModeChange = (mode) => {
    setAuthMode(mode)
    setAuthError('')
    setAuthMessage('')
  }

  const handleAuthAction = async () => {
    const email = formData.email.trim()

    if (!email) {
      setAuthError('Enter your email in the contact section first.')
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
          setAuthError(
            'That email already has an account. Log in or reset your password instead.'
          )
          return
        }

        if (error) {
          setAuthError(error.message)
          return
        }
        console.log(user)
        setAuthMessage(
          session
            ? 'Account created and signed in.'
            : 'Account created! Please confirm via email to finish signing in.'
        )
      } else {
        const { error } = await signInWithPassword(email, authPassword)
        if (error) throw error
        setAuthMessage('Signed in successfully.')
      }
      setAuthPassword('')
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handlePasswordReset = async () => {
    const email = formData.email.trim()

    if (!email) {
      setAuthError('Enter your email in the contact section first.')
      return
    }

    setResetLoading(true)
    setAuthError('')
    setAuthMessage('')

    try {
      const { error } = await resetPasswordForEmail(email)
      if (error) throw error
      setAuthMessage('If an account exists for that email, you will receive a password reset link.')
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setResetLoading(false)
    }
  }

  const handleSignOut = async () => {
    setAuthLoading(true)
    setAuthError('')
    setAuthMessage('')
    const { error } = await signOut()
    if (error) {
      console.log('error signing out', error)
      setAuthError(error.message)
    } else {
      console.log('session user success')
      setSessionUser(null)
      setAuthPassword('')
      setAuthMessage('Signed out. You can switch accounts anytime.')
    }
    setAuthLoading(false)
  }

  const isStepValid = (stepIndex) => {
    switch (stepIndex) {
      case 0:
        return (
          formData.whatHappened.trim() &&
          formData.incidentDate &&
          formData.city.trim() &&
          formData.state.trim()
        )
      case 1:
        return true
      case 2:
        return (
          formData.policeReportFile ||
          formData.incidentPhotosFile ||
          formData.medicalSummaryFile ||
          formData.authorizeDocuments
        )
      case 3:
        return true
      case 4:
        if (!sessionUser) return false
        return Boolean(formData.preferredContact && formData.consentProcess)
      default:
        return true
    }
  }

  const goToStep = (nextStep) => {
    setCurrentStep(nextStep)
    setSubmitted(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (currentStep < totalSteps - 1) {
      goToStep(currentStep + 1)
      return
    }

    if (!sessionUser) {
      setAuthError('Please create an account or log in before submitting.')
      return
    }

    setSubmitting(true)
    setSubmitted(false)
    setSubmitError('')
    setSubmittedCaseId('')

    let createdCaseId = ''
    const uploadedStoragePaths = []

    try {
      await ensureUserProfile({
        userId: sessionUser.id,
        fullName: formData.fullName.trim() || null,
        phone: formData.phone,
        role: 'general',
      })

      const { data: caseData, error: caseError } = await createCase({
        userId: sessionUser.id,
        consentStore: formData.consentProcess,
        consentContact: formData.consentContact,
      })

      if (caseError) throw new Error(caseError)
      createdCaseId = caseData.id

      const incidentPayload = {
        case_id: createdCaseId,
        description: formData.whatHappened.trim(),
        incident_date: formData.incidentDate || null,
        city: formData.city.trim(),
        state_code: formData.state.trim(),
      }

      const damagesPayload = {
        case_id: createdCaseId,
        medical_bills_usd: currencyNumber(formData.medicalBills),
        days_missed: Number(formData.daysMissed) || 0,
        hourly_rate_usd: currencyNumber(formData.hourlyRate),
      }

      const contactPayload = {
        case_id: createdCaseId,
        full_name: formData.fullName.trim() || null,
        method: formData.preferredContact === 'email' ? 'email' : 'phone',
        email: formData.email.trim() || sessionUser.email,
        phone: formData.phone.trim() || null,
      }

      const partyRecords = [
        {
          case_id: createdCaseId,
          role: 'adverse',
          name: formData.adverseParty.trim() || 'Unknown party',
        },
      ]

      if (formData.insurerName.trim()) {
        partyRecords.push({
          case_id: createdCaseId,
          role: 'insurer',
          name: formData.insurerName.trim(),
          insurer_name: formData.insurerName.trim(),
          policy_number: formData.policyNumber.trim() || null,
          claim_number: formData.claimNumber.trim() || null,
        })
      }

      const [incidentError, damagesError, contactError, partiesError] = await Promise.all([
        createIncident(incidentPayload),
        createDamages(damagesPayload),
        createCaseContact(contactPayload),
        createParties(partyRecords),
      ])

      const firstError = incidentError.error || damagesError.error || contactError.error || partiesError.error
      if (firstError) {
        throw new Error(firstError)
      }

      const fileEntries = [
        { field: 'policeReportFile', kind: 'police_report' },
        { field: 'incidentPhotosFile', kind: 'photos' },
        { field: 'medicalSummaryFile', kind: 'er_bill' },
      ].filter((entry) => selectedFiles[entry.field])

      for (const entry of fileEntries) {
        const file = selectedFiles[entry.field]
        const { path, error: storageError } = await uploadFile({
          bucket: 'case-docs',
          file,
          userId: sessionUser.id,
          caseId: createdCaseId,
        })
        if (storageError) throw new Error(storageError)
        uploadedStoragePaths.push(path)

        const { error: docError } = await createDocument({
          case_id: createdCaseId,
          kind: entry.kind,
          original_filename: file.name,
          storage_path: `case-docs/${path}`,
          uploaded_by: sessionUser.id,
        })
        if (docError) throw new Error(docError)
      }

      setSubmitted(true)
      setSubmittedCaseId(createdCaseId)
      setFormData({ ...initialFormData })
      setSelectedFiles({
        policeReportFile: null,
        incidentPhotosFile: null,
        medicalSummaryFile: null,
      })
      setCurrentStep(0)
    } catch (error) {
      setSubmitError(error.message || 'Something went wrong while submitting your intake.')
      setSubmitted(false)
      if (createdCaseId) {
        await deleteCase(createdCaseId)
      }
      if (uploadedStoragePaths.length) {
        await removeFiles('case-docs', uploadedStoragePaths)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const renderIncidentBasics = () => (
    <>
      <label className="field">
        <span>What happened? (1–3 sentences)</span>
        <textarea
          name="whatHappened"
          value={formData.whatHappened}
          onChange={handleChange}
          rows={4}
          placeholder="Briefly describe the incident..."
          required
        />
      </label>

      <label className="field">
        <span>Incident date</span>
        <input
          type="date"
          name="incidentDate"
          value={formData.incidentDate}
          onChange={handleChange}
          onKeyDown={handleIncidentDateKeyDown}
          required
        />
      </label>

      <p className="field-question">Where did the incident happen?</p>

      <div className="field-grid">
        <label className="field">
          <span>City</span>
          <input
            type="text"
            name="city"
            value={formData.city}
            onChange={handleChange}
            placeholder="e.g., Los Angeles"
            required
          />
        </label>
        <label className="field">
          <span>State</span>
          <div className="state-select">
            <input
              type="text"
              name="state"
              value={formData.state}
              onChange={handleStateChange}
              onFocus={() => setStateDropdownOpen(true)}
              onBlur={handleStateBlur}
              placeholder="e.g., CA"
              maxLength={2}
              autoComplete="off"
              aria-expanded={stateDropdownOpen}
              aria-controls="state-options"
              required
            />
            <button
              type="button"
              className="state-select__toggle"
              onClick={() => setStateDropdownOpen((prev) => !prev)}
              aria-label={stateDropdownOpen ? 'Close state dropdown' : 'Open state dropdown'}
            >
              {stateDropdownOpen ? 'x' : '▾'}
            </button>
            {stateDropdownOpen && (
              <div id="state-options" className="state-select__menu" role="listbox">
                {visibleStateCodes.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    className="state-select__option"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      handleStateSelect(item.code)
                    }}
                    role="option"
                    aria-selected={formData.state === item.code}
                  >
                    <span>{item.code}</span>
                    <small>{item.name}</small>
                  </button>
                ))}
                {!visibleStateCodes.length && (
                  <p className="state-select__empty">No matching states</p>
                )}
              </div>
            )}
          </div>
        </label>
      </div>
    </>
  )

  const renderParties = () => (
    <>
      <div className="field">
        <label className="field-label" htmlFor="adverseParty">
          Adverse person or company (optional)
          <FieldHelp text="This is the other driver or business involved in your accident. Fill this out if someone else caused the crash, or leave it blank if you do not have their details." />
        </label>
        <input
          id="adverseParty"
          type="text"
          name="adverseParty"
          value={formData.adverseParty}
          onChange={handleChange}
          placeholder="Name of the opposing party, or leave blank if unknown"
        />
        <small className="field-hint">
          If you do not know who the opposing party is yet, leave this blank.
        </small>
      </div>

      <div className="field-grid">
        <div className="field">
          <label className="field-label" htmlFor="insurerName">
            Insurer name (optional)
            <FieldHelp text="This is the name of the insurance company covering other person/company's vehicle. Enter the other driver's insurance provider here, or leave it blank if they are uninsured or fled the scene." />
          </label>
          <input
            id="insurerName"
            type="text"
            name="insurerName"
            value={formData.insurerName}
            onChange={handleChange}
            placeholder="Carrier name if known"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="policyNumber">
            Policy number (optional)
            <FieldHelp text="The permanent account number on your insurance card that proves you have active coverage." />
          </label>
          <input
            id="policyNumber"
            type="text"
            name="policyNumber"
            value={formData.policyNumber}
            onChange={handleChange}
            placeholder="Policy #"
          />
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="claimNumber">
          Claim number (optional)
          <FieldHelp text="The unique tracking number assigned after you report a specific accident." />
        </label>
        <input
          id="claimNumber"
          type="text"
          name="claimNumber"
          value={formData.claimNumber}
          onChange={handleChange}
          placeholder="Claim # if assigned"
        />
      </div>
    </>
  )

  const renderDocuments = () => (
    <>
      <label className="field">
        <span>Police or incident report</span>
        <input
          type="file"
          name="policeReportFile"
          onChange={handleFileChange}
          accept=".pdf,.jpg,.jpeg,.png"
        />
        <small className="file-name">
          {formData.policeReportFile || 'No file selected yet'}
        </small>
      </label>

      <label className="field">
        <span>Photos (zip or image)</span>
        <input
          type="file"
          name="incidentPhotosFile"
          onChange={handleFileChange}
          accept=".zip,.pdf,.jpg,.jpeg,.png"
        />
        <small className="file-name">
          {formData.incidentPhotosFile || 'No file selected yet'}
        </small>
      </label>

      <label className="field">
        <span>ER bill or visit summary</span>
        <input
          type="file"
          name="medicalSummaryFile"
          onChange={handleFileChange}
          accept=".pdf,.jpg,.jpeg,.png"
        />
        <small className="file-name">
          {formData.medicalSummaryFile || 'No file selected yet'}
        </small>
      </label>

      <label className="checkbox-field">
        <input
          type="checkbox"
          name="authorizeDocuments"
          checked={formData.authorizeDocuments}
          onChange={handleChange}
        />
        <span>
          I authorize the legal team to retrieve reports directly if needed.
        </span>
      </label>
    </>
  )

  const renderDamages = () => (
    <>
      <label className="field">
        <span>Medical bills to date (USD, optional)</span>
        <input
          type="number"
          name="medicalBills"
          value={formData.medicalBills}
          onChange={handleChange}
          onBlur={handleCurrencyBlur}
          min="0"
          step="0.01"
          placeholder="e.g., 1500"
        />
      </label>

      <div className="field-grid">
        <label className="field">
          <span>Days missed from work</span>
          <input
            type="number"
            name="daysMissed"
            value={formData.daysMissed}
            onChange={handleChange}
            min="0"
            placeholder="0 if none"
          />
        </label>
        <label className="field">
          <span>Hourly rate (USD)</span>
          <input
            type="number"
            name="hourlyRate"
            value={formData.hourlyRate}
            onChange={handleChange}
            onBlur={handleCurrencyBlur}
            min="0"
            step="0.01"
            placeholder="Your approximate hourly rate"
          />
        </label>
      </div>

      <label className="field">
        <span>Rough lost wages (auto-calculated)</span>
        <input
          type="text"
          value={formatCurrency(computedLostWages)}
          readOnly
        />
      </label>
    </>
  )

  const renderContact = () => (
    <>
      <label className="field">
        <span>Full name</span>
        <input
          type="text"
          name="fullName"
          value={formData.fullName}
          onChange={handleChange}
          placeholder={sessionUser ? 'Optional when signed in' : 'Your legal name'}
          required={!sessionUser}
        />
      </label>

      <div className="field-grid">
        <label className="field">
          <span>Preferred contact method</span>
          <select
            name="preferredContact"
            value={formData.preferredContact}
            onChange={handleChange}
          >
            <option value="email">Email</option>
            <option value="phone">Phone call</option>
            <option value="text">Text message</option>
          </select>
        </label>
        <label className="field">
          <span>Phone (optional)</span>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            placeholder="(555) 123-4567"
          />
        </label>
      </div>

      <label className="field">
        <span>Email</span>
        <input
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          placeholder={sessionUser?.email || 'you@email.com'}
          required={!sessionUser}
        />
      </label>

      <label className="checkbox-field">
        <input
          type="checkbox"
          name="consentProcess"
          checked={formData.consentProcess}
          onChange={handleChange}
          required
        />
        <span>
          I consent to True Legal storing and processing my information for this review.
        </span>
      </label>

      <label className="checkbox-field">
        <input
          type="checkbox"
          name="consentContact"
          checked={formData.consentContact}
          onChange={handleChange}
        />
        <span>Okay to contact me for additional questions or case review.</span>
      </label>

      <div className="auth-section">
        <div className="auth-head">
          <h2>Account</h2>
          <p>
            {sessionUser
              ? 'You are signed in and ready to submit.'
              : 'Create an account or sign in so we can associate this intake with you.'}
          </p>
        </div>

        {sessionUser ? (
          <div className="auth-status">
            <div>
              <p className="helper-text">Signed in as</p>
              <p className="auth-email">{sessionUser.email}</p>
            </div>
            <button type="button" className="secondary slim" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        ) : (
          <>
            <div className="auth-toggle">
              <button
                type="button"
                className={`chip ${authMode === 'signup' ? 'chip--active' : ''}`}
                onClick={() => handleAuthModeChange('signup')}
              >
                Create account
              </button>
              <button
                type="button"
                className={`chip ${authMode === 'login' ? 'chip--active' : ''}`}
                onClick={() => handleAuthModeChange('login')}
              >
                Log in
              </button>
            </div>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                name="authPassword"
                value={authPassword}
                onChange={(event) => {
                  setAuthPassword(event.target.value)
                  setAuthError('')
                  setAuthMessage('')
                }}
                placeholder="At least 6 characters"
                minLength={6}
              />
            </label>

            <p className="helper-text">
              Account email:{' '}
              {formData.email ? <strong>{formData.email}</strong> : 'Enter your email above first'}
            </p>

            {authMode === 'login' && (
              <button
                type="button"
                className="link-button"
                onClick={handlePasswordReset}
                disabled={resetLoading}
              >
                {resetLoading ? 'Sending reset link...' : 'Forgot password? Email me a reset link'}
              </button>
            )}

            <button
              type="button"
              className="accent"
              onClick={handleAuthAction}
              disabled={authLoading}
            >
              {authLoading ? 'Saving...' : authMode === 'signup' ? 'Create account' : 'Log in'}
            </button>

            {authError && <p className="error">{authError}</p>}
            {authMessage && !authError && <p className="notice">{authMessage}</p>}
          </>
        )}
      </div>
    </>
  )

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return renderIncidentBasics()
      case 1:
        return renderParties()
      case 2:
        return renderDocuments()
      case 3:
        return renderDamages()
      case 4:
        return renderContact()
      default:
        return null
    }
  }

  const isLastStep = currentStep === totalSteps - 1
  const nextLabel = submitting ? 'Saving...' : isLastStep ? 'Submit intake' : 'Next section'

  if (submitted) {
    return (
      <main className="page">
        <section className="card intake-card intake-thank-you">
          <div className="thank-you-mark">✓</div>
          <p className="eyebrow">Intake submitted</p>
          <h1>Thank you for trusting us with your case.</h1>
          <p className="lead">
            We know this may be a stressful moment. Your intake has been submitted successfully. We’re committed to helping you pursue the compensation you may be entitled to. Visit your dashboard to review your submitted case, add more details or documents,
              and view future offers from law firms interested in helping you.
          </p>

          <Link className="btn accent thank-you-action" to="/dashboard">
            Go to dashboard
            <ArrowRight aria-hidden="true" size={18} strokeWidth={2.4} />
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="card intake-card">
        <header>
          <p className="eyebrow">
            Step {currentStep + 1} of {totalSteps} · {steps[currentStep].name}
          </p>
          <h1>{steps[currentStep].title}</h1>
          <p className="lead">{steps[currentStep].description}</p>
          <div className="progress-wrap">
            <p className="progress-subtitle">
              {Math.round(progress)}% complete
            </p>
            <div className="progress">
              <div className="progress__fill" style={{ width: `${progress}%` }} aria-hidden="true" />
            </div>
          </div>
        </header>

        <form className="form" onSubmit={handleSubmit}>
          {renderStepContent()}

          <footer className="nav">
            <button
              type="button"
              className="secondary"
              onClick={() => goToStep(currentStep - 1)}
              disabled={currentStep === 0 || submitting}
            >
              Back
            </button>
            <button type="submit" disabled={!isStepValid(currentStep) || submitting}>
              {nextLabel}
            </button>
          </footer>

          {submitError && <p className="error">{submitError}</p>}
        </form>
      </section>
    </main>
  )
}

export default IntakeForm

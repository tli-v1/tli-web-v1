import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  FileText,
  HeartPulse,
  MapPin,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { getSession, onAuthStateChange } from '../../api/auth'
import {
  getCaseDetails,
  updateCaseDetails,
  type CaseEditPayload,
} from '../../api/cases'
import { createDocument } from '../../api/intake'
import { getStateCodes, type StateCode } from '../../api/stateCodes'
import {
  ACCEPTED_CASE_FILE_TYPES,
  validateCaseFiles,
} from '../../storage/fileValidation'
import { uploadFile, createSignedUrl, removeFiles } from '../../storage/fileUpload'
import { normalizeStoragePath } from '../../storage/paths'
import { formatDisplayDate } from '../../utils/formatDate'
import './CaseDetails.css'

type CaseEditSection = 'all' | 'overview' | 'damages' | 'parties' | 'contact' | 'documents'
type ExpandableCaseSection = 'overview' | 'damages' | 'agreements'
type CollectionView = 'parties' | 'documents'

const editSectionLabels: Record<CaseEditSection, string> = {
  all: 'all case details',
  overview: 'case overview',
  damages: 'damages and expenses',
  parties: 'people and organizations',
  contact: 'primary contact',
  documents: 'case file details',
}

const formatCurrency = (value) => {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return 'Not provided'
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const documentKind = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase()
  return ['png', 'jpg', 'jpeg', 'heic', 'heif'].includes(extension || '')
    ? 'photos'
    : 'other'
}

interface PendingEditFile {
  file: File
  kind: string
  notes: string
}

function CaseDetails() {
  const { caseId } = useParams()
  const [sessionUser, setSessionUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [caseSummary, setCaseSummary] = useState(null)
  const [incident, setIncident] = useState(null)
  const [caseInfo, setCaseInfo] = useState(null)
  const [damages, setDamages] = useState(null)
  const [contact, setContact] = useState(null)
  const [parties, setParties] = useState([])
  const [documents, setDocuments] = useState([])
  const [agreements, setAgreements] = useState([])
  const [viewingDocId, setViewingDocId] = useState('')
  const [viewingAgreementId, setViewingAgreementId] = useState('')
  const [viewError, setViewError] = useState('')
  const [editDraft, setEditDraft] = useState<CaseEditPayload | null>(null)
  const [editSection, setEditSection] = useState<CaseEditSection | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [pendingEditFiles, setPendingEditFiles] = useState<PendingEditFile[]>([])
  const [deletedDocumentPaths, setDeletedDocumentPaths] = useState<string[]>([])
  const [collectionView, setCollectionView] = useState<CollectionView | null>(null)
  const [stateCodes, setStateCodes] = useState<StateCode[]>([])
  const [expandedSections, setExpandedSections] = useState<
    Partial<Record<ExpandableCaseSection, boolean>>
  >({})
  const editPanelRef = useRef<HTMLFormElement>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)

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

  const fetchDetails = useCallback(async () => {
    if (!sessionUser || !caseId) return
    setLoading(true)
    setError('')
    try {
      const { data, error } = await getCaseDetails(caseId)
      if (error) throw new Error(error)
      if (!data) throw new Error('Unable to load case details.')
      setCaseSummary(data.summary)
      setCaseInfo(data.caseInfo)
      setIncident(data.incident)
      setDamages(data.damages)
      setContact(data.contact)
      setParties(data.parties || [])
      setDocuments(data.documents || [])
      const normalizedAgreements =
        data.agreements?.map((item) => {
          const file = Array.isArray(item.lawyer_client_agreement_file)
            ? item.lawyer_client_agreement_file[0]
            : item.lawyer_client_agreement_file
          return { ...item, file }
        }) || []
      setAgreements(normalizedAgreements)
    } catch (err) {
      setError(err.message || 'Unable to load case details.')
    } finally {
      setLoading(false)
    }
  }, [sessionUser, caseId])

  useEffect(() => {
    fetchDetails()
  }, [fetchDetails])

  useEffect(() => {
    getStateCodes().then(({ data }) => {
      setStateCodes(data || [])
    })
  }, [])

  useEffect(() => {
    if (!collectionView) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCollectionView(null)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [collectionView])

  const handleViewDocument = async (doc) => {
    setViewingDocId(doc.id)
    setViewError('')
    try {
      const { bucket, path: relativePath } = normalizeStoragePath(doc.storage_path, 'case-docs')
      if (!relativePath) throw new Error('Missing storage path.')
      const { url, error } = await createSignedUrl(bucket, relativePath, 60)
      if (error) throw new Error(error)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setViewError(err.message || 'Unable to open file.')
    } finally {
      setViewingDocId('')
    }
  }

  const handleViewAgreement = async (agreement) => {
    const file = agreement?.file
    if (!file) {
      setViewError('No agreement file available.')
      return
    }
    setViewingAgreementId(agreement.id)
    setViewError('')
    try {
      const { bucket, path } = normalizeStoragePath(file.storage_path, 'agreements')

      if (!path) throw new Error('Missing file path.')
      const { url, error } = await createSignedUrl(bucket, path, 60)
      if (error) throw new Error(error)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setViewError(err.message || 'Unable to open agreement file.')
    } finally {
      setViewingAgreementId('')
    }
  }

  useEffect(() => {
    if (!editSection) return
    window.requestAnimationFrame(() => {
      editPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [editSection])

  const beginEditing = (section: CaseEditSection = 'all') => {
    if (!caseId || !caseSummary || !incident?.id) {
      setSaveError('This case does not have an editable incident record.')
      return
    }

    setSaveError('')
    setPendingEditFiles([])
    setDeletedDocumentPaths([])
    setEditSection(section)
    setEditDraft({
      caseId,
      status: caseSummary.status || 'pending',
      consentStore: Boolean(caseInfo?.consent_store),
      consentContact: Boolean(caseInfo?.consent_contact),
      incident: {
        id: incident.id,
        description: incident.description || '',
        incidentDate: incident.incident_date || '',
        city: incident.city || '',
        stateCode: incident.state_code || '',
        locationDetails: incident.location_details || '',
      },
      damages: {
        injuries: damages?.injuries || '',
        treatment: damages?.treatment || '',
        medicalBillsUsd: valueForInput(damages?.medical_bills_usd),
        propertyDamageUsd: valueForInput(damages?.property_damage_usd),
        otherExpensesUsd: valueForInput(damages?.other_expenses_usd),
        daysMissed: valueForInput(damages?.days_missed),
        hourlyRateUsd: valueForInput(damages?.hourly_rate_usd),
        lostWagesUsd: valueForInput(damages?.lost_wages_usd),
        emotionalImpact: damages?.emotional_impact || '',
        otherDamages: damages?.other_damages || '',
        details: damages?.details || '',
      },
      contact: {
        fullName: contact?.full_name || '',
        method: contact?.method || 'email',
        email: contact?.email || '',
        phone: contact?.phone || '',
      },
      parties: parties
        .filter((party) => party.id)
        .map((party) => ({
          id: party.id,
          role: party.role || 'defendant',
          name: party.name || '',
          insurerName: party.insurer_name || '',
          policyNumber: party.policy_number || '',
          claimNumber: party.claim_number || '',
        })),
      documents: documents
        .filter((document) => document.id)
        .map((document) => ({
          id: document.id,
          kind: document.kind || 'other',
          originalFilename: document.original_filename || '',
          notes: document.notes || '',
        })),
      deletedPartyIds: [],
      deletedDocumentIds: [],
    })
  }

  const beginFileUpload = () => {
    setViewError('')
    if (editSection !== 'all' && editSection !== 'documents') {
      beginEditing('documents')
    }
    window.requestAnimationFrame(() => editFileInputRef.current?.click())
  }

  const cancelEditing = () => {
    setEditDraft(null)
    setEditSection(null)
    setSaveError('')
    setPendingEditFiles([])
    setDeletedDocumentPaths([])
  }

  const addParty = () => {
    if (!editDraft) return
    setEditDraft({
      ...editDraft,
      parties: [
        ...editDraft.parties,
        {
          id: `new:${crypto.randomUUID()}`,
          role: 'defendant',
          name: '',
          insurerName: '',
          policyNumber: '',
          claimNumber: '',
        },
      ],
    })
  }

  const removeParty = (partyId: string) => {
    if (!editDraft) return
    setEditDraft({
      ...editDraft,
      parties: editDraft.parties.filter((party) => party.id !== partyId),
      deletedPartyIds: partyId.startsWith('new:')
        ? editDraft.deletedPartyIds
        : [...editDraft.deletedPartyIds, partyId],
    })
  }

  const removeDocument = (documentId: string) => {
    if (!editDraft) return
    const document = documents.find((item) => item.id === documentId)
    if (document?.storage_path) {
      setDeletedDocumentPaths((current) => [...current, document.storage_path])
    }
    setEditDraft({
      ...editDraft,
      documents: editDraft.documents.filter((item) => item.id !== documentId),
      deletedDocumentIds: [...editDraft.deletedDocumentIds, documentId],
    })
  }

  const handleEditFilesSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    if (selectedFiles.length === 0) return

    const existingKeys = new Set(pendingEditFiles.map((item) => fileKey(item.file)))
    const nextFiles = [
      ...pendingEditFiles,
      ...selectedFiles
        .filter((file) => !existingKeys.has(fileKey(file)))
        .map((file) => ({
          file,
          kind: documentKind(file.name),
          notes: '',
        })),
    ]

    try {
      await validateCaseFiles(nextFiles.map((item) => item.file))
      setPendingEditFiles(nextFiles)
      setSaveError('')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to add those files.')
    }
  }

  const updatePendingEditFile = (
    key: string,
    changes: Partial<Pick<PendingEditFile, 'kind' | 'notes'>>,
  ) => {
    setPendingEditFiles((current) => current.map((item) =>
      fileKey(item.file) === key ? { ...item, ...changes } : item,
    ))
  }

  const removePendingEditFile = (key: string) => {
    setPendingEditFiles((current) =>
      current.filter((item) => fileKey(item.file) !== key),
    )
  }

  const toggleExpanded = (section: ExpandableCaseSection) => {
    setExpandedSections((current) => ({
      ...current,
      [section]: !current[section],
    }))
  }

  const saveEdits = async (event) => {
    event.preventDefault()
    if (!editDraft || !sessionUser || !caseId) return

    setIsSaving(true)
    setSaveError('')
    try {
      for (const pendingFile of pendingEditFiles) {
        const { file } = pendingFile
        const { path, error: storageError } = await uploadFile({
          bucket: 'case-docs',
          file,
          userId: sessionUser.id,
          caseId,
        })
        if (storageError || !path) {
          throw new Error(storageError || `Unable to upload ${file.name}.`)
        }

        const { error: documentError } = await createDocument({
          case_id: caseId,
          kind: pendingFile.kind,
          original_filename: file.name,
          storage_path: `case-docs/${path}`,
          uploaded_by: sessionUser.id,
          notes: pendingFile.notes,
        })
        if (documentError) {
          await removeFiles('case-docs', [path])
          throw new Error(documentError)
        }

        setPendingEditFiles((current) =>
          current.filter((item) => fileKey(item.file) !== fileKey(file)),
        )
      }

      const { error: updateError } = await updateCaseDetails(editDraft)
      if (updateError) throw new Error(updateError)

      const storageCleanupResults = await Promise.all(
        deletedDocumentPaths.map((storagePath) => {
          const { bucket, path } = normalizeStoragePath(storagePath, 'case-docs')
          return path ? removeFiles(bucket, [path]) : Promise.resolve({ error: null })
        }),
      )
      if (storageCleanupResults.some((result) => result.error)) {
        setViewError('The file entry was deleted, but its stored upload could not be cleaned up.')
      }

      await fetchDetails()
      setEditDraft(null)
      setEditSection(null)
      setPendingEditFiles([])
      setDeletedDocumentPaths([])
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save case changes.')
    } finally {
      setIsSaving(false)
    }
  }

  if (checkingSession) {
    return (
      <main className="dashboard">
        <section className="card dashboard-card">
          <p className="helper-text">Loading...</p>
        </section>
      </main>
    )
  }

  if (!sessionUser) {
    return <Navigate to="/dashboard" replace />
  }

  const cityAndState = [caseSummary?.city, caseSummary?.state].filter(Boolean).join(', ')
  const location = incident?.location_details || cityAndState
  const medicalBills = Number(damages?.medical_bills_usd) || 0
  const propertyDamage = Number(damages?.property_damage_usd) || 0
  const otherExpenses = Number(damages?.other_expenses_usd) || 0
  const lostWages = Number(damages?.lost_wages_usd) || 0
  const knownDamages = medicalBills + propertyDamage + otherExpenses + lostWages
  const overviewText =
    incident?.description
    || caseSummary?.description
    || 'No incident description was recorded.'
  const overviewCanExpand = overviewText.length > 280
  const damageDetailItems = [
    ['Injuries', damages?.injuries],
    ['Treatment', damages?.treatment],
    ['Emotional impact', damages?.emotional_impact],
    ['Other losses', damages?.other_damages],
    ['Additional details', damages?.details],
  ].filter((item): item is [string, string] => Boolean(item[1]))
  const damageDetailsCanExpand =
    damageDetailItems.length > 2
    || damageDetailItems.some(([, value]) => value.length > 180)
  const visibleDamageDetails = expandedSections.damages
    ? damageDetailItems
    : damageDetailItems.slice(0, 2)
  const visibleParties = parties.slice(0, 1)
  const visibleDocuments = documents.slice(0, 1)
  const visibleAgreements = expandedSections.agreements ? agreements : agreements.slice(0, 3)

  return (
    <main className="dashboard case-detail-page">
      <section className="case-detail-shell">
        <nav className="case-detail-nav" aria-label="Case navigation">
          <Link to="/dashboard" className="case-detail-back">
            <ArrowLeft aria-hidden="true" />
            All cases
          </Link>
          {caseSummary && (
            <div className="case-detail-nav__actions">
              <span className={`case-status case-status--${caseSummary.status.toLowerCase()}`}>
                <i aria-hidden="true" />
                {caseSummary.status}
              </span>
              <button
                type="button"
                className="case-edit-toggle"
                onClick={() => editDraft ? cancelEditing() : beginEditing('all')}
                disabled={isSaving}
              >
                {editDraft ? <X aria-hidden="true" /> : <Pencil aria-hidden="true" />}
                {editDraft ? 'Cancel editing' : 'Edit all details'}
              </button>
            </div>
          )}
        </nav>

        {loading && <p className="helper-text">Loading case details…</p>}
        {error && <p className="error">{error}</p>}
        {saveError && !editDraft && <p className="error">{saveError}</p>}

        {!loading && !error && caseSummary && (
          <>
            <header className="case-hero">
              <div className="case-hero__copy">
                <p className="case-eyebrow">Case workspace</p>
                <h1>{location || 'Submitted case'}</h1>
                <p>
                  Submitted {formatDisplayDate(caseSummary.created_at)} · Case #
                  {caseSummary.case_id.slice(0, 8).toUpperCase()}
                </p>
              </div>
              <div className="case-hero__metrics">
                <div>
                  <span>Known financial impact</span>
                  <strong>{formatCurrency(knownDamages)}</strong>
                </div>
                <div>
                  <span>Incident date</span>
                  <strong>{formatDisplayDate(caseSummary.incident_date)}</strong>
                </div>
                <div>
                  <span>Files</span>
                  <strong>{documents.length}</strong>
                </div>
              </div>
            </header>

            {editDraft && (
              <form ref={editPanelRef} className="case-edit-panel" onSubmit={saveEdits}>
                <div className="case-edit-panel__heading">
                  <div>
                    <p className="case-eyebrow">Edit intake</p>
                    <h2>Editing {editSectionLabels[editSection || 'all']}</h2>
                  </div>
                  <div className="case-edit-actions">
                    <button
                      type="button"
                      className="btn secondary slim"
                      onClick={cancelEditing}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn accent slim case-save-button"
                      disabled={isSaving}
                    >
                      <Save aria-hidden="true" />
                      {isSaving ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </div>

                {(editSection === 'all' || editSection === 'overview') && <fieldset>
                  <legend>Case and incident</legend>
                  <div className="case-edit-grid">
                    <label>
                      <span>Status</span>
                      <select
                        value={editDraft.status}
                        onChange={(event) => setEditDraft({
                          ...editDraft,
                          status: event.target.value,
                        })}
                      >
                        <option value="PENDING">Pending</option>
                        <option value="OPEN">Open</option>
                        <option value="CLOSED">Closed</option>
                      </select>
                    </label>
                    <label>
                      <span>Incident date</span>
                      <input
                        type="date"
                        required
                        value={editDraft.incident.incidentDate}
                        onChange={(event) => setEditDraft({
                          ...editDraft,
                          incident: { ...editDraft.incident, incidentDate: event.target.value },
                        })}
                      />
                    </label>
                    <label>
                      <span>City</span>
                      <input
                        value={editDraft.incident.city}
                        onChange={(event) => setEditDraft({
                          ...editDraft,
                          incident: { ...editDraft.incident, city: event.target.value },
                        })}
                      />
                    </label>
                    <label>
                      <span>State code</span>
                      <select
                        value={editDraft.incident.stateCode}
                        onChange={(event) => setEditDraft({
                          ...editDraft,
                          incident: {
                            ...editDraft.incident,
                            stateCode: event.target.value,
                          },
                        })}
                      >
                        <option value="">Not provided</option>
                        {stateCodes.map((state) => (
                          <option key={state.code} value={state.code}>
                            {state.name} ({state.code})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="case-edit-grid__wide">
                      <span>Complete location</span>
                      <input
                        value={editDraft.incident.locationDetails}
                        placeholder="Street, intersection, building, landmark, or nearby place"
                        onChange={(event) => setEditDraft({
                          ...editDraft,
                          incident: {
                            ...editDraft.incident,
                            locationDetails: event.target.value,
                          },
                        })}
                      />
                    </label>
                    <label className="case-edit-grid__wide">
                      <span>What happened</span>
                      <textarea
                        rows={5}
                        required
                        value={editDraft.incident.description}
                        onChange={(event) => setEditDraft({
                          ...editDraft,
                          incident: { ...editDraft.incident, description: event.target.value },
                        })}
                      />
                    </label>
                    <label className="case-edit-check">
                      <input
                        type="checkbox"
                        checked={editDraft.consentStore}
                        onChange={(event) => setEditDraft({
                          ...editDraft,
                          consentStore: event.target.checked,
                        })}
                      />
                      <span>Consent to securely store case information</span>
                    </label>
                    <label className="case-edit-check">
                      <input
                        type="checkbox"
                        checked={editDraft.consentContact}
                        onChange={(event) => setEditDraft({
                          ...editDraft,
                          consentContact: event.target.checked,
                        })}
                      />
                      <span>Consent to be contacted</span>
                    </label>
                  </div>
                </fieldset>}

                {(editSection === 'all' || editSection === 'damages') && <fieldset>
                  <legend>Damages and expenses</legend>
                  <div className="case-edit-grid">
                    {[
                      ['medicalBillsUsd', 'Medical bills'],
                      ['propertyDamageUsd', 'Property damage'],
                      ['otherExpensesUsd', 'Other out-of-pocket expenses'],
                      ['daysMissed', 'Work days missed'],
                      ['hourlyRateUsd', 'Hourly rate'],
                      ['lostWagesUsd', 'Lost wages'],
                    ].map(([field, label]) => (
                      <label key={field}>
                        <span>{label}</span>
                        <input
                          type="number"
                          min="0"
                          step={field === 'daysMissed' ? '1' : '0.01'}
                          value={editDraft.damages[field]}
                          onChange={(event) => setEditDraft({
                            ...editDraft,
                            damages: {
                              ...editDraft.damages,
                              [field]: event.target.value,
                            },
                          })}
                        />
                      </label>
                    ))}
                    {[
                      ['injuries', 'Injuries'],
                      ['treatment', 'Treatment'],
                      ['emotionalImpact', 'Emotional impact'],
                      ['otherDamages', 'Other losses or damages'],
                      ['details', 'Complete impact details'],
                    ].map(([field, label]) => (
                      <label className="case-edit-grid__wide" key={field}>
                        <span>{label}</span>
                        <textarea
                          rows={field === 'details' ? 4 : 2}
                          value={editDraft.damages[field]}
                          onChange={(event) => setEditDraft({
                            ...editDraft,
                            damages: {
                              ...editDraft.damages,
                              [field]: event.target.value,
                            },
                          })}
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>}

                {(editSection === 'all' || editSection === 'contact') && <fieldset>
                  <legend>Primary contact</legend>
                  <div className="case-edit-grid">
                    <label>
                      <span>Full name</span>
                      <input
                        value={editDraft.contact.fullName}
                        onChange={(event) => setEditDraft({
                          ...editDraft,
                          contact: { ...editDraft.contact, fullName: event.target.value },
                        })}
                      />
                    </label>
                    <label>
                      <span>Email</span>
                      <input
                        type="email"
                        value={editDraft.contact.email}
                        onChange={(event) => setEditDraft({
                          ...editDraft,
                          contact: { ...editDraft.contact, email: event.target.value },
                        })}
                      />
                    </label>
                    <label>
                      <span>Phone</span>
                      <input
                        type="tel"
                        value={editDraft.contact.phone}
                        onChange={(event) => setEditDraft({
                          ...editDraft,
                          contact: { ...editDraft.contact, phone: event.target.value },
                        })}
                      />
                    </label>
                    <label>
                      <span>Preferred contact</span>
                      <select
                        value={editDraft.contact.method}
                        onChange={(event) => setEditDraft({
                          ...editDraft,
                          contact: { ...editDraft.contact, method: event.target.value },
                        })}
                      >
                        <option value="email">Email</option>
                        <option value="phone">Phone</option>
                        <option value="text">Text</option>
                      </select>
                    </label>
                  </div>
                </fieldset>}

                {(editSection === 'all' || editSection === 'parties') && (
                  <fieldset>
                    <legend>People and organizations</legend>
                    {editDraft.parties.length === 0 && (
                      <p className="case-edit-empty">No parties added yet.</p>
                    )}
                    <div className="case-edit-collection">
                      {editDraft.parties.map((party, partyIndex) => (
                        <div className="case-edit-item" key={party.id}>
                          <div className="case-edit-item__actions">
                            {party.id.startsWith('new:') ? (
                              <span className="case-edit-new-label">New party</span>
                            ) : <span />}
                            <button
                              type="button"
                              className="case-edit-remove"
                              onClick={() => removeParty(party.id)}
                              aria-label={`${party.id.startsWith('new:') ? 'Remove' : 'Delete'} ${party.name || 'party'}`}
                            >
                              <Trash2 aria-hidden="true" />
                              {party.id.startsWith('new:') ? 'Remove' : 'Delete'}
                            </button>
                          </div>
                          <div className="case-edit-grid">
                            <label>
                              <span>Role</span>
                              <select
                                value={party.role}
                                onChange={(event) => setEditDraft({
                                  ...editDraft,
                                  parties: editDraft.parties.map((item, index) =>
                                    index === partyIndex
                                      ? { ...item, role: event.target.value }
                                      : item),
                                })}
                              >
                                <option value="plaintiff">Plaintiff</option>
                                <option value="defendant">Adverse party</option>
                                <option value="insurer">Insurer</option>
                                <option value="witness">Witness</option>
                              </select>
                            </label>
                            {[
                              ['name', 'Name'],
                              ['insurerName', 'Insurer'],
                              ['policyNumber', 'Policy number'],
                              ['claimNumber', 'Claim number'],
                            ].map(([field, label]) => (
                              <label key={field}>
                                <span>{label}</span>
                                <input
                                  required={field === 'name'}
                                  value={party[field]}
                                  onChange={(event) => setEditDraft({
                                    ...editDraft,
                                    parties: editDraft.parties.map((item, index) =>
                                      index === partyIndex
                                        ? { ...item, [field]: event.target.value }
                                        : item),
                                  })}
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="case-edit-toolbar case-edit-toolbar--after">
                      <button type="button" className="case-edit-add" onClick={addParty}>
                        <Plus aria-hidden="true" />
                        Add party
                      </button>
                    </div>
                  </fieldset>
                )}

                {(editSection === 'all' || editSection === 'documents') && (
                  <fieldset>
                    <legend>Case file details</legend>
                    {editDraft.documents.length === 0 && pendingEditFiles.length === 0 && (
                      <p className="case-edit-empty">No case files added yet.</p>
                    )}
                    <div className="case-edit-collection">
                      {editDraft.documents.map((document, documentIndex) => (
                        <div className="case-edit-item" key={document.id}>
                          <div className="case-edit-item__actions">
                            <span />
                            <button
                              type="button"
                              className="case-edit-remove"
                              onClick={() => removeDocument(document.id)}
                              aria-label={`Delete ${document.originalFilename || 'case file'}`}
                            >
                              <Trash2 aria-hidden="true" />
                              Delete
                            </button>
                          </div>
                          <div className="case-edit-grid">
                            <label>
                              <span>File name</span>
                              <input
                                value={document.originalFilename}
                                onChange={(event) => setEditDraft({
                                  ...editDraft,
                                  documents: editDraft.documents.map((item, index) =>
                                    index === documentIndex
                                      ? { ...item, originalFilename: event.target.value }
                                      : item),
                                })}
                              />
                            </label>
                            <label>
                              <span>File type</span>
                              <select
                                value={document.kind}
                                onChange={(event) => setEditDraft({
                                  ...editDraft,
                                  documents: editDraft.documents.map((item, index) =>
                                    index === documentIndex
                                      ? { ...item, kind: event.target.value }
                                      : item),
                                })}
                              >
                                <option value="other">Other</option>
                                <option value="police_report">Police report</option>
                                <option value="er_bill">Medical bill</option>
                                <option value="photos">Photo</option>
                              </select>
                            </label>
                            <label className="case-edit-grid__wide">
                              <span>Notes</span>
                              <textarea
                                rows={2}
                                value={document.notes}
                                onChange={(event) => setEditDraft({
                                  ...editDraft,
                                  documents: editDraft.documents.map((item, index) =>
                                    index === documentIndex
                                      ? { ...item, notes: event.target.value }
                                      : item),
                                })}
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                      {pendingEditFiles.map((pendingFile) => {
                        const key = fileKey(pendingFile.file)
                        return (
                        <div className="case-edit-pending-file" key={key}>
                          <span className="case-edit-new-label">New case file</span>
                          <div className="case-edit-pending-file__heading">
                            <div>
                              <strong>{pendingFile.file.name}</strong>
                              <span>
                                {formatFileSize(pendingFile.file.size)} · Ready to upload
                              </span>
                            </div>
                            <button
                              type="button"
                              className="case-edit-remove"
                              onClick={() => removePendingEditFile(key)}
                              aria-label={`Remove ${pendingFile.file.name}`}
                            >
                              <Trash2 aria-hidden="true" />
                              Remove
                            </button>
                          </div>
                          <div className="case-edit-grid">
                            <label>
                              <span>File type</span>
                              <select
                                value={pendingFile.kind}
                                onChange={(event) => updatePendingEditFile(key, {
                                  kind: event.target.value,
                                })}
                              >
                                <option value="other">Other</option>
                                <option value="police_report">Police report</option>
                                <option value="er_bill">Medical bill</option>
                                <option value="photos">Photo</option>
                              </select>
                            </label>
                            <label className="case-edit-grid__wide">
                              <span>Notes</span>
                              <textarea
                                rows={2}
                                value={pendingFile.notes}
                                placeholder="Add a description or context for this file"
                                onChange={(event) => updatePendingEditFile(key, {
                                  notes: event.target.value,
                                })}
                              />
                            </label>
                          </div>
                        </div>
                      )})}
                    </div>
                    <div className="case-edit-toolbar case-edit-toolbar--after">
                      <input
                        ref={editFileInputRef}
                        className="case-edit-file-input"
                        type="file"
                        multiple
                        accept={ACCEPTED_CASE_FILE_TYPES}
                        onChange={handleEditFilesSelected}
                      />
                      <button
                        type="button"
                        className="case-edit-add"
                        onClick={() => editFileInputRef.current?.click()}
                      >
                        <Upload aria-hidden="true" />
                        Add case file
                      </button>
                    </div>
                  </fieldset>
                )}

                {(editDraft.deletedPartyIds.length > 0
                  || editDraft.deletedDocumentIds.length > 0) && (
                  <p className="case-edit-delete-notice">
                    <Trash2 aria-hidden="true" />
                    {editDraft.deletedPartyIds.length + editDraft.deletedDocumentIds.length}
                    {' '}
                    {editDraft.deletedPartyIds.length + editDraft.deletedDocumentIds.length === 1
                      ? 'entry will'
                      : 'entries will'}
                    {' '}be permanently deleted when you save.
                  </p>
                )}
                {saveError && <p className="error">{saveError}</p>}
                <div className="case-edit-footer">
                  <span>Editing {editSectionLabels[editSection || 'all']}</span>
                  <button
                    type="submit"
                    className="btn accent slim case-save-button"
                    disabled={isSaving}
                  >
                    <Save aria-hidden="true" />
                    {isSaving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </form>
            )}

            <div className="case-content-grid">
              <div className="case-content-main">
                <section className="case-panel case-overview">
                  <div className="case-panel__heading case-panel__heading--action">
                    <div className="case-panel__heading-copy">
                      <div className="case-panel__icon"><FileText aria-hidden="true" /></div>
                      <div>
                        <p className="case-eyebrow">Overview</p>
                        <h2>What happened</h2>
                      </div>
                    </div>
                    <div className="case-panel__actions">
                      {overviewCanExpand && (
                        <PanelExpandButton
                          expanded={Boolean(expandedSections.overview)}
                          onClick={() => toggleExpanded('overview')}
                        />
                      )}
                      <CardEditButton
                        active={editSection === 'overview'}
                        onClick={() => beginEditing('overview')}
                      />
                    </div>
                  </div>
                  <p className={`case-narrative${expandedSections.overview ? ' is-expanded' : ''}`}>
                    {overviewText}
                  </p>
                  <div className="case-facts">
                    <div>
                      <MapPin aria-hidden="true" />
                      <span>Location</span>
                      <strong>{location || 'Not provided'}</strong>
                    </div>
                    <div>
                      <CalendarDays aria-hidden="true" />
                      <span>Incident date</span>
                      <strong>{formatDisplayDate(caseSummary.incident_date, 'Not provided')}</strong>
                    </div>
                    <div>
                      <Clock3 aria-hidden="true" />
                      <span>Last updated</span>
                      <strong>{formatDisplayDate(caseSummary.updated_at)}</strong>
                    </div>
                  </div>
                </section>

                <section className="case-panel case-damages">
                  <div className="case-panel__heading case-panel__heading--action">
                    <div className="case-panel__heading-copy">
                      <div className="case-panel__icon case-panel__icon--rose">
                        <HeartPulse aria-hidden="true" />
                      </div>
                      <div>
                        <p className="case-eyebrow">Financial impact</p>
                        <h2>Damages and expenses</h2>
                      </div>
                    </div>
                    <div className="case-panel__actions">
                      {damageDetailsCanExpand && (
                        <PanelExpandButton
                          expanded={Boolean(expandedSections.damages)}
                          onClick={() => toggleExpanded('damages')}
                        />
                      )}
                      <CardEditButton
                        active={editSection === 'damages'}
                        onClick={() => beginEditing('damages')}
                      />
                    </div>
                  </div>
                  {damages ? (
                    <>
                      <div className="damage-grid">
                        <div className="damage-card damage-card--primary">
                          <HeartPulse aria-hidden="true" />
                          <span>Medical bills</span>
                          <strong>{formatCurrency(damages.medical_bills_usd)}</strong>
                          <small>Medical expenses reported during intake</small>
                        </div>
                        <div className="damage-card">
                          <Banknote aria-hidden="true" />
                          <span>Property damage</span>
                          <strong>{formatCurrency(damages.property_damage_usd)}</strong>
                        </div>
                        <div className="damage-card">
                          <Banknote aria-hidden="true" />
                          <span>Estimated lost wages</span>
                          <strong>{formatCurrency(damages.lost_wages_usd)}</strong>
                        </div>
                        <div className="damage-card">
                          <Banknote aria-hidden="true" />
                          <span>Other expenses</span>
                          <strong>{formatCurrency(damages.other_expenses_usd)}</strong>
                        </div>
                        <div className="damage-card">
                          <CalendarDays aria-hidden="true" />
                          <span>Work days missed</span>
                          <strong>{damages.days_missed > 0 ? damages.days_missed : 'Not provided'}</strong>
                        </div>
                        <div className="damage-card">
                          <Clock3 aria-hidden="true" />
                          <span>Hourly rate</span>
                          <strong>{formatCurrency(damages.hourly_rate_usd)}</strong>
                        </div>
                      </div>
                      {visibleDamageDetails.length > 0 && (
                        <dl className={`damage-details${expandedSections.damages ? ' is-expanded' : ''}`}>
                          {visibleDamageDetails.map(([label, value]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </>
                  ) : (
                    <div className="case-empty">
                      <HeartPulse aria-hidden="true" />
                      <p>No damages information was recorded during intake.</p>
                    </div>
                  )}
                </section>

              </div>

              <aside className="case-content-side">
                <section className="case-panel">
                  <div className="case-panel__heading case-panel__heading--action">
                    <div className="case-panel__heading-copy">
                      <div className="case-panel__icon"><UserRound aria-hidden="true" /></div>
                      <div>
                        <p className="case-eyebrow">Primary contact</p>
                        <h2>Your details</h2>
                      </div>
                    </div>
                    <CardEditButton
                      active={editSection === 'contact'}
                      onClick={() => beginEditing('contact')}
                    />
                  </div>
                  {contact ? (
                    <dl className="contact-list">
                      <div><dt>Name</dt><dd>{contact.full_name || 'Not provided'}</dd></div>
                      <div>
                        <dt>Email</dt>
                        <dd className="contact-list__email" title={contact.email}>
                          {contact.email || 'Not provided'}
                        </dd>
                      </div>
                      <div><dt>Phone</dt><dd>{contact.phone || 'Not provided'}</dd></div>
                      <div><dt>Preferred contact</dt><dd>{contact.method || 'Email'}</dd></div>
                    </dl>
                  ) : (
                    <p className="case-muted">No contact information recorded.</p>
                  )}
                </section>

                <section className="case-panel" id="documents">
                  <div className="case-panel__heading case-panel__heading--action">
                    <div className="case-panel__heading-copy">
                      <div className="case-panel__icon"><FileText aria-hidden="true" /></div>
                      <div>
                        <p className="case-eyebrow">Evidence</p>
                        <h2>Files</h2>
                      </div>
                    </div>
                    <div className="case-panel__actions">
                      {documents.length > 1 && (
                        <button
                          type="button"
                          className="case-panel-expand"
                          onClick={() => setCollectionView('documents')}
                          aria-haspopup="dialog"
                        >
                          View all ({documents.length})
                        </button>
                      )}
                      <CardEditButton
                        active={editSection === 'documents'}
                        onClick={() => beginEditing('documents')}
                      />
                      <button
                        type="button"
                        className="case-icon-button"
                        onClick={beginFileUpload}
                        aria-label="Upload a case file"
                        title="Upload a case file"
                      >
                        <Upload aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {documents.length ? (
                    <div className="case-file-list">
                      {visibleDocuments.map((doc) => (
                        <article key={doc.id} className="case-file">
                          <div className="case-file__icon"><FileText aria-hidden="true" /></div>
                          <div>
                            <strong>{doc.original_filename || 'Uploaded file'}</strong>
                            <span>
                              {formatDocumentKind(doc.kind)} · Uploaded {formatDisplayDate(doc.uploaded_at)}
                            </span>
                            {doc.notes && <p className="case-file__notes">{doc.notes}</p>}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleViewDocument(doc)}
                            disabled={viewingDocId === doc.id}
                            aria-label={`Open ${doc.original_filename || 'uploaded file'}`}
                          >
                            <ExternalLink aria-hidden="true" />
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="case-upload-empty"
                      onClick={beginFileUpload}
                    >
                      <Upload aria-hidden="true" />
                      <strong>Upload supporting files</strong>
                      <span>PDF, images, Word documents, or TXT files</span>
                    </button>
                  )}
                  {viewError && <p className="error">{viewError}</p>}
                </section>

                <section className="case-panel case-parties">
                  <div className="case-panel__heading case-panel__heading--action">
                    <div className="case-panel__heading-copy">
                      <div className="case-panel__icon"><UsersRound aria-hidden="true" /></div>
                      <div>
                        <p className="case-eyebrow">People and organizations</p>
                        <h2>Parties</h2>
                      </div>
                    </div>
                    <div className="case-panel__actions">
                      {parties.length > 1 && (
                        <button
                          type="button"
                          className="case-panel-expand"
                          onClick={() => setCollectionView('parties')}
                          aria-haspopup="dialog"
                        >
                          View all ({parties.length})
                        </button>
                      )}
                      <CardEditButton
                        active={editSection === 'parties'}
                        onClick={() => beginEditing('parties')}
                      />
                    </div>
                  </div>
                  {parties.length ? (
                    <div className="party-grid">
                      {visibleParties.map((party) => (
                        <article key={party.id} className="party-card">
                          <div className="party-card__avatar" aria-hidden="true">
                            {party.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <span>{formatPartyRole(party.role)}</span>
                            <strong>{party.name || 'Unknown party'}</strong>
                            {party.insurer_name && <p>Insurer: {party.insurer_name}</p>}
                            {party.policy_number && <p>Policy: {party.policy_number}</p>}
                            {party.claim_number && <p>Claim: {party.claim_number}</p>}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="case-empty">
                      <UsersRound aria-hidden="true" />
                      <p>No additional parties were recorded.</p>
                    </div>
                  )}
                </section>
              </aside>
            </div>

            <section className="case-panel case-agreements" id="agreements">
              <div className="case-panel__heading case-panel__heading--action">
                <div className="case-panel__heading-copy">
                  <div className="case-panel__icon"><ShieldCheck aria-hidden="true" /></div>
                  <div>
                    <p className="case-eyebrow">Representation</p>
                    <h2>Lawyer-client agreements</h2>
                  </div>
                </div>
                {agreements.length > 3 && (
                  <PanelExpandButton
                    expanded={Boolean(expandedSections.agreements)}
                    count={agreements.length}
                    onClick={() => toggleExpanded('agreements')}
                  />
                )}
              </div>
              <p className="case-agreements__description">
                These are representation offers submitted by lawyers who are interested in your
                case. Review each lawyer&apos;s proposed terms before deciding whether to sign.
              </p>
              {agreements.length ? (
                <div className="agreement-list">
                  {visibleAgreements.map((agreement) => {
                    const file = agreement.file
                    return (
                      <article key={agreement.id} className="agreement-row">
                        <div>
                          <strong>{file?.file_name || 'Agreement file'}</strong>
                          <span>Submitted {formatDisplayDate(agreement.created_at)}</span>
                          {agreement.message && (
                            <p className={expandedSections.agreements ? 'is-expanded' : ''}>
                              {agreement.message}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn secondary slim"
                          onClick={() => handleViewAgreement(agreement)}
                          disabled={viewingAgreementId === agreement.id}
                        >
                          {viewingAgreementId === agreement.id ? 'Opening…' : 'View agreement'}
                        </button>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <p className="case-muted">No lawyers have submitted a representation offer yet.</p>
              )}
            </section>
            {collectionView && (
              <div
                className="case-collection-overlay"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setCollectionView(null)
                }}
              >
                <section
                  className="case-collection-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="case-collection-title"
                >
                  <header className="case-collection-dialog__header">
                    <div>
                      <p className="case-eyebrow">
                        {collectionView === 'documents'
                          ? 'Evidence'
                          : 'People and organizations'}
                      </p>
                      <h2 id="case-collection-title">
                        {collectionView === 'documents' ? 'All case files' : 'All parties'}
                      </h2>
                    </div>
                    <button
                      type="button"
                      className="case-collection-dialog__close"
                      onClick={() => setCollectionView(null)}
                      aria-label="Close full collection view"
                    >
                      <X aria-hidden="true" />
                    </button>
                  </header>
                  <div className="case-collection-dialog__body">
                    {collectionView === 'documents' ? (
                      <div className="case-file-list case-file-list--all">
                        {documents.map((doc) => (
                          <article key={doc.id} className="case-file">
                            <div className="case-file__icon">
                              <FileText aria-hidden="true" />
                            </div>
                            <div>
                              <strong>{doc.original_filename || 'Uploaded file'}</strong>
                              <span>
                                {formatDocumentKind(doc.kind)}
                                {' · Uploaded '}
                                {formatDisplayDate(doc.uploaded_at)}
                              </span>
                              {doc.notes && <p className="case-file__notes">{doc.notes}</p>}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleViewDocument(doc)}
                              disabled={viewingDocId === doc.id}
                              aria-label={`Open ${doc.original_filename || 'uploaded file'}`}
                            >
                              <ExternalLink aria-hidden="true" />
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="party-grid party-grid--all">
                        {parties.map((party) => (
                          <article key={party.id} className="party-card">
                            <div className="party-card__avatar" aria-hidden="true">
                              {party.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <span>{formatPartyRole(party.role)}</span>
                              <strong>{party.name || 'Unknown party'}</strong>
                              {party.insurer_name && <p>Insurer: {party.insurer_name}</p>}
                              {party.policy_number && <p>Policy: {party.policy_number}</p>}
                              {party.claim_number && <p>Claim: {party.claim_number}</p>}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}

function PanelExpandButton({
  expanded,
  count,
  onClick,
}: {
  expanded: boolean
  count?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="case-panel-expand"
      onClick={onClick}
      aria-expanded={expanded}
    >
      {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
      {expanded ? 'Show less' : `Show all${count ? ` (${count})` : ''}`}
    </button>
  )
}

function CardEditButton({
  active = false,
  onClick,
}: {
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`case-card-edit${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <Pencil aria-hidden="true" />
      {active ? 'Editing' : 'Edit'}
    </button>
  )
}

function formatPartyRole(role = '') {
  if (role === 'defendant' || role === 'adverse') return 'Adverse party'
  if (role === 'insurer') return 'Insurer'
  if (role === 'plaintiff') return 'Plaintiff'
  if (role === 'witness') return 'Witness'
  return role || 'Party'
}

function formatDocumentKind(kind = '') {
  if (kind === 'police_report') return 'Police report'
  if (kind === 'er_bill' || kind === 'medical_bill') return 'Medical bill'
  if (kind === 'photos' || kind === 'photo') return 'Photo'
  return 'Other'
}

function valueForInput(value) {
  return value === null || value === undefined ? '' : String(value)
}

export default CaseDetails

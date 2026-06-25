import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { getSession, onAuthStateChange } from '../../api/auth'
import { getCaseDetails } from '../../api/cases'
import { createDocument } from '../../api/intake'
import { uploadFile, createSignedUrl } from '../../storage/fileUpload'
import { normalizeStoragePath } from '../../storage/paths'
import './CaseDetails.css'

const formatDate = (iso, fallback = '—') => {
  if (!iso) return fallback
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return fallback
  }
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
  const [uploadingKind, setUploadingKind] = useState('')

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

  const requiredDocuments = [
    { kind: 'police_report', label: 'Police report' },
    { kind: 'er_bill', label: 'Medical bills' },
    { kind: 'photos', label: 'Photos' },
  ]

  const documentsByKind = documents.reduce((acc, doc) => {
    if (!acc[doc.kind]) acc[doc.kind] = []
    acc[doc.kind].push(doc)
    return acc
  }, {})

  const completedDocs = requiredDocuments.filter((doc) => documentsByKind[doc.kind]?.length).length
  const completionPercent = Math.round((completedDocs / requiredDocuments.length) * 100)

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

  const fileInputsRef = useRef({})
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

  const handleUploadTrigger = (kind) => {
    setViewError('')
    fileInputsRef.current[kind]?.click()
  }

  const handleFileSelected = async (event, kind) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !sessionUser) return
    setUploadingKind(kind)
    try {
      const { path, error: storageError } = await uploadFile({
        bucket: 'case-docs',
        file,
        userId: sessionUser.id,
        caseId,
      })
      if (storageError) throw new Error(storageError)
      const { error: docError } = await createDocument({
        case_id: caseId,
        kind,
        original_filename: file.name,
        storage_path: `case-docs/${path}`,
        uploaded_by: sessionUser.id,
      })
      if (docError) throw new Error(docError)
      await fetchDetails()
    } catch (err) {
      setViewError(err.message || 'Unable to upload file.')
    } finally {
      setUploadingKind('')
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

  return (
    <main className="dashboard">
      <section className="card dashboard-card case-detail">
        <header className="case-detail-head">
          <div>
            <Link to="/dashboard" className="link-button">
              ← Back to dashboard
            </Link>
            <h1>Marketplace readiness</h1>
            <p className="helper-text">
              Complete the required items so True Legal Innovations can review and publish this case.
            </p>
          </div>
          {caseSummary && <span className="status-pill">{caseSummary.status}</span>}
        </header>

        {loading && <p className="helper-text">Loading case details…</p>}
        {error && <p className="error">{error}</p>}

        {!loading && !error && caseSummary && (
          <>
            <section className="detail-banner">
              <div>
                <p className="banner-subtitle">
                  {completedDocs} / {requiredDocuments.length} required items complete
                </p>
                <div className="mini-progress">
                  <div className="mini-progress__fill" style={{ width: `${completionPercent}%` }} />
                </div>
              </div>
              <div className="banner-actions">
                <Link to="/base/intake" className="btn accent">
                  Continue intake
                </Link>
                <a href="#documents" className="btn secondary">
                  View items
                </a>
              </div>
            </section>

            <div className="detail-layout card-grid">
              <section className="detail-card" id="documents">
                <div className="detail-card__head">
                  <div>
                    <h2>Key documents</h2>
                    <p className="helper-text">Upload or review what you have so far.</p>
                  </div>
                </div>

                <div className="doc-list">
                  {requiredDocuments.map((doc) => {
                    const uploaded = documentsByKind[doc.kind]?.[0]
                    return (
                      <div key={doc.kind} className="doc-row">
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.zip"
                          ref={(el) => {
                            fileInputsRef.current[doc.kind] = el
                          }}
                          style={{ display: 'none' }}
                          onChange={(event) => handleFileSelected(event, doc.kind)}
                        />
                        <div>
                          <p className="detail-value">{doc.label}</p>
                          <p className="detail-label">
                            {uploaded ? uploaded.original_filename : 'Waiting on upload'}
                          </p>
                        </div>
                        <div className="doc-actions">
                          <button
                            type="button"
                            className="btn secondary slim"
                            onClick={() => handleUploadTrigger(doc.kind)}
                            disabled={uploadingKind === doc.kind}
                          >
                            {uploadingKind === doc.kind ? 'Uploading…' : uploaded ? 'Replace' : 'Upload'}
                          </button>
                          <button
                            type="button"
                            className="btn secondary slim"
                            onClick={() => uploaded && handleViewDocument(uploaded)}
                            disabled={!uploaded || viewingDocId === uploaded.id}
                          >
                            {viewingDocId === uploaded?.id ? 'Opening…' : 'View'}
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  <div className="doc-row">
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.zip"
                        ref={(el) => {
                          fileInputsRef.current.other = el
                        }}
                        style={{ display: 'none' }}
                        onChange={(event) => handleFileSelected(event, 'other')}
                      />
                        <div>
                          <p className="detail-value">Additional uploads</p>
                          <p className="detail-label">
                            {Math.max(0, documents.length - completedDocs)} additional file
                            {Math.max(0, documents.length - completedDocs) === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className="doc-actions">
                        <button
                          type="button"
                          className="btn secondary slim"
                          onClick={() => handleUploadTrigger('other')}
                          disabled={uploadingKind === 'other'}
                        >
                          {uploadingKind === 'other' ? 'Uploading…' : 'Upload file'}
                        </button>
                        <Link className="btn secondary slim" to={`/dashboard/cases/${caseId}#all-documents`}>
                          Review
                        </Link>
                      </div>
                    </div>
                </div>
                {viewError && <p className="error">{viewError}</p>}
              </section>

              <section className="detail-card">
                <div className="detail-card__head">
                  <div>
                    <h2>Jurisdiction & deadline</h2>
                    <p className="helper-text">Verified after intake review.</p>
                  </div>
                </div>
                <div className="detail-grid">
                  <div>
                    <p className="detail-label">Location</p>
                    <p className="detail-value">
                      {caseSummary.city || '—'}, {caseSummary.state || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="detail-label">Incident date</p>
                    <p className="detail-value">{formatDate(caseSummary.incident_date)}</p>
                  </div>
                  <div>
                    <p className="detail-label">Submitted on</p>
                    <p className="detail-value">{formatDate(caseSummary.created_at)}</p>
                  </div>
                  <div>
                    <p className="detail-label">Last updated</p>
                    <p className="detail-value">{formatDate(caseSummary.updated_at)}</p>
                  </div>
                </div>
              </section>

              <section className="detail-card">
                <div className="detail-card__head">
                  <div>
                    <h2>Case snapshot</h2>
                    <p className="helper-text">At-a-glance totals</p>
                  </div>
                </div>
                {damages ? (
                  <div className="detail-grid">
                    <div>
                      <p className="detail-label">Medical bills</p>
                      <p className="detail-value">
                        ${Number(damages.medical_bills_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="detail-label">Lost wages</p>
                      <p className="detail-value">
                        ${Number(damages.lost_wages_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="detail-label">Days missed</p>
                      <p className="detail-value">{damages.days_missed ?? 0}</p>
                    </div>
                    <div>
                      <p className="detail-label">Hourly rate</p>
                      <p className="detail-value">
                        ${Number(damages.hourly_rate_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="helper-text">Damages information will appear here once recorded.</p>
                )}
              </section>

              <section className="detail-card">
                <div className="detail-card__head">
                  <div>
                    <h2>Your info is secure</h2>
                    <p className="helper-text">We only contact you using the details below.</p>
                  </div>
                </div>
                {contact ? (
                  <div className="detail-grid">
                    <div>
                      <p className="detail-label">Full name</p>
                      <p className="detail-value">{contact.full_name || '—'}</p>
                    </div>
                    <div>
                      <p className="detail-label">Preferred method</p>
                      <p className="detail-value">{contact.method}</p>
                    </div>
                    <div>
                      <p className="detail-label">Email</p>
                      <p className="detail-value detail-value--ellipsis" title={contact.email || '—'}>
                        {contact.email || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="detail-label">Phone</p>
                      <p className="detail-value">{contact.phone || '—'}</p>
                    </div>
                  </div>
                ) : (
                  <p className="helper-text">No contact information recorded.</p>
                )}
              </section>
            </div>

            <section className="detail-section" id="all-documents">
              <h2>All documents</h2>
              {documents.length ? (
                <ul className="documents-list">
                  {documents.map((doc) => (
                    <li key={doc.id} className="document-row">
                      <div>
                        <p className="detail-value">{doc.original_filename || 'Uploaded file'}</p>
                        <p className="detail-label">
                          {doc.kind} · Uploaded {formatDate(doc.uploaded_at)}
                        </p>
                      </div>
                      <div className="doc-actions">
                        <button
                          type="button"
                          className="btn secondary slim"
                          onClick={() => handleViewDocument(doc)}
                          disabled={viewingDocId === doc.id}
                        >
                          {viewingDocId === doc.id ? 'Opening…' : 'View'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="helper-text">No files have been uploaded yet.</p>
              )}
            </section>

            <section className="detail-section" id="agreements">
              <h2>Lawyer-client agreements</h2>
              {agreements.length ? (
                <ul className="documents-list">
                  {agreements.map((agreement) => {
                    const file = agreement.file
                    return (
                      <li key={agreement.id} className="document-row">
                        <div>
                          <p className="detail-value">{file?.file_name || 'Agreement file'}</p>
                          <p className="detail-label">
                            Submitted {formatDate(agreement.created_at)}{' '}
                            {file?.content_type ? `· ${file.content_type}` : ''}
                          </p>
                          {agreement.message && <p className="detail-label">Message: {agreement.message}</p>}
                        </div>
                        <div className="doc-actions">
                          <button
                            type="button"
                            className="btn secondary slim"
                            onClick={() => handleViewAgreement(agreement)}
                            disabled={viewingAgreementId === agreement.id}
                          >
                            {viewingAgreementId === agreement.id ? 'Opening…' : 'View'}
                          </button>
                          {file?.file_size ? (
                            <span className="detail-label">
                              {(file.file_size / 1024).toFixed(1)} KB
                            </span>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="helper-text">No agreements submitted yet.</p>
              )}
            </section>

            <section className="detail-section">
              <h2>Parties</h2>
              {parties.length ? (
                <ul className="detail-list">
                  {parties.map((party) => (
                    <li key={party.id}>
                      <strong>{formatPartyRole(party.role)}</strong>: {party.name || 'Unknown party'}
                      {party.insurer_name && ` · Insurer: ${party.insurer_name}`}
                      {party.policy_number && ` · Policy: ${party.policy_number}`}
                      {party.claim_number && ` · Claim: ${party.claim_number}`}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="helper-text">No additional parties recorded.</p>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  )
}

function formatPartyRole(role = '') {
  if (role === 'defendant' || role === 'adverse') return 'Adverse party'
  if (role === 'insurer') return 'Insurer'
  if (role === 'plaintiff') return 'Plaintiff'
  if (role === 'witness') return 'Witness'
  return role || 'Party'
}

export default CaseDetails

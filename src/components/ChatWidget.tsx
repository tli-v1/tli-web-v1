import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { LucideMaximize2, LucideMic, LucideMicOff, LucideMinimize2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  createCase,
  createCaseContact,
  createDamages,
  createDocument,
  createIncident,
  createParties,
  deleteCase,
} from '../api/intake'
import { ensureUserProfile } from '../api/userProfile'
import {
  applyIntakeAnswerAndAdvance,
  buildIntakeSummary,
  emptyChatIntakeDraft,
  getInitialIntakeQuestion,
  getIntakeQuestion,
  getNextIntakeStep,
  isChatIntakeComplete,
  isIntakeRequest,
  type ChatIntakeDraft,
  type ChatIntakeStep,
} from '../agent/intakeFlow'
import { analyzeImageRelevance, canAnalyzeImage } from '../agent/fileRelevance'
import type { User } from '../types'
import {
  minervaModel,
  saveMinervaExchange,
  type MinervaChatMessage,
} from '../agent/initialize'
import { isCaseIntakeRelevant, offTopicMessage } from '../agent/relevance'
import { removeFiles, uploadFile } from '../storage/fileUpload'
import { useVoiceInput } from '../hooks/useVoiceInput'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatWidgetProps {
  user: User | null
  initialMessage?: string
  variant?: 'embedded' | 'floating'
}

const welcomeMessageId = 'minerva-welcome'
const minervaDisclaimer = "This is an automated assistant, not a licensed attorney."
const defaultInitialMessage =
  "Hi, I'm Minerva! \n\nI'm here to help you get started on your case. What brings you here today?\n\n"
const minervaTheme = {
  navy: '#1a2f5f',
  navyDark: '#0f1d3c',
  navySoft: '#27447f',
  gold: '#f6b400',
  page: '#f5f7fb',
  border: '#dbe3f0',
  muted: '#4b5563',
  danger: '#b91c1c',
  dangerSoft: '#fee2e2',
}

export function ChatWidget(props: ChatWidgetProps) {
  const { user, initialMessage, variant = 'embedded' } = props
  const [messages, setMessages] = useState<Message[]>([
    {
      id: welcomeMessageId,
      role: 'assistant',
      content: initialMessage || defaultInitialMessage,
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(variant !== 'floating')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [intakeDraft, setIntakeDraft] = useState<ChatIntakeDraft>(emptyChatIntakeDraft)
  const [intakeStep, setIntakeStep] = useState<ChatIntakeStep | null>(null)
  const [intakeAwaitingAccount, setIntakeAwaitingAccount] = useState(false)
  const [intakeSubmitting, setIntakeSubmitting] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [filesAnalyzing, setFilesAnalyzing] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingSubmitRef = useRef(false)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!user?.email) return
    setIntakeDraft((prev) => prev.email ? prev : { ...prev, email: user.email })
  }, [user?.email])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = '44px'
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 44), 120)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > 120 ? 'auto' : 'hidden'
  }, [input])

  const appendAssistantMessage = useCallback((content: string) => {
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, assistantMessage])
    return assistantMessage
  }, [])

  const handleVoiceTranscript = useCallback((transcript: string) => {
    setInput((prev) => `${prev}${prev.trim() ? ' ' : ''}${transcript}`.trim())
  }, [])

  const handleVoiceError = useCallback((message: string) => {
    appendAssistantMessage(message)
  }, [appendAssistantMessage])

  const voiceInput = useVoiceInput({
    onTranscript: handleVoiceTranscript,
    onError: handleVoiceError,
  })

  const resetIntake = useCallback(() => {
    setIntakeDraft(emptyChatIntakeDraft)
    setIntakeStep(null)
    setIntakeAwaitingAccount(false)
    setAttachedFiles([])
    pendingSubmitRef.current = false
  }, [])

  const submitChatIntake = useCallback(async (draft: ChatIntakeDraft, submittingUser: User) => {
    setIntakeSubmitting(true)
    let createdCaseId = ''
    const uploadedStoragePaths: string[] = []

    try {
      await ensureUserProfile({
        userId: submittingUser.id,
        fullName: draft.fullName,
        phone: draft.phone,
        role: 'client',
      })

      const { data: caseData, error: caseError } = await createCase({
        userId: submittingUser.id,
        consentStore: draft.consentProcess,
        consentContact: draft.consentContact,
      })
      if (caseError || !caseData) throw new Error(caseError || 'Unable to create case.')
      createdCaseId = caseData.id

      const [incidentResult, damagesResult, contactResult, partiesResult] = await Promise.all([
        createIncident({
          case_id: createdCaseId,
          description: draft.whatHappened,
          incident_date: draft.incidentDate,
          city: draft.city,
          state_code: draft.state,
        }),
        createDamages({
          case_id: createdCaseId,
          medical_bills_usd: Number(draft.medicalBills) || 0,
          days_missed: Number(draft.daysMissed) || 0,
          daily_rate_usd: Number(draft.dailyRate) || 0,
        }),
        createCaseContact({
          case_id: createdCaseId,
          full_name: draft.fullName,
          method: draft.preferredContact,
          email: draft.email,
          phone: draft.phone || null,
        }),
        createParties([
          {
            case_id: createdCaseId,
            role: 'defendant',
            name: draft.adverseParty || 'Unknown party',
          },
          ...(draft.insurerName && draft.insurerName !== 'None'
            ? [
                {
                  case_id: createdCaseId,
                  role: 'insurer',
                  name: draft.insurerName,
                  insurer_name: draft.insurerName,
                  policy_number: draft.policyNumber || null,
                  claim_number: draft.claimNumber || null,
                },
              ]
            : []),
        ]),
      ])

      const firstError =
        incidentResult.error || damagesResult.error || contactResult.error || partiesResult.error
      if (firstError) throw new Error(firstError)

      for (const file of attachedFiles) {
        const { path, error: storageError } = await uploadFile({
          bucket: 'case-docs',
          file,
          userId: submittingUser.id,
          caseId: createdCaseId,
        })
        if (storageError || !path) throw new Error(storageError || 'Unable to upload file.')
        uploadedStoragePaths.push(path)

        const { error: documentError } = await createDocument({
          case_id: createdCaseId,
          kind: documentKindFor(file),
          original_filename: file.name,
          storage_path: `case-docs/${path}`,
          uploaded_by: submittingUser.id,
        })
        if (documentError) throw new Error(documentError)
      }

      const fileNote = attachedFiles.length ? ` I also uploaded ${attachedFiles.length} file${attachedFiles.length === 1 ? '' : 's'}.` : ''
      appendAssistantMessage(`Your intake has been submitted. Case ID: ${createdCaseId}.${fileNote}`)
      resetIntake()
    } catch (error) {
      if (createdCaseId) {
        await deleteCase(createdCaseId)
      }
      if (uploadedStoragePaths.length) {
        await removeFiles('case-docs', uploadedStoragePaths)
      }
      appendAssistantMessage(error instanceof Error ? error.message : 'Unable to submit your intake.')
    } finally {
      setIntakeSubmitting(false)
    }
  }, [appendAssistantMessage, attachedFiles, resetIntake])

  useEffect(() => {
    if (
      !user
      || !intakeAwaitingAccount
      || !isChatIntakeComplete(intakeDraft)
      || intakeSubmitting
      || pendingSubmitRef.current
    ) return

    pendingSubmitRef.current = true
    appendAssistantMessage('You are signed in now. I am submitting your intake.')
    setIntakeAwaitingAccount(false)
    submitChatIntake(intakeDraft, user).finally(() => {
      pendingSubmitRef.current = false
    })
  }, [appendAssistantMessage, intakeAwaitingAccount, intakeDraft, intakeSubmitting, submitChatIntake, user])

  const handleAttachFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    event.target.value = ''

    setFilesAnalyzing(true)
    const acceptedFiles: File[] = []
    const rejectedFiles: string[] = []

    try {
      for (const file of files) {
        if (!canAnalyzeImage(file)) {
          acceptedFiles.push(file)
          continue
        }

        const review = await analyzeImageRelevance(file)
        if (review.relevant) {
          acceptedFiles.push(file)
          continue
        }

        rejectedFiles.push(`${file.name}: ${review.reason}`)
      }

      if (acceptedFiles.length) {
        setAttachedFiles((prev) => [...prev, ...acceptedFiles])
        if (intakeStep === 'documents') {
          setIntakeDraft((prev) => ({ ...prev, authorizeDocuments: true }))
        }
      }

      if (rejectedFiles.length) {
        appendAssistantMessage(`I did not attach ${rejectedFiles.length === 1 ? 'that image' : 'those images'} because ${rejectedFiles.join('; ')}. Please upload documents, photos, or evidence connected to the case.`)
      } else if (acceptedFiles.some((file) => canAnalyzeImage(file))) {
        appendAssistantMessage(`I reviewed and attached ${acceptedFiles.length} file${acceptedFiles.length === 1 ? '' : 's'} for this intake.`)
      }
    } finally {
      setFilesAnalyzing(false)
    }
  }

  const removeAttachedFile = (indexToRemove: number) => {
    setAttachedFiles((prev) => prev.filter((_, index) => index !== indexToRemove))
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading || intakeSubmitting || filesAnalyzing) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    const nextMessages = [...messages, userMessage]

    setMessages(nextMessages)
    setInput('')

    const activeIntakeStep = intakeStep ?? (isIntakeRequest(userMessage.content) ? 'whatHappened' : null)
    if (activeIntakeStep) {
      if (!intakeStep && /^(start|begin|create|submit)/i.test(userMessage.content.trim())) {
        setIntakeStep('whatHappened')
        appendAssistantMessage(getInitialIntakeQuestion())
        return
      }

      const result = applyIntakeAnswerAndAdvance(intakeDraft, activeIntakeStep, userMessage.content, {
        attachedFileCount: attachedFiles.length,
        userEmail: user?.email,
      })
      setIntakeDraft(result.draft)

      if (!result.accepted) {
        setIntakeStep(activeIntakeStep)
        appendAssistantMessage(result.message || getIntakeQuestion(activeIntakeStep))
        return
      }

      const nextStep = getNextIntakeStep(result.draft)
      if (nextStep) {
        setIntakeStep(nextStep)
        appendAssistantMessage(getIntakeQuestion(nextStep))
        return
      }

      setIntakeStep(null)
      const summary = buildIntakeSummary(result.draft)
      const attachmentSummary = attachedFiles.length
        ? `\nFiles attached: ${attachedFiles.map((file) => file.name).join(', ')}`
        : ''
      if (!user) {
        setIntakeAwaitingAccount(true)
        appendAssistantMessage(`${summary}${attachmentSummary}\n\nTo submit this, create an account or sign in from the dashboard. Once you are signed in, I will automatically create the case and upload the attached files. Keep this tab open while you sign in so the files stay attached.`)
        return
      }

      appendAssistantMessage(`${summary}${attachmentSummary}\n\nSubmitting this intake now.`)
      await submitChatIntake(result.draft, user)
      return
    }

    if (!isCaseIntakeRelevant(userMessage.content)) {
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: offTopicMessage,
        timestamp: new Date(),
      }
      setMessages([...nextMessages, assistantMessage])
      return
    }

    setIsLoading(true)

    try {
      const history = nextMessages
        .filter((message) => message.id !== welcomeMessageId)
        .slice(0, -1)
        .map((message) => ({
          role: message.role === 'user' ? 'user' as const : 'model' as const,
          parts: [{ text: message.content }],
        }))

      const chat = minervaModel.startChat({ history })
      const result = await chat.sendMessage(userMessage.content)
      const aiMessage =
        result.response.text() ||
        "I'm sorry, I couldn't process that. Could you rephrase?"

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: aiMessage,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])

      saveMinervaExchange({
        sessionId,
        userId: user?.id,
        userMessage: toMinervaMessage(userMessage),
        assistantMessage: toMinervaMessage(assistantMessage),
      })
        .then(setSessionId)
        .catch((error) => {
          console.warn('Unable to save Minerva chat exchange:', error)
        })
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!isOpen && variant === 'floating') {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          right: '24px',
          bottom: '24px',
          zIndex: 50,
          padding: '14px 18px',
          borderRadius: '999px',
          border: 'none',
          backgroundColor: minervaTheme.navySoft,
          color: 'white',
          fontSize: '14px',
          fontWeight: 700,
          boxShadow: '0 12px 30px rgba(15, 29, 60, 0.28)',
          cursor: 'pointer',
        }}
      >
        Ask Minerva
      </button>
    )
  }

  const defaultContainerStyle =
    variant === 'floating'
      ? {
          position: 'fixed' as const,
          right: '24px',
          bottom: '24px',
          zIndex: 50,
          width: 'min(420px, calc(100vw - 32px))',
          height: 'min(620px, calc(100vh - 48px))',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 20px 60px rgba(15,23,42,0.22)',
          display: 'flex',
          flexDirection: 'column' as const,
          overflow: 'hidden',
          border: `1px solid ${minervaTheme.border}`,
        }
      : {
          width: '100%',
          maxWidth: '1000px',
          height: 'calc(100vh - 180px)',
          minHeight: '600px',
          margin: '0 auto',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column' as const,
          overflow: 'hidden',
          border: `1px solid ${minervaTheme.border}`,
        }

  const containerStyle = isFullscreen
    ? {
        position: 'fixed' as const,
        inset: 0,
        zIndex: 1000,
        width: '100vw',
        height: '100dvh',
        minHeight: 0,
        maxWidth: 'none',
        margin: 0,
        backgroundColor: 'white',
        borderRadius: 0,
        boxShadow: 'none',
        display: 'flex',
        flexDirection: 'column' as const,
        overflow: 'hidden',
        border: 'none',
      }
    : defaultContainerStyle

  return (
    <>
      {isOpen && (
        <div
          className="chat-widget"
          style={containerStyle}
        >
          <div
            style={{
              padding: '16px 20px',
              backgroundColor: minervaTheme.navySoft,
              color: 'white',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Minerva</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
                Legal Assistant
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setIsFullscreen((prev) => !prev)}
                aria-label={isFullscreen ? 'Exit fullscreen chat' : 'Open fullscreen chat'}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  padding: '0',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '8px',
                }}
              >
                {isFullscreen ? (
                  <LucideMinimize2 aria-hidden="true" width={19} height={19} strokeWidth={2.25} />
                ) : (
                  <LucideMaximize2 aria-hidden="true" width={19} height={19} strokeWidth={2.25} />
                )}
              </button>
              <button
                onClick={() => {
                  setIsFullscreen(false)
                  setIsOpen(false)
                }}
                aria-label="Close chat"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '0',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                x
              </button>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              backgroundColor: minervaTheme.page,
            }}
          >
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '70%',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    backgroundColor: message.role === 'user' ? minervaTheme.navy : 'white',
                    color: message.role === 'user' ? 'white' : minervaTheme.navyDark,
                    border: message.role === 'user' ? 'none' : `1px solid ${minervaTheme.border}`,
                    boxShadow: '0 1px 2px rgba(15, 29, 60, 0.06)',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{message.content}</p>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: message.id === welcomeMessageId && message.role === 'assistant' ? 'space-between' : 'flex-start',
                      gap: '12px',
                      marginTop: '8px',
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: '11px',
                        opacity: 0.7,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {message.id === welcomeMessageId && message.role === 'assistant' && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: '11px',
                          lineHeight: '1.3',
                          color: minervaTheme.muted,
                          textAlign: 'right',
                        }}
                      >
                        {minervaDisclaimer}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '16px' }}>
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    backgroundColor: 'white',
                    border: `1px solid ${minervaTheme.border}`,
                    boxShadow: '0 1px 2px rgba(15, 29, 60, 0.06)',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '14px', color: minervaTheme.muted }}>Typing...</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div
            style={{
              padding: '16px 20px',
              backgroundColor: 'white',
              borderTop: `1px solid ${minervaTheme.border}`,
            }}
          >
            {intakeAwaitingAccount && !user && (
              <Link
                to="/dashboard"
                style={{
                  display: 'block',
                  marginBottom: '12px',
                  color: minervaTheme.navy,
                  fontSize: '14px',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Create account or sign in to submit
              </Link>
            )}
            {(intakeStep === 'documents' || attachedFiles.length > 0) && (
              <div style={{ marginBottom: '12px' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.heic,.zip"
                  onChange={handleAttachFiles}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={intakeSubmitting || filesAnalyzing}
                  style={{
                    border: `1px solid ${minervaTheme.border}`,
                    borderRadius: '8px',
                    backgroundColor: '#fff',
                    color: minervaTheme.navyDark,
                    cursor: intakeSubmitting || filesAnalyzing ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    fontWeight: 700,
                    padding: '8px 12px',
                  }}
                >
                  {filesAnalyzing ? 'Reviewing files...' : 'Attach files'}
                </button>
                {attachedFiles.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {attachedFiles.map((file, index) => (
                      <button
                        key={`${file.name}-${file.lastModified}-${index}`}
                        type="button"
                        onClick={() => removeAttachedFile(index)}
                        disabled={intakeSubmitting || filesAnalyzing}
                        title="Remove file"
                        style={{
                          border: `1px solid ${minervaTheme.border}`,
                          borderRadius: '999px',
                          backgroundColor: minervaTheme.page,
                          color: minervaTheme.navySoft,
                          cursor: intakeSubmitting || filesAnalyzing ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          padding: '5px 9px',
                        }}
                      >
                        {file.name} x
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={voiceInput.toggle}
                disabled={!voiceInput.supported || isLoading || intakeSubmitting || filesAnalyzing}
                title={voiceInput.supported ? 'Voice mode' : 'Voice input is not supported in this browser'}
                aria-label={voiceInput.enabled ? 'Turn off voice mode' : 'Turn on voice mode'}
                aria-pressed={voiceInput.enabled}
                style={{
                  width: '44px',
                  minWidth: '44px',
                  height: '44px',
                  border: `1px solid ${minervaTheme.border}`,
                  borderRadius: '8px',
                  backgroundColor: voiceInput.enabled ? minervaTheme.dangerSoft : '#fff',
                  color: voiceInput.enabled ? minervaTheme.danger : minervaTheme.navyDark,
                  cursor: voiceInput.supported && !isLoading && !intakeSubmitting && !filesAnalyzing ? 'pointer' : 'not-allowed',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 0,
                }}
              >
                {voiceInput.enabled ? (
                  <LucideMicOff
                    aria-hidden="true"
                    width={20}
                    height={20}
                    color={minervaTheme.danger}
                    strokeWidth={2.25}
                    style={{ display: 'block', width: '20px', height: '20px', minWidth: '20px' }}
                  />
                ) : (
                  <LucideMic
                    aria-hidden="true"
                    width={20}
                    height={20}
                    color={minervaTheme.navyDark}
                    strokeWidth={2.25}
                    style={{ display: 'block', width: '20px', height: '20px', minWidth: '20px' }}
                  />
                )}
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Minerva..."
                disabled={isLoading || intakeSubmitting || filesAnalyzing}
                style={{
                  flex: 1,
                  minHeight: '44px',
                  padding: '11px 12px',
                  border: `1px solid ${minervaTheme.border}`,
                  borderRadius: '8px',
                  fontSize: '14px',
                  lineHeight: '20px',
                  resize: 'none',
                  maxHeight: '120px',
                  fontFamily: 'inherit',
                  overflowY: 'hidden',
                }}
                rows={1}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading || intakeSubmitting || filesAnalyzing}
                style={{
                  padding: '12px 24px',
                  backgroundColor: input.trim() && !isLoading && !intakeSubmitting && !filesAnalyzing ? minervaTheme.gold : '#d8dee9',
                  color: input.trim() && !isLoading && !intakeSubmitting && !filesAnalyzing ? minervaTheme.navyDark : minervaTheme.muted,
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: input.trim() && !isLoading && !intakeSubmitting && !filesAnalyzing ? 'pointer' : 'not-allowed',
                  transition: 'background-color 0.2s',
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function toMinervaMessage(message: Message): MinervaChatMessage {
  return {
    role: message.role,
    content: message.content,
  }
}

function documentKindFor(file: File): string {
  if (file.type.startsWith('image/')) return 'photos'
  const name = file.name.toLowerCase()
  if (name.includes('police')) return 'police_report'
  if (name.includes('medical') || name.includes('bill') || name.includes('er')) return 'er_bill'
  return 'other'
}

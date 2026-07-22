import { ArrowUp, Check, LoaderCircle, Mic, MicOff, Paperclip, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { updateConversationalIntakeProcessing } from '../../agent/initialize'
import { processIntakeIntoCase, type IntakeFile } from '../../agent/processIntake'
import { buildVoiceIntakeDraft } from '../../agent/voiceIntakeDraft'
import {
  signInWithApple,
  signInWithGoogle,
  signInWithPassword,
  signUp,
} from '../../api/auth'
import {
  getPasswordPolicyError,
  PASSWORD_MIN_LENGTH,
} from '../../utils/passwordPolicy'
import { useRealtimeVoice } from '../../hooks/useRealtimeVoice'
import { healthInformationNotice } from '../../intake/healthInformationNotice'
import {
  trackAccountAuth,
  trackCaseSubmitted,
  trackFileSelected,
  trackIntakeCompleted,
} from '../../analytics/googleTags'
import {
  ACCEPTED_CASE_FILE_TYPES,
  validateCaseFiles,
} from '../../storage/fileValidation'
import { removeFiles, uploadFile } from '../../storage/fileUpload'
import type { User } from '../../types'
import SocialAuthButtons, {
  type SocialAuthProvider,
} from '../SocialAuthButtons/SocialAuthButtons'
import PasswordRequirements from '../PasswordRequirements/PasswordRequirements'
import './RealtimeVoiceIntake.css'

interface RealtimeVoiceIntakeProps {
  onClose: () => void
  onFallbackToText?: () => void
}

type AuthMode = 'signin' | 'signup'

const FILE_UPLOAD_PROMPT_PATTERN =
  /\b(?:attach|upload|add|provide|share|select|choose)\b[\s\S]{0,120}\b(?:files?|documents?|evidence|photos?|photographs?|videos?|records?|reports?|bills?|receipts?|contracts?|correspondence|attachments?)\b|\b(?:files?|documents?|evidence|photos?|photographs?|videos?|records?|reports?|bills?|receipts?|contracts?|correspondence|attachments?)\b[\s\S]{0,120}\b(?:attach|upload|add|provide|share|select|choose)\b/i

export default function RealtimeVoiceIntake({
  onClose,
  onFallbackToText,
}: RealtimeVoiceIntakeProps) {
  const realtime = useRealtimeVoice()
  const endRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const finalizingRef = useRef(false)
  const hasShownPreparingRef = useRef(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([])
  const [textInput, setTextInput] = useState('')
  const [editingMessageId, setEditingMessageId] = useState('')
  const [editingMessageText, setEditingMessageText] = useState('')
  const [authMode, setAuthMode] = useState<AuthMode>('signup')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [socialAuthLoading, setSocialAuthLoading] = useState<SocialAuthProvider | null>(null)
  const [intakeSaved, setIntakeSaved] = useState(false)
  const [processedCaseId, setProcessedCaseId] = useState('')
  const [showReadyTransition, setShowReadyTransition] = useState(false)
  const [healthNoticeAccepted, setHealthNoticeAccepted] = useState(false)

  const showFileUpload = useMemo(() => {
    const latestAssistantMessage = [...realtime.messages]
      .reverse()
      .find((message) => message.role === 'assistant')

    return Boolean(
      latestAssistantMessage
      && FILE_UPLOAD_PROMPT_PATTERN.test(latestAssistantMessage.content),
    )
  }, [realtime.messages])

  useEffect(() => {
    void realtime.start()
    // This session starts once when the microphone overlay opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [realtime.messages, realtime.isProcessingUserInput])

  useEffect(() => {
    if (!realtime.isIntakeComplete) return

    setAuthMode('signup')
    setAuthError('')
  }, [realtime.isIntakeComplete])

  const close = () => {
    realtime.stop()
    onClose()
  }

  const continueByText = () => {
    realtime.stop()
    onFallbackToText?.()
  }

  const isPreparing = (
    (realtime.status === 'connecting' || realtime.status === 'connected')
    && !realtime.hasAssistantStarted
    && realtime.messages.length === 0
  )

  useEffect(() => {
    if (isPreparing) {
      hasShownPreparingRef.current = true
      setShowReadyTransition(false)
      return undefined
    }

    if (!hasShownPreparingRef.current) return undefined

    setShowReadyTransition(true)
    const readyTimer = window.setTimeout(() => {
      setShowReadyTransition(false)
    }, 1400)

    return () => window.clearTimeout(readyTimer)
  }, [isPreparing])

  const submitTextMessage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const message = textInput.trim()
      || (
        showFileUpload
          ? pendingFiles.length > 0
            ? `${pendingFiles.length} file${pendingFiles.length === 1 ? '' : 's'} selected for submission.`
            : 'No files or note to add right now.'
          : ''
      )
    if (realtime.sendTextMessage(message, { preserveMicrophone: showFileUpload })) {
      setTextInput('')
    }
  }

  const beginEditingMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId)
    setEditingMessageText(content)
  }

  const cancelEditingMessage = () => {
    setEditingMessageId('')
    setEditingMessageText('')
  }

  const saveEditingMessage = () => {
    if (realtime.editMessage(editingMessageId, editingMessageText)) {
      cancelEditingMessage()
    }
  }

  const uploadPendingFiles = async (user: User, caseId: string): Promise<IntakeFile[]> => {
    if (!pendingFiles.length) return []

    setIsUploading(true)
    setUploadError('')
    const uploadedNames: string[] = []
    const uploadedPaths: string[] = []
    const intakeFiles: IntakeFile[] = []

    try {
      for (const file of pendingFiles) {
        const upload = await uploadFile({
          bucket: 'case-docs',
          file,
          userId: user.id,
          caseId,
        })

        if (!upload.path) {
          throw new Error(upload.error || `Unable to upload ${file.name}.`)
        }

        uploadedPaths.push(upload.path)
        intakeFiles.push({
          name: file.name,
          storagePath: `case-docs/${upload.path}`,
        })
        uploadedNames.push(file.name)
      }

      setUploadedFiles((current) => [...current, ...uploadedNames])
      setPendingFiles([])
      return intakeFiles
    } catch (error) {
      if (uploadedPaths.length > 0) {
        await removeFiles('case-docs', uploadedPaths).catch(() => undefined)
      }
      throw error
    } finally {
      setIsUploading(false)
    }
  }

  const finalizeIntake = async (user: User) => {
    finalizingRef.current = true
    setAuthLoading(true)
    setAuthError('')
    let processingSessionId: string | null = null

    try {
      processingSessionId = await realtime.claimSession()
      await updateConversationalIntakeProcessing(processingSessionId, {
        status: 'processing',
      })

      const draft = buildVoiceIntakeDraft(realtime.messages)
      const processed = await processIntakeIntoCase({
        draft,
        files: [],
        prepareFiles: (caseId) => uploadPendingFiles(user, caseId),
        user,
      })
      await updateConversationalIntakeProcessing(processingSessionId, {
        status: 'processed',
        structuredData: processed.structured,
        caseId: processed.caseId,
      })
      setProcessedCaseId(processed.caseId)
      setIntakeSaved(true)
      trackIntakeCompleted('voice')
      trackCaseSubmitted('voice', {
        fileCount: pendingFiles.length,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (processingSessionId) {
        await updateConversationalIntakeProcessing(processingSessionId, {
          status: 'failed',
          error: message,
        }).catch(() => undefined)
      }
      setAuthError(
        message.toLowerCase().includes('belongs to another user')
          ? 'This intake is linked to a different account in this browser. Sign in with that account, or close this intake and start a new one.'
          : message.includes('storage/')
          ? 'Your account is ready, but the files could not be uploaded. Please retry.'
          : message || 'Your intake could not be saved. Please try again.',
      )
    } finally {
      finalizingRef.current = false
      setAuthLoading(false)
    }
  }

  const submitAuthentication = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = authEmail.trim()

    if (!email) {
      setAuthError('Enter your email address.')
      return
    }
    const passwordError =
      authMode === 'signup'
        ? getPasswordPolicyError(authPassword)
        : authPassword.length < 6
          ? 'Enter your password.'
          : null
    if (passwordError) {
      setAuthError(passwordError)
      return
    }

    setAuthLoading(true)
    setAuthError('')
    try {
      const response = authMode === 'signup'
        ? await signUp(email, authPassword)
        : await signInWithPassword(email, authPassword)

      if (response.error) {
        if (response.error.code === 'auth/email-already-in-use') {
          setAuthMode('signin')
        }
        throw new Error(response.error.message)
      }

      if (!response.user) {
        throw new Error('Authentication completed without a user account.')
      }

      setAuthPassword('')
      trackAccountAuth(
        authMode === 'signup' ? 'created' : 'signed_in',
        'voice_intake',
        'email',
      )
      await finalizeIntake(response.user)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed.')
    } finally {
      if (!finalizingRef.current) setAuthLoading(false)
    }
  }

  const submitSocialAuthentication = async (provider: SocialAuthProvider) => {
    setAuthLoading(true)
    setSocialAuthLoading(provider)
    setAuthError('')

    try {
      const response = provider === 'google'
        ? await signInWithGoogle()
        : await signInWithApple()

      if (response.error) throw new Error(response.error.message)
      if (!response.user) {
        throw new Error('Authentication completed without a user account.')
      }

      trackAccountAuth('signed_in', 'voice_intake', provider)
      await finalizeIntake(response.user)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed.')
    } finally {
      setSocialAuthLoading(null)
      if (!finalizingRef.current) setAuthLoading(false)
    }
  }

  const selectPendingFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return

    const existing = new Set(
      pendingFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
    )
    const nextFiles = [
      ...pendingFiles,
      ...files.filter(
        (file) => !existing.has(`${file.name}:${file.size}:${file.lastModified}`),
      ),
    ]

    try {
      await validateCaseFiles(nextFiles)
      setUploadError('')
      setPendingFiles(nextFiles)
      trackFileSelected('voice_intake', nextFiles.length)
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : 'One or more attachments are not allowed.',
      )
    }
  }

  if (isPreparing || showReadyTransition) {
    return (
      <section
        className={`realtime-intake ${
          showReadyTransition ? 'realtime-intake--all-set' : 'realtime-intake--loading'
        }`}
        aria-label="Preparing conversational legal intake"
        aria-live="polite"
      >
        <button
          className="realtime-intake__close realtime-intake__loading-close"
          type="button"
          onClick={close}
          aria-label="Close voice intake"
        >
          <X aria-hidden="true" />
        </button>
        {showReadyTransition ? (
          <div className="realtime-intake__loading-content realtime-intake__all-set-content">
            <div className="realtime-intake__loading-mark realtime-intake__all-set-mark" aria-hidden="true">
              <Check />
            </div>
            <h2>All Set!</h2>
            <p>Our agent is ready to start.</p>
          </div>
        ) : (
          <div className="realtime-intake__loading-content">
            <div className="realtime-intake__loading-mark" aria-hidden="true">
              <Mic />
            </div>
            <h2>Getting things ready for you!</h2>
            <p>Our agent will be with you in just a moment</p>
            <span className="realtime-intake__loading-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </section>
    )
  }

  return (
    <section
      className="realtime-intake realtime-intake--ready"
      aria-label="Realtime conversational legal intake"
    >
      <header className="realtime-intake__header">
        <div>
          <h2>Share what happened</h2>
          <p>
            {realtime.status === 'connecting' && 'Connecting secure voice session…'}
            {realtime.status === 'connected' && (
              realtime.limitReason
                ? 'Input limit reached'
                : realtime.isMicrophoneMuted ? 'Microphone off · type below' : 'Listening · speak naturally'
            )}
            {realtime.status === 'error' && 'Voice session unavailable'}
            {realtime.status === 'idle' && (
              realtime.limitReason ? 'Intake paused' : 'Voice session ended'
            )}
          </p>
          <span className="realtime-intake__edit-disclaimer">
            Tap your responses to edit them.
          </span>
        </div>
        <button
          className="realtime-intake__close"
          type="button"
          onClick={close}
          aria-label="Close voice intake"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="realtime-intake__messages" aria-live="polite">
        {realtime.messages.map((message) => (
          <article
            key={message.id}
            className={`realtime-intake__message realtime-intake__message--${message.role}${
              message.role === 'user' && !intakeSaved && editingMessageId !== message.id
                ? ' realtime-intake__message--editable'
                : ''
            }`}
            role={message.role === 'user' && !intakeSaved && editingMessageId !== message.id ? 'button' : undefined}
            tabIndex={message.role === 'user' && !intakeSaved && editingMessageId !== message.id ? 0 : undefined}
            title={message.role === 'user' && !intakeSaved ? 'Tap to edit this answer' : undefined}
            onClick={() => {
              if (message.role === 'user' && !intakeSaved && editingMessageId !== message.id) {
                beginEditingMessage(message.id, message.content)
              }
            }}
            onKeyDown={(event) => {
              if (
                message.role === 'user'
                && !intakeSaved
                && editingMessageId !== message.id
                && (event.key === 'Enter' || event.key === ' ')
              ) {
                event.preventDefault()
                beginEditingMessage(message.id, message.content)
              }
            }}
          >
            {editingMessageId === message.id ? (
              <div className="realtime-intake__message-edit">
                <textarea
                  value={editingMessageText}
                  onChange={(event) => setEditingMessageText(event.target.value)}
                  maxLength={800}
                  aria-label="Edit your message"
                />
                <div className="realtime-intake__message-edit-actions">
                  <button type="button" onClick={cancelEditingMessage}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEditingMessage}
                    disabled={!editingMessageText.trim()}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p>{message.content}</p>
            )}
          </article>
        ))}
        {realtime.isProcessingUserInput && (
          <div
            className="realtime-intake__message realtime-intake__message--user realtime-intake__typing realtime-intake__typing--user"
            role="status"
            aria-label="Your answer is being processed"
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </div>
        )}
        {realtime.error && <p className="realtime-intake__error">{realtime.error}</p>}
        {realtime.limitReason && (
          <p className="realtime-intake__limit-notice">{realtime.limitReason}</p>
        )}
        <div ref={endRef} />
      </div>

      <footer className="realtime-intake__footer">
        {realtime.isIntakeComplete ? (
          intakeSaved ? (
            <div className="realtime-intake__saved" role="status">
              <div className="realtime-intake__saved-message">
                <Check aria-hidden="true" />
                <div>
                  <strong>Intake saved</strong>
                  <p>Your intake is connected to your account.</p>
                </div>
              </div>
              <Link
                className="realtime-intake__dashboard-link"
                to={processedCaseId ? `/dashboard/cases/${processedCaseId}` : '/dashboard'}
                onClick={realtime.stop}
              >
                Go to dashboard
              </Link>
            </div>
          ) : (
            <form className="realtime-intake__auth" onSubmit={submitAuthentication}>
              <div className="realtime-intake__auth-toggle">
                <button
                  type="button"
                  className={authMode === 'signup' ? 'is-active' : ''}
                  onClick={() => {
                    setAuthMode('signup')
                    setAuthError('')
                  }}
                >
                  Create account
                </button>
                <button
                  type="button"
                  className={authMode === 'signin' ? 'is-active' : ''}
                  onClick={() => {
                    setAuthMode('signin')
                    setAuthError('')
                  }}
                >
                  Sign in
                </button>
              </div>
              <SocialAuthButtons
                disabled={authLoading}
                loadingProvider={socialAuthLoading}
                onSelect={submitSocialAuthentication}
              />
              <div className="realtime-intake__auth-fields">
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    autoComplete="email"
                    disabled={authLoading}
                    required
                  />
                </label>
                <div className="password-field-with-requirements">
                  <label>
                    <span>Password</span>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                      autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                      disabled={authLoading}
                      minLength={authMode === 'signup' ? PASSWORD_MIN_LENGTH : 6}
                      required
                    />
                  </label>
                  {authMode === 'signup' && <PasswordRequirements password={authPassword} />}
                </div>
                <button
                  className="realtime-intake__auth-submit"
                  type="submit"
                  disabled={authLoading}
                >
                  {authLoading
                    ? 'Please wait…'
                    : authMode === 'signup' ? 'Create account' : 'Sign in'}
                </button>
              </div>
              {authError && <p className="realtime-intake__auth-error">{authError}</p>}
            </form>
          )
        ) : (
        <>
        {showFileUpload && (
          <div className="realtime-intake__health-notice">
            <div>
              <strong>Health information and privacy notice</strong>
              <p>{healthInformationNotice}</p>
            </div>
            <label>
              <input
                type="checkbox"
                checked={healthNoticeAccepted}
                onChange={(event) => setHealthNoticeAccepted(event.target.checked)}
              />
              <span>I understand and authorize this storage and limited sharing.</span>
            </label>
          </div>
        )}
        {realtime.limitWarning && !realtime.limitReason && (
          <p className="realtime-intake__limit-warning" role="status">
            {realtime.limitWarning}
          </p>
        )}
        <form className="realtime-intake__composer" onSubmit={submitTextMessage}>
          <button
            className={`realtime-intake__mic-toggle ${
              realtime.status === 'connected' && !realtime.isMicrophoneMuted ? 'is-live' : ''
            }`}
            type="button"
            onClick={realtime.toggleMicrophone}
            disabled={realtime.status !== 'connected' || Boolean(realtime.limitReason)}
            aria-label={realtime.isMicrophoneMuted ? 'Turn microphone on' : 'Turn microphone off'}
            title={realtime.isMicrophoneMuted ? 'Turn microphone on' : 'Turn microphone off'}
          >
            {realtime.status === 'connected' && realtime.isMicrophoneMuted
              ? <Mic aria-hidden="true" />
              : realtime.status !== 'connected'
                ? <MicOff aria-hidden="true" />
              : (
                <span className="realtime-intake__mic-active-icon" aria-hidden="true">
                  <MicOff />
                </span>
              )}
          </button>

          {showFileUpload && (
            <>
              <input
                ref={fileInputRef}
                className="realtime-intake__file-input"
                type="file"
                multiple
                accept={ACCEPTED_CASE_FILE_TYPES}
                onChange={selectPendingFiles}
                disabled={isUploading || !healthNoticeAccepted}
                aria-label="Choose files to attach"
              />
              <button
                className="realtime-intake__attach"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || !healthNoticeAccepted}
                aria-label={
                  healthNoticeAccepted
                    ? 'Attach files'
                    : 'Accept the health information notice before attaching files'
                }
                title={
                  healthNoticeAccepted
                    ? 'Attach files'
                    : 'Accept the health information notice before attaching files'
                }
              >
                {isUploading
                  ? <LoaderCircle className="realtime-intake__spinner" aria-hidden="true" />
                  : <Paperclip aria-hidden="true" />}
              </button>
            </>
          )}

          <input
            className="realtime-intake__text-input"
            type="text"
            value={textInput}
            onChange={(event) => setTextInput(event.target.value)}
            maxLength={800}
            placeholder={
              realtime.isResponding
                ? 'Our agent is responding…'
                : showFileUpload
                  ? 'Optional note about your files…'
                  : realtime.status === 'connected'
                    ? 'Type a message…'
                    : realtime.status === 'error'
                      ? 'Voice disconnected — try again below'
                      : realtime.status === 'connecting'
                        ? 'Connecting…'
                        : 'Voice session ended'
            }
            disabled={
              realtime.status !== 'connected'
              || realtime.isResponding
              || Boolean(realtime.limitReason)
            }
            aria-label="Message our agent"
          />

          <button
            className="realtime-intake__send"
            type="submit"
            disabled={
              realtime.status !== 'connected'
              || realtime.isResponding
              || Boolean(realtime.limitReason)
              || (!textInput.trim() && !showFileUpload)
            }
            aria-label="Send message"
          >
            <ArrowUp aria-hidden="true" />
          </button>
        </form>
        </>
        )}

        {pendingFiles.length > 0 && !intakeSaved && (
          <div className="realtime-intake__pending-files" aria-label="Pending file attachments">
            {pendingFiles.map((file) => {
              const fileKey = `${file.name}:${file.size}:${file.lastModified}`
              return (
                <div className="realtime-intake__pending-file" key={fileKey}>
                  <Paperclip aria-hidden="true" />
                  <span title={file.name}>{file.name}</span>
                  <small>{Math.max(1, Math.round(file.size / 1024)).toLocaleString()} KB</small>
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => {
                      setPendingFiles((current) => current.filter(
                        (candidate) =>
                          `${candidate.name}:${candidate.size}:${candidate.lastModified}` !== fileKey,
                      ))
                    }}
                    aria-label={`Remove ${file.name}`}
                    title={`Remove ${file.name}`}
                  >
                    {isUploading
                      ? <LoaderCircle className="realtime-intake__spinner" aria-hidden="true" />
                      : <X aria-hidden="true" />}
                  </button>
                </div>
              )
            })}
            <p>
              {isUploading
                ? 'Uploading files securely…'
                : 'Files are pending and will upload after you sign in or create an account.'}
            </p>
          </div>
        )}

        {(uploadedFiles.length > 0 || uploadError || realtime.status === 'error') && (
          <div className="realtime-intake__footer-status">
          {uploadedFiles.length > 0 && (
            <p className="realtime-intake__upload-success">
              <Check aria-hidden="true" />
              {uploadedFiles.length === 1
                ? `${uploadedFiles[0]} attached`
                : `${uploadedFiles.length} files attached`}
            </p>
          )}
          {uploadError && <p className="realtime-intake__upload-error">{uploadError}</p>}
            {realtime.status === 'error' && realtime.supported && (
              <div className="realtime-intake__fallback-actions">
                <button
                  className="realtime-intake__fallback"
                  type="button"
                  onClick={continueByText}
                >
                  Continue by text
                </button>
                <button
                  className="realtime-intake__retry"
                  type="button"
                  onClick={() => void realtime.start()}
                >
                  Try voice again
                </button>
              </div>
            )}
          </div>
        )}
      </footer>
    </section>
  )
}

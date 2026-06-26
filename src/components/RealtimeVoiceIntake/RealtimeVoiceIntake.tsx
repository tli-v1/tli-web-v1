import { ArrowUp, Check, LoaderCircle, Mic, MicOff, Paperclip, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { addConversationalIntakeFile } from '../../agent/initialize'
import {
  getSession,
  signInWithApple,
  signInWithGoogle,
  signInWithPassword,
  signUp,
} from '../../api/auth'
import { useRealtimeVoice } from '../../hooks/useRealtimeVoice'
import { uploadConversationalIntakeFile } from '../../storage/fileUpload'
import type { User } from '../../types'
import SocialAuthButtons, {
  type SocialAuthProvider,
} from '../SocialAuthButtons/SocialAuthButtons'
import './RealtimeVoiceIntake.css'

interface RealtimeVoiceIntakeProps {
  onClose: () => void
}

type AuthMode = 'signin' | 'signup'

export default function RealtimeVoiceIntake({ onClose }: RealtimeVoiceIntakeProps) {
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
  const [authMode, setAuthMode] = useState<AuthMode>('signup')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [socialAuthLoading, setSocialAuthLoading] = useState<SocialAuthProvider | null>(null)
  const [intakeSaved, setIntakeSaved] = useState(false)
  const [showReadyTransition, setShowReadyTransition] = useState(false)

  const showFileUpload = useMemo(() => {
    const latestAssistantMessage = [...realtime.messages]
      .reverse()
      .find((message) => message.role === 'assistant')

    return Boolean(
      latestAssistantMessage
      && /\b(attach|document|evidence|file|photo|photograph|video|record|report|bill|receipt|contract|correspondence)\w*\b/i
        .test(latestAssistantMessage.content),
    )
  }, [realtime.messages])

  useEffect(() => {
    void realtime.start()
    // This session starts once when the microphone overlay opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [realtime.messages])

  useEffect(() => {
    if (!realtime.isIntakeComplete) return

    void getSession().then(async (user) => {
      if (!user || finalizingRef.current) return
      await finalizeIntake(user)
    })
    // finalizeIntake intentionally runs only when completion is first detected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtime.isIntakeComplete, realtime.claimSession])

  const close = () => {
    realtime.stop()
    onClose()
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
    if (realtime.sendTextMessage(textInput)) {
      setTextInput('')
    }
  }

  const uploadPendingFiles = async (user: User) => {
    if (!pendingFiles.length) return

    setIsUploading(true)
    setUploadError('')
    const sessionId = await realtime.ensureSession()
    const uploadedNames: string[] = []

    try {
      for (const file of pendingFiles) {
        const upload = await uploadConversationalIntakeFile({
          file,
          userId: user.id,
          intakeId: sessionId,
        })

        if (!upload.path) {
          throw new Error(upload.error || `Unable to upload ${file.name}.`)
        }

        await addConversationalIntakeFile(sessionId, {
          name: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
          storagePath: `conversational-intakes/${upload.path}`,
        })
        uploadedNames.push(file.name)
      }

      setUploadedFiles((current) => [...current, ...uploadedNames])
      setPendingFiles([])
    } finally {
      setIsUploading(false)
    }
  }

  const finalizeIntake = async (user: User) => {
    finalizingRef.current = true
    setAuthLoading(true)
    setAuthError('')

    try {
      await realtime.claimSession()
      await uploadPendingFiles(user)
      setIntakeSaved(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      setAuthError(
        message.includes('storage/')
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
    if (authPassword.length < 6) {
      setAuthError('Password must be at least 6 characters.')
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

      await finalizeIntake(response.user)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed.')
    } finally {
      setSocialAuthLoading(null)
      if (!finalizingRef.current) setAuthLoading(false)
    }
  }

  const selectPendingFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return

    setUploadError('')
    setPendingFiles((current) => {
      const existing = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`))
      return [
        ...current,
        ...files.filter((file) => !existing.has(`${file.name}:${file.size}:${file.lastModified}`)),
      ]
    })
    event.target.value = ''
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
            <p>Minerva is ready to start.</p>
          </div>
        ) : (
          <div className="realtime-intake__loading-content">
            <div className="realtime-intake__loading-mark" aria-hidden="true">
              <Mic />
            </div>
            <h2>Getting things ready for you!</h2>
            <p>Minerva will be with you in just a moment</p>
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
          <h2>Talk with Minerva</h2>
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
            className={`realtime-intake__message realtime-intake__message--${message.role}`}
          >
            <p>{message.content}</p>
          </article>
        ))}
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
                to="/dashboard"
                onClick={realtime.stop}
              >
                Go to dashboard
              </Link>
            </div>
          ) : (
            <form className="realtime-intake__auth" onSubmit={submitAuthentication}>
              <div className="realtime-intake__auth-heading">
                <div>
                  <h3>{authMode === 'signup' ? 'Create your account' : 'Sign in to save'}</h3>
                  <p>Your email stays private and is entered securely here.</p>
                  {pendingFiles.length > 0 && (
                    <p>
                      {pendingFiles.length} pending file{pendingFiles.length === 1 ? '' : 's'} will
                      upload after authentication.
                    </p>
                  )}
                </div>
                <div className="realtime-intake__auth-toggle">
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
                </div>
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
                <label>
                  <span>Password</span>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                    disabled={authLoading}
                    minLength={6}
                    required
                  />
                </label>
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
            {realtime.isMicrophoneMuted || realtime.status !== 'connected'
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
                onChange={selectPendingFiles}
                disabled={isUploading}
                aria-label="Choose files to attach"
              />
              <button
                className="realtime-intake__attach"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                aria-label="Attach files"
                title="Attach files"
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
                ? 'Minerva is responding…'
                : realtime.status === 'connected' ? 'Type a message…' : 'Connecting…'
            }
            disabled={
              realtime.status !== 'connected'
              || realtime.isResponding
              || Boolean(realtime.limitReason)
            }
            aria-label="Message Minerva"
          />

          <button
            className="realtime-intake__send"
            type="submit"
            disabled={
              realtime.status !== 'connected'
              || realtime.isResponding
              || Boolean(realtime.limitReason)
              || !textInput.trim()
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
              <button
                className="realtime-intake__retry"
                type="button"
                onClick={() => void realtime.start()}
              >
                Try again
              </button>
            )}
          </div>
        )}
      </footer>
    </section>
  )
}

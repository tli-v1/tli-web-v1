import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type WheelEvent,
} from 'react'
import {
  ArrowUp,
  LucideMaximize2,
  LucideMic,
  LucideMicOff,
  LucideMinimize2,
  Paperclip,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  applyIntakeAnswerAndAdvance,
  buildIntakeSummary,
  emptyChatIntakeDraft,
  getAllIntakeQuestions,
  getInitialIntakeQuestion,
  getIntakeQuestion,
  getNextIntakeStep,
  isIntakeRequest,
  type ChatIntakeDraft,
  type ChatIntakeStep,
} from '../../agent/intakeFlow'
import { preloadConversationalSpeech } from '../../api/speech'
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
import {
  createAuthenticatedConversationalIntakeSession,
  minervaModel,
  saveConversationalIntakeExchange,
  type ConversationalIntakeMessage,
  updateConversationalIntakeProcessing,
} from '../../agent/initialize'
import { processIntakeIntoCase } from '../../agent/processIntake'
import { isCaseIntakeRelevant, offTopicMessage } from '../../agent/relevance'
import { useSpeechOutput } from '../../hooks/useSpeechOutput'
import { useVoiceInput } from '../../hooks/useVoiceInput'
import { healthInformationNotice } from '../../intake/healthInformationNotice'
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
import './ChatWidget.css'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatWidgetProps {
  user: User | null
  initialMessage?: string
  variant?: 'embedded' | 'floating' | 'hero'
  intakeMode?: boolean
  voiceEnabled?: boolean
  onClose?: () => void
}

interface AttachedFile {
  name: string
  storagePath: string
}

const welcomeMessageId = 'minerva-welcome'
const defaultInitialMessage =
  "Hi, I'm your intake agent. Tell me what happened, and I can guide you through a conversational intake."

export function ChatWidget({
  user,
  initialMessage,
  variant = 'embedded',
  intakeMode = false,
  voiceEnabled = true,
  onClose,
}: ChatWidgetProps) {
  const startsInIntake = intakeMode
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(
    startsInIntake ? null : user,
  )
  const activeUser = authenticatedUser
  const [messages, setMessages] = useState<Message[]>([
    {
      id: welcomeMessageId,
      role: 'assistant',
      content: initialMessage || (startsInIntake ? getInitialIntakeQuestion() : defaultInitialMessage),
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isManualInput, setIsManualInput] = useState(false)
  const [isOpen, setIsOpen] = useState(variant !== 'floating')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isUploadingFiles, setIsUploadingFiles] = useState(false)
  const [isProcessingIntake, setIsProcessingIntake] = useState(false)
  const [awaitingProcessingSignIn, setAwaitingProcessingSignIn] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [socialAuthLoading, setSocialAuthLoading] = useState<SocialAuthProvider | null>(null)
  const [authError, setAuthError] = useState('')
  const [healthNoticeAccepted, setHealthNoticeAccepted] = useState(false)
  const [processedCaseId, setProcessedCaseId] = useState('')
  const [processingError, setProcessingError] = useState('')
  const [attachmentError, setAttachmentError] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  useEffect(() => {
    if (!awaitingProcessingSignIn || activeUser) return
    setAuthMode('signup')
    setAuthError('')
  }, [activeUser, awaitingProcessingSignIn])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [intakeDraft, setIntakeDraft] = useState<ChatIntakeDraft>(emptyChatIntakeDraft)
  const [intakeStep, setIntakeStep] = useState<ChatIntakeStep | null>(
    startsInIntake ? 'whatHappened' : null,
  )
  const messagesRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef('')
  const manualInputRef = useRef(false)
  const autoSubmitTimerRef = useRef<number | null>(null)
  const processingInFlightRef = useRef(false)
  const sendMessageRef = useRef<(content?: string) => void>(() => undefined)
  const speakRef = useRef<(content: string) => void>(() => undefined)
  const resumeListeningRef = useRef(false)

  useEffect(() => {
    if (!startsInIntake) setAuthenticatedUser(user)
  }, [startsInIntake, user])

  useEffect(() => {
    const messagesElement = messagesRef.current
    if (!messagesElement) return
    messagesElement.scrollTo({
      top: messagesElement.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages])

  const containMessageScroll = (event: WheelEvent<HTMLDivElement>) => {
    const element = event.currentTarget
    const atTop = element.scrollTop <= 0
    const atBottom =
      Math.ceil(element.scrollTop + element.clientHeight) >= element.scrollHeight

    event.stopPropagation()
    if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) {
      event.preventDefault()
    }
  }

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '44px'
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 44), 120)}px`
  }, [input])

  useEffect(() => {
    return () => {
      if (autoSubmitTimerRef.current !== null) {
        window.clearTimeout(autoSubmitTimerRef.current)
      }
    }
  }, [])

  const appendAssistantMessage = useCallback((content: string, spokenContent = content) => {
    const message: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content,
      timestamp: new Date(),
    }
    setMessages((current) => [...current, message])
    if (voiceEnabled) speakRef.current(spokenContent)
    return message
  }, [voiceEnabled])

  const voiceInput = useVoiceInput({
    onTranscript: useCallback((transcript: string) => {
      if (manualInputRef.current) return

      const nextInput = `${inputRef.current}${inputRef.current.trim() ? ' ' : ''}${transcript}`.trim()
      inputRef.current = nextInput
      setInput(nextInput)

      if (autoSubmitTimerRef.current !== null) {
        window.clearTimeout(autoSubmitTimerRef.current)
      }
      autoSubmitTimerRef.current = window.setTimeout(() => {
        autoSubmitTimerRef.current = null
        if (!manualInputRef.current) {
          sendMessageRef.current(inputRef.current)
        }
      }, 1200)
    }, []),
    onError: useCallback((message: string) => {
      appendAssistantMessage(message)
    }, [appendAssistantMessage]),
  })

  const speechOutput = useSpeechOutput({
    onStart: useCallback(() => {
      if (!voiceEnabled) return
      resumeListeningRef.current = voiceInput.enabled && !manualInputRef.current
      if (voiceInput.enabled) voiceInput.stop()
    }, [voiceEnabled, voiceInput]),
    onEnd: useCallback(() => {
      if (!voiceEnabled) return
      if (resumeListeningRef.current && !manualInputRef.current) {
        resumeListeningRef.current = false
        voiceInput.start()
      }
    }, [voiceEnabled, voiceInput]),
  })

  speakRef.current = voiceEnabled ? speechOutput.speak : () => undefined

  useEffect(() => {
    if (!voiceEnabled) return
    const welcomeMessage = messages.find((message) => message.id === welcomeMessageId)
    if (welcomeMessage) speechOutput.speak(welcomeMessage.content)
    getAllIntakeQuestions().forEach(preloadConversationalSpeech)
    // The welcome prompt should play once when the conversation opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persistExchange = useCallback(
    (
      userMessage: Message,
      assistantMessage: Message,
      intake?: { step: ChatIntakeStep; answer: string; complete: boolean },
    ) => {
      return saveConversationalIntakeExchange({
        sessionId,
        userId: activeUser?.id,
        userMessage: toConversationalIntakeMessage(userMessage),
        assistantMessage: toConversationalIntakeMessage(assistantMessage),
        intake,
      })
        .then((savedSessionId) => {
          setSessionId(savedSessionId)
          return savedSessionId
        })
        .catch((error) => console.warn('Unable to save intake conversation:', error))
    },
    [activeUser?.id, sessionId],
  )

  const processCompletedIntake = useCallback(async (
    completedDraft: ChatIntakeDraft,
    completedSessionId: string,
    processingUser: User,
  ) => {
    if (processingInFlightRef.current) return
    processingInFlightRef.current = true
    setIsProcessingIntake(true)
    setProcessingError('')
    setProcessedCaseId('')
    setAwaitingProcessingSignIn(false)
    let processingSessionIdForStatus: string | null = null

    try {
      const processingSessionId = await createAuthenticatedConversationalIntakeSession(
        completedSessionId,
      )
      processingSessionIdForStatus = processingSessionId
      setSessionId(processingSessionId)
      await updateConversationalIntakeProcessing(processingSessionId, {
        status: 'processing',
      })
      const processed = await processIntakeIntoCase({
        draft: completedDraft,
        files: attachedFiles,
        prepareFiles: async (caseId) => {
          if (pendingFiles.length === 0) return []

          setIsUploadingFiles(true)
          const uploadedPaths: string[] = []
          const uploadedFiles: AttachedFile[] = []
          try {
            for (const file of pendingFiles) {
              const upload = await uploadFile({
                bucket: 'case-docs',
                file,
                userId: processingUser.id,
                caseId,
              })
              if (upload.error || !upload.path) {
                throw new Error(upload.error || `Unable to upload ${file.name}.`)
              }

              uploadedPaths.push(upload.path)
              uploadedFiles.push({
                name: file.name,
                storagePath: `case-docs/${upload.path}`,
              })
            }
            setAttachedFiles((current) => [...current, ...uploadedFiles])
            setPendingFiles([])
            return uploadedFiles
          } catch (error) {
            if (uploadedPaths.length > 0) {
              await removeFiles('case-docs', uploadedPaths).catch(() => undefined)
            }
            throw error
          }
        },
        user: processingUser,
      })
      await updateConversationalIntakeProcessing(processingSessionId, {
        status: 'processed',
        structuredData: processed.structured,
        caseId: processed.caseId,
      })
      setProcessedCaseId(processed.caseId)
      appendAssistantMessage(
        'Your intake has been processed and added to your dashboard.',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process this intake.'
      setProcessingError(message)
      if (processingSessionIdForStatus) {
        await updateConversationalIntakeProcessing(processingSessionIdForStatus, {
          status: 'failed',
          error: message,
        }).catch(() => undefined)
      }
      appendAssistantMessage(
        `Your conversation is saved, but I could not finish creating the dashboard case: ${message}`,
      )
    } finally {
      processingInFlightRef.current = false
      setIsUploadingFiles(false)
      setIsProcessingIntake(false)
    }
  }, [appendAssistantMessage, attachedFiles, pendingFiles])

  useEffect(() => {
    if (
      !activeUser
      || !awaitingProcessingSignIn
      || !sessionId
      || getNextIntakeStep(intakeDraft) !== null
      || isProcessingIntake
    ) return

    void processCompletedIntake(intakeDraft, sessionId, activeUser)
  }, [
    awaitingProcessingSignIn,
    intakeDraft,
    isProcessingIntake,
    processCompletedIntake,
    sessionId,
    activeUser,
  ])

  const handleAttachFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return

    const existing = new Set(pendingFiles.map(
      (file) => `${file.name}:${file.size}:${file.lastModified}`,
    ))
    const nextFiles = [
      ...pendingFiles,
      ...files.filter(
        (file) => !existing.has(`${file.name}:${file.size}:${file.lastModified}`),
      ),
    ]

    try {
      await validateCaseFiles(nextFiles)
      setAttachmentError('')
      setPendingFiles(nextFiles)
    } catch (error) {
      setAttachmentError(
        error instanceof Error ? error.message : 'One or more attachments are not allowed.',
      )
    }
  }

  const handleInlineAuth = async (event: FormEvent<HTMLFormElement>) => {
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

      setAuthenticatedUser(response.user)
      appendAssistantMessage(
        authMode === 'signup'
          ? 'Your account is ready. I’m processing the intake for your dashboard now.'
          : 'You’re signed in. I’m processing the intake for your dashboard now.',
      )
      setAuthPassword('')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSocialAuth = async (provider: SocialAuthProvider) => {
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

      setAuthenticatedUser(response.user)
      appendAssistantMessage(
        'You’re signed in. I’m processing the intake for your dashboard now.',
      )
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed.')
    } finally {
      setSocialAuthLoading(null)
      setAuthLoading(false)
    }
  }

  const handleIntakeAnswer = async (
    userMessage: Message,
    activeStep: ChatIntakeStep,
  ) => {
    const result = applyIntakeAnswerAndAdvance(
      intakeDraft,
      activeStep,
      userMessage.content,
      {
        userEmail: activeUser?.email,
        attachedFileCount: attachedFiles.length + pendingFiles.length,
      },
    )

    if (!result.accepted) {
      const assistantMessage = appendAssistantMessage(
        result.message || getIntakeQuestion(activeStep),
      )
      persistExchange(userMessage, assistantMessage)
      return
    }

    setIntakeDraft(result.draft)
    const nextStep = getNextIntakeStep(result.draft)
    setIntakeStep(nextStep)

    const assistantContent = nextStep
      ? getIntakeQuestion(nextStep)
      : `${buildIntakeSummary(result.draft)}\n\nYour conversational intake has been saved. We can structure and review these details later without making you repeat the story.`
    const assistantMessage = appendAssistantMessage(
      assistantContent,
      nextStep
        ? assistantContent
        : 'Your conversational intake is complete and has been saved. We can review and structure the details later without making you repeat your story.',
    )

    const savedSessionId = await persistExchange(userMessage, assistantMessage, {
      step: activeStep,
      answer: userMessage.content,
      complete: nextStep === null,
    })

    if (nextStep === null && savedSessionId) {
      if (activeUser) {
        appendAssistantMessage(
          'I’m processing your intake now and preparing it for your dashboard.',
        )
        await processCompletedIntake(result.draft, savedSessionId, activeUser)
      } else {
        setAwaitingProcessingSignIn(true)
        appendAssistantMessage(
          'Your conversation is saved. Sign in or create an account below, and I’ll process it into a dashboard case.',
        )
      }
    }
  }

  const sendMessage = async (providedContent?: string) => {
    const content = (providedContent ?? inputRef.current).trim()
    if (!content || isLoading) return

    if (autoSubmitTimerRef.current !== null) {
      window.clearTimeout(autoSubmitTimerRef.current)
      autoSubmitTimerRef.current = null
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    inputRef.current = ''
    setInput('')

    const activeStep = intakeStep ?? (isIntakeRequest(content) ? 'whatHappened' : null)
    if (activeStep) {
      if (!intakeStep && /^(start|begin|create|submit)/i.test(content)) {
        setIntakeStep('whatHappened')
        const assistantMessage = appendAssistantMessage(getInitialIntakeQuestion())
        persistExchange(userMessage, assistantMessage)
        return
      }
      await handleIntakeAnswer(userMessage, activeStep)
      return
    }

    if (!isCaseIntakeRelevant(content)) {
      const assistantMessage = appendAssistantMessage(offTopicMessage)
      persistExchange(userMessage, assistantMessage)
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
      const result = await chat.sendMessage(content)
      const assistantMessage = appendAssistantMessage(
        result.response.text() || "I couldn't process that. Could you rephrase it?",
      )
      persistExchange(userMessage, assistantMessage)
    } catch (error) {
      console.error('Chat error:', error)
      appendAssistantMessage("I'm having trouble connecting right now. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  sendMessageRef.current = (content?: string) => {
    void sendMessage(content)
  }

  const close = () => {
    if (autoSubmitTimerRef.current !== null) {
      window.clearTimeout(autoSubmitTimerRef.current)
      autoSubmitTimerRef.current = null
    }
    voiceInput.stop()
    speechOutput.stop()
    setIsFullscreen(false)
    setIsOpen(false)
    onClose?.()
  }

  if (!isOpen && variant === 'floating') {
    return (
      <button className="chat-launcher" type="button" onClick={() => setIsOpen(true)}>
        Ask our agent
      </button>
    )
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const selectedFileCount = pendingFiles.length + attachedFiles.length
    if (
      intakeStep === 'documents'
      && healthNoticeAccepted
      && selectedFileCount > 0
      && !inputRef.current.trim()
    ) {
      void sendMessage(
        `${selectedFileCount} file${selectedFileCount === 1 ? '' : 's'} selected for submission.`,
      )
      return
    }
    if (!manualInputRef.current) return
    void sendMessage(inputRef.current)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (manualInputRef.current && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage(inputRef.current)
    }
  }

  const useManualInput = () => {
    manualInputRef.current = true
    setIsManualInput(true)
    if (autoSubmitTimerRef.current !== null) {
      window.clearTimeout(autoSubmitTimerRef.current)
      autoSubmitTimerRef.current = null
    }
    voiceInput.stop()
    speechOutput.stop()
  }

  const toggleVoiceInput = () => {
    if (!voiceEnabled) return
    manualInputRef.current = false
    setIsManualInput(false)
    speechOutput.stop()
    voiceInput.toggle()
  }

  return (
    <section
      className={`chat-widget chat-widget--${variant}${isFullscreen ? ' chat-widget--fullscreen' : ''}`}
      aria-label="Conversational legal intake"
    >
      <header className="chat-widget__header">
        <div>
          <h2>Share what happened</h2>
          <p>{voiceEnabled ? 'Conversational intake · voice or text' : 'Conversational intake · text only'}</p>
        </div>
        <div className="chat-widget__header-actions">
          {voiceEnabled && (
            <button
              type="button"
              onClick={speechOutput.toggleMuted}
              aria-label={speechOutput.muted ? 'Unmute our agent' : 'Mute our agent'}
              aria-pressed={speechOutput.muted}
              title={speechOutput.muted ? 'Turn voice responses on' : 'Turn voice responses off'}
            >
              {speechOutput.muted ? <VolumeX /> : <Volume2 />}
            </button>
          )}
          {voiceEnabled && (
            <button
              type="button"
              onClick={() => setIsFullscreen((current) => !current)}
              aria-label={isFullscreen ? 'Exit fullscreen chat' : 'Open fullscreen chat'}
            >
              {isFullscreen ? <LucideMinimize2 /> : <LucideMaximize2 />}
            </button>
          )}
          <button type="button" onClick={close} aria-label="Close chat">
            <X />
          </button>
        </div>
      </header>

      <div
        ref={messagesRef}
        className="chat-widget__messages"
        aria-live="polite"
        onWheel={containMessageScroll}
      >
        {messages.map((message) => (
          <article
            key={message.id}
            className={`chat-message chat-message--${message.role}`}
          >
            <p>{message.content}</p>
            <div className="chat-message__meta">
              <time>{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              {voiceEnabled && message.role === 'assistant' && message.id === messages.at(-1)?.id && speechOutput.supported && (
                <button type="button" onClick={() => speechOutput.speak(message.content)}>
                  {speechOutput.speaking ? 'Speaking…' : 'Replay'}
                </button>
              )}
            </div>
          </article>
        ))}
        {isLoading && <div className="chat-widget__typing">Thinking…</div>}
      </div>

      {awaitingProcessingSignIn && !activeUser && (
        <form className="chat-widget__auth" onSubmit={handleInlineAuth}>
          <div className="chat-widget__auth-toggle">
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
            onSelect={handleSocialAuth}
          />
          <div className="chat-widget__auth-fields">
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
            <button className="chat-widget__auth-submit" type="submit" disabled={authLoading}>
              {authLoading
                ? 'Please wait…'
                : authMode === 'signup'
                  ? 'Create account and process'
                  : 'Sign in and process'}
            </button>
          </div>
          {authError && <p className="chat-widget__auth-error">{authError}</p>}
        </form>
      )}

      {(isProcessingIntake || processedCaseId || processingError) && (
        <section className="chat-widget__case-status" aria-live="polite">
          {isProcessingIntake && (
            <div className="processing-card">
              <div className="processing-card__spinner" aria-hidden="true" />
              <div>
                <p className="processing-card__eyebrow">Preparing your case</p>
                <h3>Turning your conversation into a dashboard case</h3>
                <p>We’re organizing the incident, location, parties, damages, contact details, and documents.</p>
              </div>
              <div className="processing-card__steps">
                <span className="is-complete">Conversation saved</span>
                <span className="is-active">Structuring details</span>
                <span>Creating dashboard case</span>
              </div>
            </div>
          )}

          {!isProcessingIntake && processedCaseId && (
            <Link
              className="case-ready-card__button"
              to={`/dashboard/cases/${processedCaseId}`}
            >
              Go to your case
            </Link>
          )}

          {!isProcessingIntake && processingError && (
            <div className="processing-error-card">
              <h3>Your conversation is safe</h3>
              <p>We could not finish creating the dashboard case. You can retry without repeating the intake.</p>
              <button
                type="button"
                onClick={() => {
                  if (activeUser && sessionId) {
                    void processCompletedIntake(intakeDraft, sessionId, activeUser)
                  }
                }}
              >
                Retry processing
              </button>
            </div>
          )}
        </section>
      )}

      {(!startsInIntake || getNextIntakeStep(intakeDraft) !== null) && (
      <form className="chat-widget__composer" onSubmit={handleSubmit}>
        {intakeStep === 'documents' && (
          <div className="chat-widget__document-step">
            <div className="health-information-notice">
              <div>
                <strong>Health information notice</strong>
                <p>{healthInformationNotice}</p>
              </div>
              {voiceEnabled && (
                <button
                  type="button"
                  onClick={() => speechOutput.speak(healthInformationNotice)}
                >
                  Hear notice
                </button>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={healthNoticeAccepted}
                  onChange={(event) => setHealthNoticeAccepted(event.target.checked)}
                />
                <span>I understand and authorize this storage and limited sharing.</span>
              </label>
            </div>
            <div className="chat-widget__attachments">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_CASE_FILE_TYPES}
                onChange={handleAttachFiles}
                hidden
              />
              <button
                type="button"
                className="chat-widget__attach"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingFiles || !healthNoticeAccepted}
              >
                <Paperclip aria-hidden="true" />
                {isUploadingFiles ? 'Uploading…' : 'Add file'}
              </button>
              {(pendingFiles.length > 0 || attachedFiles.length > 0) && (
                <span>
                  {pendingFiles.length > 0
                    ? `${pendingFiles.length} file${pendingFiles.length === 1 ? '' : 's'} selected · submitted after sign-in`
                    : `${attachedFiles.length} file${attachedFiles.length === 1 ? '' : 's'} attached`}
                </span>
              )}
            </div>
            {attachmentError && <p className="chat-widget__attachment-error">{attachmentError}</p>}
          </div>
        )}
        {voiceEnabled && (
          <button
            className={voiceInput.enabled ? 'chat-widget__voice is-listening' : 'chat-widget__voice'}
            type="button"
            onClick={toggleVoiceInput}
            disabled={!voiceInput.supported || isLoading || isProcessingIntake}
            aria-label={voiceInput.enabled ? 'Stop voice input' : 'Start voice input'}
            aria-pressed={voiceInput.enabled}
            title={voiceInput.supported ? 'Dictate your answer' : 'Voice input requires Chrome or Edge'}
          >
            {voiceInput.enabled ? <LucideMicOff /> : <LucideMic />}
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => {
            useManualInput()
            inputRef.current = event.target.value
            setInput(event.target.value)
          }}
          onClick={useManualInput}
          onFocus={useManualInput}
          onKeyDown={handleKeyDown}
          placeholder={
            intakeStep === 'documents'
              ? 'Optional note about your files…'
              : voiceEnabled && voiceInput.listening
              ? 'Listening — pause to send…'
              : 'Type your answer…'
          }
          disabled={isLoading || isProcessingIntake}
          rows={1}
        />
        <button
          className="chat-widget__send"
          type="submit"
          disabled={
            isLoading
            || isProcessingIntake
            || (
              intakeStep === 'documents'
                ? !input.trim() && (
                    !healthNoticeAccepted
                    || pendingFiles.length + attachedFiles.length === 0
                  )
                : !isManualInput || !input.trim()
            )
          }
        >
          <span>Send</span>
          <ArrowUp aria-hidden="true" />
        </button>
      </form>
      )}
    </section>
  )
}

function toConversationalIntakeMessage(message: Message): ConversationalIntakeMessage {
  return {
    role: message.role,
    content: message.content,
  }
}

export type IntakeFieldDataType =
  | 'boolean'
  | 'currency'
  | 'date'
  | 'email'
  | 'file'
  | 'integer'
  | 'phone'
  | 'string'

export type IntakeFieldInputType =
  | 'checkbox'
  | 'computed'
  | 'date'
  | 'email'
  | 'file'
  | 'number'
  | 'select'
  | 'state'
  | 'tel'
  | 'text'
  | 'textarea'

export interface IntakeFieldOption {
  label: string
  value: string
}

export interface IntakeFieldValidation {
  accept?: string[]
  max?: 'today' | number
  maxLength?: number
  min?: number
  minLength?: number
  required?: boolean
  requiredWhenSignedOut?: boolean
  step?: number
}

export interface IntakeField {
  id: string
  label: string
  dataType: IntakeFieldDataType
  inputType: IntakeFieldInputType
  defaultValue?: string | boolean | null
  placeholder?: string
  helpText?: string
  hint?: string
  options?: IntakeFieldOption[]
  validation?: IntakeFieldValidation
  rows?: number
  readOnly?: boolean
  computedFrom?: string[]
  storageKind?: string
  legalText?: string
}

export interface IntakeSection {
  id: string
  name: string
  title: string
  description: string
  fields: IntakeField[]
}

export interface IntakeChatStep {
  id: string
  fieldIds: string[]
  prompt: string
  required: boolean
}

export interface IntakeFormSchema {
  version: number
  initialValues: Record<string, string | boolean | null>
  sections: IntakeSection[]
  chatSteps: IntakeChatStep[]
}

export const intakeFormSchema = {
  version: 1,
  initialValues: {
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
    lostWages: '',
    fullName: '',
    preferredContact: 'email',
    email: '',
    phone: '',
    consentProcess: false,
    consentContact: false,
  },
  sections: [
    {
      id: 'incidentBasics',
      name: 'Incident basics',
      title: 'Tell us what happened',
      description: 'Capture the essential facts so we understand the event and when it occurred.',
      fields: [
        {
          id: 'whatHappened',
          label: 'What happened? (1-3 sentences)',
          dataType: 'string',
          inputType: 'textarea',
          placeholder: 'Briefly describe the incident...',
          rows: 4,
          validation: { required: true, minLength: 25 },
        },
        {
          id: 'incidentDate',
          label: 'Incident date',
          dataType: 'date',
          inputType: 'date',
          validation: { required: true, max: 'today' },
        },
        {
          id: 'city',
          label: 'City',
          dataType: 'string',
          inputType: 'text',
          placeholder: 'e.g., Los Angeles',
          validation: { required: true },
        },
        {
          id: 'state',
          label: 'State',
          dataType: 'string',
          inputType: 'state',
          placeholder: 'e.g., CA',
          validation: { required: true, maxLength: 2 },
        },
      ],
    },
    {
      id: 'parties',
      name: 'Parties',
      title: 'Insurance Information (Optional)',
      description: 'Share any insurance information you have',
      fields: [
        {
          id: 'adverseParty',
          label: 'Adverse person or company (optional)',
          dataType: 'string',
          inputType: 'text',
          placeholder: 'Name of the opposing party, or leave blank if unknown',
          helpText:
            'This is the other driver or business involved in your accident. Fill this out if someone else caused the crash, or leave it blank if you do not have their details.',
          hint: 'If you do not know who the opposing party is yet, leave this blank.',
        },
        {
          id: 'insurerName',
          label: 'Insurer name (optional)',
          dataType: 'string',
          inputType: 'text',
          placeholder: 'Carrier name if known',
          helpText:
            "This is the name of the insurance company covering other person/company's vehicle. Enter the other driver's insurance provider here, or leave it blank if they are uninsured or fled the scene.",
        },
        {
          id: 'policyNumber',
          label: 'Policy number (optional)',
          dataType: 'string',
          inputType: 'text',
          placeholder: 'Policy #',
          helpText: 'The permanent account number on your insurance card that proves you have active coverage.',
        },
        {
          id: 'claimNumber',
          label: 'Claim number (optional)',
          dataType: 'string',
          inputType: 'text',
          placeholder: 'Claim # if assigned',
          helpText: 'The unique tracking number assigned after you report a specific accident.',
        },
      ],
    },
    {
      id: 'documents',
      name: 'Documents',
      title: 'Supporting documents',
      description:
        'Upload what you have and authorize TLI to use your submitted information for attorney matching.',
      fields: [
        {
          id: 'policeReportFile',
          label: 'Police or incident report',
          dataType: 'file',
          inputType: 'file',
          storageKind: 'police_report',
          validation: { accept: ['.pdf', '.jpg', '.jpeg', '.png'] },
        },
        {
          id: 'incidentPhotosFile',
          label: 'Photos (zip or image)',
          dataType: 'file',
          inputType: 'file',
          storageKind: 'incident_photo',
          validation: { accept: ['.zip', '.pdf', '.jpg', '.jpeg', '.png'] },
        },
        {
          id: 'medicalSummaryFile',
          label: 'ER bill or visit summary',
          dataType: 'file',
          inputType: 'file',
          storageKind: 'medical_summary',
          validation: { accept: ['.pdf', '.jpg', '.jpeg', '.png'] },
        },
        {
          id: 'authorizeDocuments',
          label:
            'I authorize TLI to receive, organize, and share the information I submit for attorney matching purposes.',
          dataType: 'boolean',
          inputType: 'checkbox',
          validation: { required: true },
          legalText:
            'By checking this box, I authorize True Legal Innovations, LLC ("TLI") to receive, organize, and share with participating licensed attorneys the information I voluntarily submit through this platform, solely for the purpose of facilitating an attorney match. I understand that TLI is not acting as my legal representative, that this authorization does not create an attorney-client relationship with TLI, and that TLI will not contact third parties or obtain records on my behalf. This authorization may be revoked at any time by contacting TLI directly.',
        },
      ],
    },
    {
      id: 'damages',
      name: 'Damages',
      title: 'Damages to date',
      description: 'Rough numbers help us scope exposure and prioritize next steps.',
      fields: [
        {
          id: 'medicalBills',
          label: 'Medical bills to date in USD (optional)',
          dataType: 'currency',
          inputType: 'number',
          placeholder: 'e.g., 1500',
          validation: { min: 0, step: 0.01 },
        },
        {
          id: 'daysMissed',
          label: 'Days missed from work',
          dataType: 'integer',
          inputType: 'number',
          placeholder: '0 if none',
          validation: { min: 0 },
        },
        {
          id: 'hourlyRate',
          label: 'Hourly rate (USD)',
          dataType: 'currency',
          inputType: 'number',
          placeholder: 'Your approximate hourly rate',
          validation: { min: 0, step: 0.01 },
        },
        {
          id: 'lostWages',
          label: 'Rough lost wages (auto-calculated)',
          dataType: 'currency',
          inputType: 'computed',
          readOnly: true,
          computedFrom: ['daysMissed', 'hourlyRate'],
        },
      ],
    },
    {
      id: 'contactConsent',
      name: 'Contact & consent',
      title: 'How should we reach you?',
      description: 'Provide your preferred contact details and confirm we can store your information.',
      fields: [
        {
          id: 'fullName',
          label: 'Full name',
          dataType: 'string',
          inputType: 'text',
          placeholder: 'Your legal name',
          validation: { requiredWhenSignedOut: true },
        },
        {
          id: 'preferredContact',
          label: 'Preferred contact method',
          dataType: 'string',
          inputType: 'select',
          options: [
            { value: 'email', label: 'Email' },
            { value: 'phone', label: 'Phone call' },
            { value: 'text', label: 'Text message' },
          ],
        },
        {
          id: 'phone',
          label: 'Phone (optional)',
          dataType: 'phone',
          inputType: 'tel',
          placeholder: '(555) 123-4567',
        },
        {
          id: 'email',
          label: 'Email',
          dataType: 'email',
          inputType: 'email',
          placeholder: 'you@email.com',
          validation: { requiredWhenSignedOut: true },
        },
        {
          id: 'consentProcess',
          label: 'I consent to True Legal storing and processing my information for this review.',
          dataType: 'boolean',
          inputType: 'checkbox',
          validation: { required: true },
        },
        {
          id: 'consentContact',
          label: 'Okay to contact me for additional questions or case review.',
          dataType: 'boolean',
          inputType: 'checkbox',
        },
      ],
    },
  ],
  chatSteps: [
    {
      id: 'whatHappened',
      fieldIds: ['whatHappened'],
      prompt: "Tell me what happened. We're here for you, and you can share as much or as little as feels comfortable.",
      required: true,
    },
    {
      id: 'incidentDate',
      fieldIds: ['incidentDate'],
      prompt: 'About when did this happen? An exact date is helpful, but an approximate date or timeframe is okay.',
      required: true,
    },
    {
      id: 'location',
      fieldIds: ['city', 'state'],
      prompt: 'Where did this happen? You can share a city and state, an address, or whatever location details you know.',
      required: true,
    },
    {
      id: 'adverseParty',
      fieldIds: ['adverseParty'],
      prompt: 'Who else was involved? Share any people, businesses, agencies, or organizations you remember. It is okay to say you do not know.',
      required: true,
    },
    {
      id: 'insurerInfo',
      fieldIds: ['insurerName', 'policyNumber', 'claimNumber'],
      prompt: 'Do you have any insurance, policy, or claim information? Share whatever you have, or say you do not have it yet.',
      required: true,
    },
    {
      id: 'documents',
      fieldIds: ['authorizeDocuments', 'policeReportFile', 'incidentPhotosFile', 'medicalSummaryFile'],
      prompt:
        'Do you have documents or photos related to this matter? Tell me what you have. Also say whether you authorize True Legal Innovations to organize and share what you submit with participating attorneys for matching.',
      required: true,
    },
    {
      id: 'damages',
      fieldIds: ['medicalBills', 'daysMissed', 'hourlyRate'],
      prompt:
        'How has this affected you so far? Include injuries, treatment, expenses, property damage, missed work, lost income, or other impacts. Estimates are fine.',
      required: true,
    },
    {
      id: 'contact',
      fieldIds: ['fullName', 'preferredContact', 'email', 'phone'],
      prompt: 'What is your name, and how should we contact you? Share an email, phone number, and whether you prefer email, call, or text.',
      required: true,
    },
    {
      id: 'consent',
      fieldIds: ['consentProcess', 'consentContact'],
      prompt: 'Do you consent to True Legal storing this intake and contacting you about it? Reply yes or no.',
      required: true,
    },
  ],
} as const satisfies IntakeFormSchema

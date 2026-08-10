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
  version: 3,
  initialValues: {
    whatHappened: '',
    incidentDate: '',
    city: '',
    state: '',
    locationDetails: '',
    adverseParty: '',
    insurerName: '',
    policyNumber: '',
    claimNumber: '',
    caseFiles: '',
    authorizeDocuments: false,
    injuries: '',
    treatment: '',
    emotionalImpact: '',
    otherDamages: '',
    damageDetails: '',
    medicalBills: '',
    propertyDamage: '',
    otherExpenses: '',
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
        {
          id: 'locationDetails',
          label: 'Address, intersection, building, or nearby landmark (optional)',
          dataType: 'string',
          inputType: 'text',
          placeholder: 'e.g., Main St and 5th Ave, near City Hall',
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
          id: 'caseFiles',
          label: 'Files',
          dataType: 'file',
          inputType: 'file',
          storageKind: 'other',
          validation: {
            accept: ['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif', '.doc', '.docx', '.txt'],
          },
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
          id: 'injuries',
          label: 'Injuries',
          dataType: 'string',
          inputType: 'textarea',
          placeholder: 'Describe any injuries, symptoms, or diagnoses.',
        },
        {
          id: 'treatment',
          label: 'Treatment',
          dataType: 'string',
          inputType: 'textarea',
          placeholder: 'Describe care received or planned treatment.',
        },
        {
          id: 'emotionalImpact',
          label: 'Emotional impact',
          dataType: 'string',
          inputType: 'textarea',
          placeholder: 'Describe stress, anxiety, or other emotional effects.',
        },
        {
          id: 'otherDamages',
          label: 'Other losses or damages',
          dataType: 'string',
          inputType: 'textarea',
          placeholder: 'Describe any other impact.',
        },
        {
          id: 'damageDetails',
          label: 'Additional impact details',
          dataType: 'string',
          inputType: 'textarea',
          placeholder: 'Add any context or details not captured above.',
        },
        {
          id: 'medicalBills',
          label: 'Medical bills to date in USD (optional)',
          dataType: 'currency',
          inputType: 'number',
          placeholder: 'e.g., 1500',
          validation: { min: 0, step: 0.01 },
        },
        {
          id: 'propertyDamage',
          label: 'Property damage in USD (optional)',
          dataType: 'currency',
          inputType: 'number',
          placeholder: 'Vehicle or other property damage',
          validation: { min: 0, step: 0.01 },
        },
        {
          id: 'otherExpenses',
          label: 'Other out-of-pocket expenses in USD (optional)',
          dataType: 'currency',
          inputType: 'number',
          placeholder: 'Transportation, rentals, or other costs',
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
      prompt: 'What happened? Share the basic story in a few sentences.',
      required: true,
    },
    {
      id: 'location',
      fieldIds: ['city', 'state', 'locationDetails'],
      prompt: 'Where did it happen? City and state are enough for now.',
      required: true,
    },
  ],
} as const satisfies IntakeFormSchema

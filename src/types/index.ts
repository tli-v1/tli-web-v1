export interface User {
  id: string;
  email: string;
  created_at?: string;
}

export interface Session {
  user: User;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  error: AuthError | null;
}

export interface AuthError {
  message: string;
  code?: string;
}

export interface UserProfile {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
}

export interface Case {
  id: string;
  user_id: string;
  status: string;
  consent_store: boolean;
  consent_contact: boolean;
  consent_at: string;
  created_at: string;
  updated_at: string;
}

export interface CaseSummary {
  case_id: string;
  status: string;
  created_at: string;
  city: string;
  state: string;
  doc_count: number;
  agreement_count: number;
}

export interface CasePage {
  cases: CaseSummary[];
  total: number;
}

export interface Incident {
  id?: string;
  case_id: string;
  city: string;
  state_code: string;
  location_details?: string;
  incident_date: string | null;
  description: string;
  created_at?: string;
}

export interface Damages {
  id?: string;
  case_id: string;
  injuries: string;
  treatment: string;
  medical_expenses: number | null;
  property_damage: number | null;
  other_expenses: number | null;
  lost_wages: number | null;
  pain_suffering: string | null;
  other_damages: string | null;
  medical_bills_usd: number | null;
  property_damage_usd?: number | null;
  other_expenses_usd?: number | null;
  days_missed: number | null;
  hourly_rate_usd: number | null;
  lost_wages_usd: number | null;
  emotional_impact: string;
  details: string;
  created_at?: string;
}

export interface CaseContact {
  id?: string;
  case_id: string;
  preferred_contact_method: string | null;
  best_time_to_call: string | null;
  full_name?: string;
  method?: string;
  email?: string;
  phone?: string;
  created_at?: string;
}

export interface Party {
  id?: string;
  case_id: string;
  party_type: string;
  full_name: string;
  contact_info: string | null;
  role?: string;
  name?: string;
  insurer_name?: string;
  policy_number?: string;
  claim_number?: string;
  created_at?: string;
}

export interface Document {
  id?: string;
  case_id: string;
  file_name: string;
  storage_path: string;
  public_url: string | null;
  content_type: string;
  file_size: number;
  uploaded_at: string;
  kind?: string;
  original_filename?: string;
  uploaded_by?: string;
  notes?: string;
}

export interface AgreementFile {
  id: string;
  agreement_id: string;
  file_name: string;
  storage_path: string;
  public_url: string | null;
  content_type: string;
  file_size: number;
  created_at: string;
}

export interface LawyerClientAgreement {
  id: string;
  case_id: string;
  lawyer_id: string;
  message: string | null;
  created_at: string;
  updated_at: string;
  lawyer_client_agreement_file?: AgreementFile[];
}

export interface CaseDetails {
  summary: {
    case_id: string;
    city: string;
    state: string;
    incident_date: string | null;
    description: string;
    status: string;
    created_at: string;
    updated_at: string;
    consent_store: boolean;
    consent_contact: boolean;
    consent_at: string;
  } | null;
  incident: Incident | null;
  damages: Damages | null;
  contact: CaseContact | null;
  parties: Party[];
  documents: Document[];
  agreements: LawyerClientAgreement[];
  caseInfo: Case | null;
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface FileUploadParams {
  bucket?: string;
  file: File;
  userId: string;
  caseId: string;
}

export interface FileUploadResponse {
  path: string | null;
  error: string | null;
}

export interface SignedUrlResponse {
  url: string | null;
  error: string | null;
}

export interface SecureObjectUrlResponse {
  url: string | null;
  error: string | null;
}

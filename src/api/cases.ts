import {
  getCaseDetails as getDataConnectCaseDetails,
  getUserCases as getDataConnectUserCases,
  type GetCaseDetailsData,
  type GetUserCasesData,
} from '@dataconnect/generated';
import type { ApiResponse, CaseDetails, CaseSummary } from '../types';

type DataConnectCase = NonNullable<GetCaseDetailsData['case']>;
type DataConnectCaseListItem = GetUserCasesData['cases'][number];
type DataConnectIncident = DataConnectCase['caseDetailIncidents'][number];
type DataConnectDamage = NonNullable<DataConnectCase['damage_on_case']>;
type DataConnectContact = NonNullable<DataConnectCase['caseContact_on_case']>;
type DataConnectParty = DataConnectCase['parties_on_case'][number];
type DataConnectDocument = DataConnectCase['caseDetailDocuments'][number];
type DataConnectAgreement = DataConnectCase['caseDetailAgreements'][number];
type DataConnectAgreementFile = DataConnectAgreement['lawyerClientAgreementFiles_on_agreement'][number];

const roundToCents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function getUserCases(_userId: string): Promise<ApiResponse<CaseSummary[]>> {
  try {
    const response = await getDataConnectUserCases();
    const mapped = (response.data.cases || []).map(mapCaseSummary);

    return {
      data: mapped,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch cases';
    return {
      data: [],
      error: message,
    };
  }
}

export async function getCaseDetails(caseId: string): Promise<ApiResponse<CaseDetails>> {
  try {
    const response = await getDataConnectCaseDetails({ caseId });
    const caseRecord = response.data.case;

    if (!caseRecord) {
      return {
        data: null,
        error: 'Unable to load case details.',
      };
    }

    const incidents = caseRecord.caseDetailIncidents || [];
    const parties = caseRecord.parties_on_case || [];
    const documents = caseRecord.caseDetailDocuments || [];
    const agreements = caseRecord.caseDetailAgreements || [];
    const incident = incidents[0] ?? null;
    const mappedIncident = incident ? mapIncident(incident) : null;
    const mappedCaseInfo = mapCaseInfo(caseRecord);

    return {
      data: {
        summary: {
          case_id: caseRecord.id,
          city: incident?.city ?? '',
          state: incident?.stateCode ?? '',
          incident_date: incident?.incidentDate ?? null,
          description: incident?.description ?? '',
          status: caseRecord.status,
          created_at: caseRecord.createdAt,
          updated_at: caseRecord.updatedAt,
          consent_store: caseRecord.consentStore ?? false,
          consent_contact: caseRecord.consentContact ?? false,
          consent_at: caseRecord.consentAt ?? '',
        },
        incident: mappedIncident,
        damages: caseRecord.damage_on_case ? mapDamage(caseRecord.damage_on_case) : null,
        contact: caseRecord.caseContact_on_case ? mapContact(caseRecord.caseContact_on_case) : null,
        parties: parties.map(mapParty),
        documents: documents.map(mapDocument),
        agreements: agreements.map(mapAgreement),
        caseInfo: mappedCaseInfo,
      },
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch case details';
    return {
      data: null,
      error: message,
    };
  }
}

function mapCaseSummary(item: DataConnectCaseListItem): CaseSummary {
  const incident = (item.caseListIncidents || [])[0];

  return {
    case_id: item.id,
    status: item.status,
    created_at: item.createdAt,
    city: incident?.city ?? '',
    state: incident?.stateCode ?? '',
    doc_count: (item.caseListDocuments || []).length,
    agreement_count: (item.caseListAgreements || []).length,
  };
}

function mapCaseInfo(item: DataConnectCase) {
  return {
    id: item.id,
    user_id: item.userId,
    status: item.status,
    consent_store: item.consentStore ?? false,
    consent_contact: item.consentContact ?? false,
    consent_at: item.consentAt ?? '',
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function mapIncident(item: DataConnectIncident) {
  return {
    id: item.id,
    case_id: item.caseId,
    city: item.city ?? '',
    state_code: item.stateCode ?? '',
    incident_date: item.incidentDate ?? null,
    description: item.description,
    created_at: item.createdAt,
  };
}

function mapDamage(item: DataConnectDamage) {
  const lostWages = roundCurrencyValue(item.lostWagesUsd) ?? calculateLostWages(item.daysMissed, item.hourlyRateUsd);

  return {
    case_id: item.caseId,
    medical_expenses: roundCurrencyValue(item.medicalBillsUsd),
    property_damage: null,
    lost_wages: lostWages,
    pain_suffering: null,
    other_damages: null,
    medical_bills_usd: roundCurrencyValue(item.medicalBillsUsd),
    days_missed: item.daysMissed ?? null,
    hourly_rate_usd: roundCurrencyValue(item.hourlyRateUsd),
    lost_wages_usd: lostWages,
  };
}

function mapContact(item: DataConnectContact) {
  return {
    case_id: item.caseId,
    preferred_contact_method: item.method.toLowerCase(),
    best_time_to_call: null,
    full_name: item.fullName ?? '',
    method: item.method.toLowerCase(),
    email: item.email ?? '',
    phone: item.phone ?? '',
  };
}

function mapParty(item: DataConnectParty) {
  return {
    id: item.id,
    case_id: item.caseId,
    party_type: item.role.toLowerCase(),
    full_name: item.name,
    contact_info: null,
    created_at: item.createdAt,
    role: item.role.toLowerCase(),
    name: item.name,
    insurer_name: item.insurerName ?? '',
    policy_number: item.policyNumber ?? '',
    claim_number: item.claimNumber ?? '',
  };
}

function mapDocument(item: DataConnectDocument) {
  return {
    id: item.id,
    case_id: item.caseId,
    file_name: item.originalFilename ?? 'Uploaded file',
    storage_path: item.storagePath ?? '',
    public_url: null,
    content_type: '',
    file_size: 0,
    uploaded_at: item.uploadedAt,
    kind: mapDocKind(item.kind),
    original_filename: item.originalFilename ?? 'Uploaded file',
    uploaded_by: item.uploadedBy,
    notes: item.notes ?? '',
  };
}

function mapAgreement(item: DataConnectAgreement) {
  return {
    id: item.id,
    case_id: item.caseId,
    lawyer_id: item.lawyerId,
    message: item.message ?? null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    lawyer_client_agreement_file: (item.lawyerClientAgreementFiles_on_agreement || []).map(mapAgreementFile),
  };
}

function mapAgreementFile(item: DataConnectAgreementFile) {
  return {
    id: item.id,
    agreement_id: item.agreementId,
    file_name: item.fileName,
    storage_path: item.storagePath,
    public_url: item.publicUrl ?? null,
    content_type: item.contentType ?? '',
    file_size: item.fileSize ?? 0,
    created_at: item.createdAt,
  };
}

function mapDocKind(kind: string): string {
  const map: Record<string, string> = {
    MEDICAL_BILL: 'er_bill',
    POLICE_REPORT: 'police_report',
    PHOTO: 'photos',
    OTHER: 'other',
  };

  return map[kind] ?? kind.toLowerCase();
}

function calculateLostWages(daysMissed?: number | null, hourlyRateUsd?: number | null): number | null {
  if (daysMissed == null || hourlyRateUsd == null) {
    return null;
  }

  return roundToCents(daysMissed * 8 * hourlyRateUsd);
}

function roundCurrencyValue(value?: number | null): number | null {
  return value == null ? null : roundToCents(value);
}

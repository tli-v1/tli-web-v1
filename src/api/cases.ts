import {
  CaseStatus,
  ContactMethod,
  DocKind,
  PartyRole,
  getCaseDetails as getDataConnectCaseDetails,
  getUserCases as getDataConnectUserCases,
  createParty as createDataConnectParty,
  deleteDocument as deleteDataConnectDocument,
  deleteParty as deleteDataConnectParty,
  updateCase as updateDataConnectCase,
  updateCaseContact as updateDataConnectCaseContact,
  updateDamages as updateDataConnectDamages,
  updateDocument as updateDataConnectDocument,
  updateIncident as updateDataConnectIncident,
  updateParty as updateDataConnectParty,
  type GetCaseDetailsData,
  type GetUserCasesData,
} from '@dataconnect/generated';
import { QueryFetchPolicy } from 'firebase/data-connect';
import type { ApiResponse, CaseDetails, CasePage, CaseSummary } from '../types';

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

export interface CaseEditPayload {
  caseId: string;
  status: string;
  consentStore: boolean;
  consentContact: boolean;
  incident: {
    id: string;
    description: string;
    incidentDate: string;
    city: string;
    stateCode: string;
    locationDetails: string;
  };
  damages: {
    injuries: string;
    treatment: string;
    medicalBillsUsd: string;
    propertyDamageUsd: string;
    otherExpensesUsd: string;
    daysMissed: string;
    hourlyRateUsd: string;
    lostWagesUsd: string;
    emotionalImpact: string;
    otherDamages: string;
    details: string;
  };
  contact: {
    fullName: string;
    method: string;
    email: string;
    phone: string;
  };
  parties: Array<{
    id: string;
    role: string;
    name: string;
    insurerName: string;
    policyNumber: string;
    claimNumber: string;
  }>;
  documents: Array<{
    id: string;
    kind: string;
    originalFilename: string;
    notes: string;
  }>;
  deletedPartyIds: string[];
  deletedDocumentIds: string[];
}

export async function getUserCases(
  _userId: string,
  page: number,
  pageSize: number,
): Promise<ApiResponse<CasePage>> {
  try {
    const response = await getDataConnectUserCases({
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }, {
      fetchPolicy: QueryFetchPolicy.SERVER_ONLY,
    });
    const returnedCases = response.data.cases || [];
    const caseCount = response.data.caseCount?.[0]?._count;
    const pageCases = caseCount === undefined
      ? returnedCases.slice((page - 1) * pageSize, page * pageSize)
      : returnedCases;
    const mapped = pageCases.map(mapCaseSummary);

    return {
      data: {
        cases: mapped,
        total: caseCount ?? returnedCases.length,
      },
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch cases';
    return {
      data: null,
      error: message,
    };
  }
}

export async function getCaseDetails(caseId: string): Promise<ApiResponse<CaseDetails>> {
  try {
    const response = await getDataConnectCaseDetails(
      { caseId },
      { fetchPolicy: QueryFetchPolicy.SERVER_ONLY },
    );
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

export async function updateCaseDetails(
  payload: CaseEditPayload,
): Promise<{ error: string | null }> {
  const incidentDate = payload.incident.incidentDate.trim();
  if (!payload.incident.id || !incidentDate) {
    return { error: 'An incident and incident date are required.' };
  }

  try {
    await Promise.all([
      updateDataConnectCase({
        caseId: payload.caseId,
        status: caseStatusFor(payload.status),
        consentStore: payload.consentStore,
        consentContact: payload.consentContact,
      }),
      updateDataConnectIncident({
        caseId: payload.caseId,
        incidentId: payload.incident.id,
        description: payload.incident.description.trim(),
        incidentDate,
        city: nullableText(payload.incident.city),
        stateCode: nullableText(payload.incident.stateCode)?.toUpperCase() ?? null,
        locationDetails: nullableText(payload.incident.locationDetails),
      }),
      updateDataConnectDamages({
        caseId: payload.caseId,
        injuries: nullableText(payload.damages.injuries),
        treatment: nullableText(payload.damages.treatment),
        medicalBillsUsd: nullableNumber(payload.damages.medicalBillsUsd),
        propertyDamageUsd: nullableNumber(payload.damages.propertyDamageUsd),
        otherExpensesUsd: nullableNumber(payload.damages.otherExpensesUsd),
        daysMissed: nullableInteger(payload.damages.daysMissed),
        hourlyRateUsd: nullableNumber(payload.damages.hourlyRateUsd),
        lostWagesUsd: nullableNumber(payload.damages.lostWagesUsd),
        emotionalImpact: nullableText(payload.damages.emotionalImpact),
        otherDamages: nullableText(payload.damages.otherDamages),
        details: nullableText(payload.damages.details),
      }),
      updateDataConnectCaseContact({
        caseId: payload.caseId,
        fullName: nullableText(payload.contact.fullName),
        method: contactMethodFor(payload.contact.method),
        email: nullableText(payload.contact.email)?.toLowerCase() ?? null,
        phone: nullableText(payload.contact.phone),
      }),
      ...payload.parties.map((party) => {
        const partyData = {
          caseId: payload.caseId,
          role: partyRoleFor(party.role),
          name: party.name.trim() || 'Unknown party',
          insurerName: nullableText(party.insurerName),
          policyNumber: nullableText(party.policyNumber),
          claimNumber: nullableText(party.claimNumber),
        }

        return party.id.startsWith('new:')
          ? createDataConnectParty(partyData)
          : updateDataConnectParty({
              ...partyData,
              partyId: party.id,
            })
      }),
      ...payload.documents.map((document) => updateDataConnectDocument({
        caseId: payload.caseId,
        documentId: document.id,
        kind: documentKindFor(document.kind),
        originalFilename: nullableText(document.originalFilename),
        notes: nullableText(document.notes),
      })),
      ...payload.deletedPartyIds.map((partyId) => deleteDataConnectParty({
        caseId: payload.caseId,
        partyId,
      })),
      ...payload.deletedDocumentIds.map((documentId) => deleteDataConnectDocument({
        caseId: payload.caseId,
        documentId,
      })),
    ]);

    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to update case details.',
    };
  }
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function nullableNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableInteger(value: string): number | null {
  const number = nullableNumber(value);
  return number === null ? null : Math.trunc(number);
}

function caseStatusFor(value: string): CaseStatus {
  const normalized = value.toLowerCase();
  if (normalized === 'open') return CaseStatus.OPEN;
  if (normalized === 'under_review' || normalized === 'under review') {
    return CaseStatus.UNDER_REVIEW;
  }
  if (normalized === 'closed') return CaseStatus.CLOSED;
  return CaseStatus.PENDING;
}

function contactMethodFor(value: string): ContactMethod {
  if (value.toLowerCase() === 'phone') return ContactMethod.PHONE;
  if (value.toLowerCase() === 'text') return ContactMethod.TEXT;
  return ContactMethod.EMAIL;
}

function partyRoleFor(value: string): PartyRole {
  if (value.toLowerCase() === 'plaintiff') return PartyRole.PLAINTIFF;
  if (value.toLowerCase() === 'insurer') return PartyRole.INSURER;
  if (value.toLowerCase() === 'witness') return PartyRole.WITNESS;
  return PartyRole.DEFENDANT;
}

function documentKindFor(value: string): DocKind {
  if (['medical_bill', 'medical-bill', 'er_bill'].includes(value.toLowerCase())) {
    return DocKind.MEDICAL_BILL;
  }
  if (['police_report', 'police-report'].includes(value.toLowerCase())) {
    return DocKind.POLICE_REPORT;
  }
  if (['photo', 'photos', 'incident_photo'].includes(value.toLowerCase())) {
    return DocKind.PHOTO;
  }
  return DocKind.OTHER;
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
    location_details: item.locationDetails ?? '',
    incident_date: item.incidentDate ?? null,
    description: item.description,
    created_at: item.createdAt,
  };
}

function mapDamage(item: DataConnectDamage) {
  const lostWages = roundCurrencyValue(item.lostWagesUsd) ?? calculateLostWages(item.daysMissed, item.hourlyRateUsd);

  return {
    case_id: item.caseId,
    injuries: item.injuries ?? '',
    treatment: item.treatment ?? '',
    medical_expenses: roundCurrencyValue(item.medicalBillsUsd),
    property_damage: roundCurrencyValue(item.propertyDamageUsd),
    other_expenses: roundCurrencyValue(item.otherExpensesUsd),
    lost_wages: lostWages,
    pain_suffering: item.emotionalImpact ?? null,
    other_damages: item.otherDamages ?? null,
    medical_bills_usd: roundCurrencyValue(item.medicalBillsUsd),
    property_damage_usd: roundCurrencyValue(item.propertyDamageUsd),
    other_expenses_usd: roundCurrencyValue(item.otherExpensesUsd),
    days_missed: item.daysMissed ?? null,
    hourly_rate_usd: roundCurrencyValue(item.hourlyRateUsd),
    lost_wages_usd: lostWages,
    emotional_impact: item.emotionalImpact ?? '',
    details: item.details ?? '',
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

import {
  ContactMethod,
  DocKind,
  PartyRole,
  createCase as createDataConnectCase,
  createCaseContact as createDataConnectCaseContact,
  createDamages as createDataConnectDamages,
  createDocument as createDataConnectDocument,
  createIncident as createDataConnectIncident,
  createParty as createDataConnectParty,
  deleteCase as deleteDataConnectCase,
} from '@dataconnect/generated';
import type { ApiResponse } from '../types';

interface CreateCaseParams {
  userId: string;
  consentStore: boolean;
  consentContact: boolean;
}

type IntakeRecord = Record<string, unknown>;

const stringValue = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const numberValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundToCents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const currencyValue = (value: unknown): number | null => {
  const parsed = numberValue(value);
  return parsed === null ? null : roundToCents(parsed);
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const contactMethodFor = (value: unknown) => {
  const method = stringValue(value)?.toLowerCase();
  if (method === 'text') return ContactMethod.TEXT;
  if (method === 'phone') return ContactMethod.PHONE;
  return ContactMethod.EMAIL;
};

const partyRoleFor = (value: unknown) => {
  const role = stringValue(value)?.toLowerCase();
  if (role === 'plaintiff') return PartyRole.PLAINTIFF;
  if (role === 'insurer') return PartyRole.INSURER;
  if (role === 'witness') return PartyRole.WITNESS;
  return PartyRole.DEFENDANT;
};

const docKindFor = (value: unknown) => {
  const kind = stringValue(value)?.toLowerCase();
  if (kind === 'medical_bill' || kind === 'medical-bill' || kind === 'er_bill') {
    return DocKind.MEDICAL_BILL;
  }
  if (kind === 'police_report' || kind === 'police-report') return DocKind.POLICE_REPORT;
  if (kind === 'photo' || kind === 'photos' || kind === 'incident_photo') return DocKind.PHOTO;
  return DocKind.OTHER;
};

export async function createCase({
  userId,
  consentStore,
  consentContact,
}: CreateCaseParams): Promise<ApiResponse<{ id: string }>> {
  if (!userId) {
    return { data: null, error: 'User ID is required' };
  }

  try {
    const response = await createDataConnectCase({ consentStore, consentContact });
    return { data: { id: response.data.case_insert.id }, error: null };
  } catch (error) {
    return { data: null, error: errorMessage(error, 'Failed to create case') };
  }
}

export async function deleteCase(caseId: string): Promise<{ error: string | null }> {
  try {
    await deleteDataConnectCase({ caseId });
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error, 'Failed to delete case') };
  }
}

export async function createIncident(incidentData: IntakeRecord): Promise<{ error: string | null }> {
  const incidentDate = stringValue(incidentData.incident_date);
  if (!incidentDate) {
    return { error: 'Incident date is required' };
  }

  try {
    await createDataConnectIncident({
      caseId: String(incidentData.case_id),
      description: stringValue(incidentData.description) || '',
      incidentDate,
      city: stringValue(incidentData.city),
      stateCode: stringValue(incidentData.state_code)?.toUpperCase() || null,
    });
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error, 'Failed to create incident') };
  }
}

export async function createDamages(damagesData: IntakeRecord): Promise<{ error: string | null }> {
  const medicalBillsUsd =
    currencyValue(damagesData.medical_bills_usd) ?? currencyValue(damagesData.medical_expenses);
  const daysMissed = numberValue(damagesData.days_missed);
  const hourlyRateUsd = currencyValue(damagesData.hourly_rate_usd);
  const lostWagesUsd =
    currencyValue(damagesData.lost_wages_usd) ??
    currencyValue(damagesData.lost_wages) ??
    (daysMissed !== null && hourlyRateUsd !== null ? roundToCents(daysMissed * 8 * hourlyRateUsd) : null);

  try {
    await createDataConnectDamages({
      caseId: String(damagesData.case_id),
      medicalBillsUsd,
      daysMissed,
      hourlyRateUsd,
      lostWagesUsd,
    });
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error, 'Failed to create damages') };
  }
}

export async function createCaseContact(contactData: IntakeRecord): Promise<{ error: string | null }> {
  try {
    await createDataConnectCaseContact({
      caseId: String(contactData.case_id),
      fullName: stringValue(contactData.full_name),
      method: contactMethodFor(contactData.method ?? contactData.preferred_contact_method),
      email: stringValue(contactData.email),
      phone: stringValue(contactData.phone),
    });
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error, 'Failed to create case contact') };
  }
}

export async function createParties(partiesData: IntakeRecord[]): Promise<{ error: string | null }> {
  try {
    await Promise.all(
      partiesData.map((party) =>
        createDataConnectParty({
          caseId: String(party.case_id),
          role: partyRoleFor(party.role ?? party.party_type),
          name: stringValue(party.name ?? party.full_name) || 'Unknown party',
          insurerName: stringValue(party.insurer_name),
          policyNumber: stringValue(party.policy_number),
          claimNumber: stringValue(party.claim_number),
        })
      )
    );
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error, 'Failed to create parties') };
  }
}

export async function createDocument(documentData: IntakeRecord): Promise<{ error: string | null }> {
  try {
    await createDataConnectDocument({
      caseId: String(documentData.case_id),
      kind: docKindFor(documentData.kind),
      originalFilename: stringValue(documentData.original_filename ?? documentData.file_name),
      storagePath: stringValue(documentData.storage_path),
    });
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error, 'Failed to create document') };
  }
}

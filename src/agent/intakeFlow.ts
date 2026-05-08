export interface ChatIntakeDraft {
  whatHappened: string;
  incidentDate: string;
  city: string;
  state: string;
  adverseParty: string;
  insurerName: string;
  policyNumber: string;
  claimNumber: string;
  authorizeDocuments: boolean | null;
  medicalBills: string;
  daysMissed: string;
  dailyRate: string;
  fullName: string;
  preferredContact: string;
  email: string;
  phone: string;
  consentProcess: boolean;
  consentContact: boolean;
}

export type ChatIntakeStep =
  | "whatHappened"
  | "incidentDate"
  | "location"
  | "adverseParty"
  | "insurerInfo"
  | "documents"
  | "damages"
  | "contact"
  | "consent";

export interface IntakeUpdateResult {
  accepted: boolean;
  draft: ChatIntakeDraft;
  message?: string;
}

export interface IntakeAnswerContext {
  attachedFileCount?: number;
}

export const emptyChatIntakeDraft: ChatIntakeDraft = {
  whatHappened: "",
  incidentDate: "",
  city: "",
  state: "",
  adverseParty: "",
  insurerName: "",
  policyNumber: "",
  claimNumber: "",
  authorizeDocuments: null,
  medicalBills: "",
  daysMissed: "",
  dailyRate: "",
  fullName: "",
  preferredContact: "email",
  email: "",
  phone: "",
  consentProcess: false,
  consentContact: false,
};

const stepOrder: ChatIntakeStep[] = [
  "whatHappened",
  "incidentDate",
  "location",
  "adverseParty",
  "insurerInfo",
  "documents",
  "damages",
  "contact",
  "consent",
];

const questions: Record<ChatIntakeStep, string> = {
  whatHappened: "Let’s start the intake. In 1-3 sentences, what happened?",
  incidentDate: "What date did this happen? A date like 2026-05-06 works best.",
  location: "What city and state did it happen in?",
  adverseParty: "Who else was involved? Share the adverse party’s name or say unknown.",
  insurerInfo: "Do you have any insurance info, policy number, or claim number? If not, say none.",
  documents: "Do you have documents or photos, or do you authorize the legal team to retrieve reports if needed? Reply yes to authorize, or briefly describe what you have.",
  damages: "What are the damages so far? Please include medical bills, days missed from work, and your approximate daily rate. Use 0 for anything that does not apply.",
  contact: "What is your full name, preferred contact method, email, and phone number if you want calls or texts?",
  consent: "Do you consent to True Legal storing this intake and contacting you about it? Reply yes or no.",
};

export function isIntakeRequest(text: string): boolean {
  const normalized = normalize(text);
  return /\b(start|begin|submit|file|create)\b.*\b(intake|case|claim)\b/.test(normalized)
    || /\b(i have|i was|my case|my claim)\b/.test(normalized);
}

export function getInitialIntakeQuestion(): string {
  return questions.whatHappened;
}

export function getNextIntakeStep(draft: ChatIntakeDraft): ChatIntakeStep | null {
  if (!draft.whatHappened.trim()) return "whatHappened";
  if (!draft.incidentDate) return "incidentDate";
  if (!draft.city.trim() || !draft.state.trim()) return "location";
  if (!draft.adverseParty.trim()) return "adverseParty";
  if (draft.insurerName === "") return "insurerInfo";
  if (draft.authorizeDocuments === null) return "documents";
  if (draft.medicalBills === "" || draft.daysMissed === "" || draft.dailyRate === "") return "damages";
  if (!draft.fullName.trim() || !draft.email.trim()) return "contact";
  if (!draft.consentProcess) return "consent";
  return null;
}

export function getIntakeQuestion(step: ChatIntakeStep): string {
  return questions[step];
}

export function isChatIntakeComplete(draft: ChatIntakeDraft): boolean {
  return getNextIntakeStep(draft) === null;
}

export function applyIntakeAnswer(
  draft: ChatIntakeDraft,
  step: ChatIntakeStep,
  answer: string,
  context: IntakeAnswerContext = {}
): IntakeUpdateResult {
  const next = { ...draft };
  const trimmed = answer.trim();

  switch (step) {
    case "whatHappened":
      if (isUnusableAnswer(trimmed) || !isIncidentDescription(trimmed)) {
        return retry(next, "Please describe the incident or legal issue in a little more detail, including what happened and why you may need legal help.");
      }
      next.whatHappened = trimmed;
      return accept(next);

    case "incidentDate": {
      if (isUnusableAnswer(trimmed)) return retry(next, "Please enter the actual date the incident happened, like 2026-05-06.");
      const date = parseDate(trimmed);
      if (!date) return retry(next, "I could not read that date. Please use a date like 2026-05-06.");
      if (isFutureDate(date)) return retry(next, "That date appears to be in the future. Please enter the date the incident already happened.");
      next.incidentDate = date;
      return accept(next);
    }

    case "location": {
      if (isUnusableAnswer(trimmed)) return retry(next, "Please include the actual city and state, like Los Angeles, CA.");
      const location = parseLocation(trimmed);
      if (!location) return retry(next, "Please include both city and state, like Los Angeles, CA.");
      next.city = location.city;
      next.state = location.state;
      return accept(next);
    }

    case "adverseParty":
      if (!isAcceptableAdverseParty(trimmed)) {
        return retry(next, "Please share the actual other party’s name, business, insurer, or say unknown if you do not know.");
      }
      next.adverseParty = isUnknownAnswer(trimmed) ? "Unknown party" : trimmed;
      return accept(next);

    case "insurerInfo":
      if (isUnusableAnswer(trimmed, { allowUnknown: true })) {
        return retry(next, "Please share the insurer, policy number, claim number, or say none if you do not have insurance info.");
      }
      applyInsurerInfo(next, trimmed);
      return accept(next);

    case "documents":
      if (context.attachedFileCount && context.attachedFileCount > 0) {
        next.authorizeDocuments = true;
        return accept(next);
      }
      if (isUnusableAnswer(trimmed, { allowUnknown: true }) || !hasDocumentAnswer(trimmed)) {
        return retry(next, "Please say whether you have documents/photos, authorize the team to retrieve reports, or say none.");
      }
      next.authorizeDocuments = !/\b(no|not yet|none|do not|don't)\b/i.test(trimmed);
      return accept(next);

    case "damages": {
      if (isUnusableAnswer(trimmed, { allowUnknown: true })) {
        return retry(next, "Please include three numbers: medical bills, days missed, and daily rate. Use 0 if something does not apply.");
      }
      const damages = parseDamages(trimmed);
      if (!damages) {
        return retry(next, "Please include three numbers: medical bills, days missed, and daily rate. Use 0 if something does not apply.");
      }
      next.medicalBills = damages.medicalBills;
      next.daysMissed = damages.daysMissed;
      next.dailyRate = damages.dailyRate;
      return accept(next);
    }

    case "contact": {
      if (isUnusableAnswer(trimmed)) {
        return retry(next, "Please provide your real full name and email address.");
      }
      const contact = parseContact(trimmed);
      if (!contact.email) return retry(next, "Please include a valid email address so the case can be tied to your account.");
      if (!contact.fullName) return retry(next, "Please include your full name.");
      if (contact.preferredContact === "phone" && !contact.phone) {
        return retry(next, "Please include a phone number if calls or texts are your preferred contact method.");
      }
      next.fullName = contact.fullName;
      next.email = contact.email;
      next.phone = contact.phone;
      next.preferredContact = contact.preferredContact;
      return accept(next);
    }

    case "consent":
      if (isUnusableAnswer(trimmed)) {
        return retry(next, "Please reply yes if you consent, or no if you do not.");
      }
      if (!/\b(yes|y|agree|consent|ok|okay)\b/i.test(trimmed)) {
        return retry(next, "I need your consent before submitting. Reply yes if you consent to storage and contact.");
      }
      next.consentProcess = true;
      next.consentContact = true;
      return accept(next);
  }
}

export function applyIntakeAnswerAndAdvance(
  draft: ChatIntakeDraft,
  step: ChatIntakeStep,
  answer: string,
  context: IntakeAnswerContext = {}
): IntakeUpdateResult {
  let result = applyIntakeAnswer(draft, step, answer, context);
  if (!result.accepted) return result;

  let nextStep = getStepAfter(step, result.draft);
  while (nextStep) {
    const extracted = extractAnswerForStep(answer, nextStep, context);
    if (!extracted) break;

    const extractedResult = applyIntakeAnswer(result.draft, nextStep, extracted, context);
    if (!extractedResult.accepted) break;

    result = extractedResult;
    nextStep = getStepAfter(nextStep, result.draft);
  }

  return result;
}

export function buildIntakeSummary(draft: ChatIntakeDraft): string {
  return [
    "I have enough to prepare your intake:",
    `Incident: ${draft.whatHappened}`,
    `Date/location: ${draft.incidentDate} in ${draft.city}, ${draft.state}`,
    `Other party: ${draft.adverseParty}`,
    `Damages: $${draft.medicalBills} medical bills, ${draft.daysMissed} days missed, $${draft.dailyRate}/day`,
    `Contact: ${draft.fullName}, ${draft.email}${draft.phone ? `, ${draft.phone}` : ""}`,
  ].join("\n");
}

export function getStepAfter(step: ChatIntakeStep, draft: ChatIntakeDraft): ChatIntakeStep | null {
  const nextMissing = getNextIntakeStep(draft);
  if (nextMissing) return nextMissing;
  const index = stepOrder.indexOf(step);
  return stepOrder[index + 1] ?? null;
}

function accept(draft: ChatIntakeDraft): IntakeUpdateResult {
  return { accepted: true, draft };
}

function retry(draft: ChatIntakeDraft, message: string): IntakeUpdateResult {
  return { accepted: false, draft, message };
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function isIncidentDescription(text: string): boolean {
  const normalized = normalize(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  const hasEnoughDetail = normalized.length >= 25 && words.length >= 6;
  const hasCaseSignal = /\b(accident|crash|collision|hit|injur|hurt|pain|fall|slip|trip|property|damage|medical|hospital|doctor|police|report|claim|insurance|insurer|lawsuit|sued|court|contract|landlord|tenant|work|fired|termination|discriminat|harass|assault|theft|fraud|negligence)\b/.test(normalized);
  return hasEnoughDetail && hasCaseSignal;
}

function isUnusableAnswer(text: string, options: { allowUnknown?: boolean } = {}): boolean {
  const normalized = normalize(text);
  if (!normalized) return true;
  if (options.allowUnknown && isUnknownAnswer(normalized)) return false;
  if (normalized.length < 2) return true;
  if (/^(test|testing|asdf|qwerty|nonsense|blah|blah blah|random|whatever|idk|lol|lmao|haha|ok|okay|sure)$/i.test(normalized)) return true;
  if (/\b(your mom|ur mom|yo mom|deez|stupid|idiot|fuck|shit|bitch|asshole)\b/i.test(normalized)) return true;
  if (/^(.)\1{3,}$/.test(normalized.replace(/\s/g, ""))) return true;
  return false;
}

function isAcceptableAdverseParty(text: string): boolean {
  const normalized = normalize(text);
  if (isUnknownAnswer(normalized)) return true;
  if (isUnusableAnswer(normalized)) return false;
  if (!/[a-z]/i.test(normalized)) return false;

  const vagueRelations = /\b(mom|mother|dad|father|brother|sister|friend|someone|somebody|person|people|guy|girl|man|woman|them|they)\b/i;
  const hasSpecificIdentifier = /\b(inc|llc|corp|company|co|insurance|insurer|farm|geico|progressive|allstate|state farm|landlord|tenant|employer|driver|owner|store|hospital|clinic|police|officer|doctor|dr\.|[A-Z][a-z]+ [A-Z][a-z]+)\b/.test(text);
  if (vagueRelations.test(normalized) && !hasSpecificIdentifier) return false;

  const meaningfulTokens = normalized
    .replace(/[^a-z0-9\s&.'-]/gi, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);

  return meaningfulTokens.length >= 1;
}

function extractAnswerForStep(
  text: string,
  step: ChatIntakeStep,
  context: IntakeAnswerContext
): string | null {
  switch (step) {
    case "incidentDate":
      return extractDateText(text);
    case "location":
      return extractLocationText(text);
    case "adverseParty":
      return extractAdversePartyText(text);
    case "insurerInfo":
      return extractInsurerText(text);
    case "documents":
      return context.attachedFileCount && context.attachedFileCount > 0 ? "attached files" : extractDocumentText(text);
    case "damages":
      return extractDamagesText(text);
    case "contact":
      return extractContactText(text);
    case "consent":
      return extractConsentText(text);
    case "whatHappened":
      return null;
  }
}

function extractDateText(text: string): string | null {
  const candidates = [
    ...text.matchAll(/\b\d{4}-\d{1,2}-\d{1,2}\b/g),
    ...text.matchAll(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g),
    ...text.matchAll(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?\b/gi),
  ].map((match) => match[0]);

  const withYear = candidates.filter((candidate) => /\b\d{4}\b/.test(candidate));
  return withYear.at(-1) ?? candidates.at(-1) ?? null;
}

function extractLocationText(text: string): string | null {
  const match = text.match(/\b([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,3}),?\s+([A-Z]{2})\b/);
  return match ? `${match[1]}, ${match[2]}` : null;
}

function extractAdversePartyText(text: string): string | null {
  const byMatch = text.match(/\b(?:hit by|struck by|rear-ended by|sued by|fired by|hurt by|injured by|against|with)\s+([A-Z][a-zA-Z0-9&.'-]+(?:\s+[A-Z][a-zA-Z0-9&.'-]+){0,4})\b/);
  return byMatch?.[1] ?? null;
}

function extractInsurerText(text: string): string | null {
  if (!/\b(insurance|insurer|policy|claim)\b/i.test(text)) return null;
  return text;
}

function extractDocumentText(text: string): string | null {
  return hasDocumentAnswer(text) ? text : null;
}

function extractDamagesText(text: string): string | null {
  return parseDamages(text) ? text : null;
}

function extractContactText(text: string): string | null {
  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
  const hasNameSignal = /\b(my name is|i am|i'm)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/i.test(text);
  return hasEmail && hasNameSignal ? text : null;
}

function extractConsentText(text: string): string | null {
  return /\b(i consent|i agree|yes,?\s*i consent|yes,?\s*i agree)\b/i.test(text) ? "yes" : null;
}

function parseDate(text: string): string | null {
  const dateText = extractDateText(text) ?? text;
  const cleaned = removeDateOrdinals(dateText);

  const isoMatch = cleaned.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return validIsoDate(year, month, day);
  }

  const shortMatch = cleaned.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (shortMatch) {
    const [, month, day, providedYear] = shortMatch;
    const year = providedYear
      ? providedYear.length === 2 ? `20${providedYear}` : providedYear
      : String(new Date().getFullYear());
    return validIsoDate(year, month, day);
  }

  const monthMatch = cleaned.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/i);
  if (monthMatch) {
    const [, monthName, day, providedYear] = monthMatch;
    const year = providedYear || String(new Date().getFullYear());
    return validIsoDate(year, String(monthNumber(monthName)), day);
  }

  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function removeDateOrdinals(text: string): string {
  return text.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1");
}

function monthNumber(monthName: string): number {
  const normalized = monthName.toLowerCase().slice(0, 3);
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(normalized) + 1;
}

function validIsoDate(year: string, month: string, day: string): string | null {
  const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== normalized) return null;
  return normalized;
}

function isFutureDate(date: string): boolean {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  return date > todayIso;
}

function parseLocation(text: string): { city: string; state: string } | null {
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return normalizedLocation(parts[parts.length - 2], parts[parts.length - 1]);
  }

  const tokens = text.trim().split(/\s+/);
  if (tokens.length < 2) return null;
  const state = tokens[tokens.length - 1].toUpperCase().slice(0, 2);
  const city = tokens.slice(0, -1).join(" ");
  return normalizedLocation(city, state);
}

function normalizedLocation(city: string, state: string): { city: string; state: string } | null {
  const cleanCity = city.replace(/[^a-z\s.'-]/gi, "").replace(/\s+/g, " ").trim();
  const cleanState = state.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  if (cleanCity.length < 2 || cleanState.length !== 2) return null;
  return { city: cleanCity, state: cleanState };
}

function isUnknownAnswer(text: string): boolean {
  return !text.trim() || /\b(unknown|not sure|unsure|don't know|do not know|n\/a)\b/i.test(text);
}

function hasDocumentAnswer(text: string): boolean {
  return /\b(yes|authorize|permission|retrieve|report|photo|picture|image|document|pdf|file|police|medical|bill|insurance|claim|no|none|not yet|don't|do not)\b/i.test(text);
}

function applyInsurerInfo(draft: ChatIntakeDraft, text: string) {
  if (!text || /\b(no|none|unknown|not sure|unsure|n\/a)\b/i.test(text)) {
    draft.insurerName = "None";
    return;
  }

  draft.insurerName = text;
  draft.policyNumber = text.match(/policy(?: number| #|:)?\s*([a-z0-9-]+)/i)?.[1] ?? "";
  draft.claimNumber = text.match(/claim(?: number| #|:)?\s*([a-z0-9-]+)/i)?.[1] ?? "";
}

function parseDamages(text: string): { medicalBills: string; daysMissed: string; dailyRate: string } | null {
  const numbers = text.match(/\d+(?:,\d{3})*(?:\.\d+)?/g)?.map((value) => value.replace(/,/g, "")) ?? [];
  if (numbers.length < 3) return null;
  if (numbers.slice(0, 3).some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) return null;
  return {
    medicalBills: numbers[0],
    daysMissed: numbers[1],
    dailyRate: numbers[2],
  };
}

function parseContact(text: string): {
  fullName: string;
  email: string;
  phone: string;
  preferredContact: string;
} {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  const phone = text.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/)?.[0] ?? "";
  const preferredContact = /\b(call|phone|text|sms)\b/i.test(text) ? "phone" : "email";
  const fullName = text
    .replace(email, "")
    .replace(phone, "")
    .replace(/\b(email|phone|text|call|preferred|method|contact|me|at|by)\b/gi, "")
    .split(",")[0]
    .replace(/\s+/g, " ")
    .trim();

  const nameParts = fullName.split(/\s+/).filter(Boolean);
  return { fullName: nameParts.length >= 2 ? fullName : "", email, phone, preferredContact };
}

export const offTopicMessage =
  "I can only help with legal case intake, case documents, injuries, claims, deadlines, or finding the right next step for a legal matter. If you have a possible case, tell me briefly what happened, where it happened, and when.";

const intakeRelevantTerms = [
  "accident",
  "agreement",
  "attorney",
  "bill",
  "case",
  "claim",
  "contact",
  "contract",
  "court",
  "damage",
  "deadline",
  "defendant",
  "document",
  "employment",
  "evidence",
  "hospital",
  "injury",
  "insurance",
  "intake",
  "law",
  "lawyer",
  "lawsuit",
  "legal",
  "medical",
  "negligence",
  "police",
  "settlement",
  "tenant",
  "treatment",
  "witness",
  "workers comp",
];

const offTopicTerms = [
  "code",
  "crypto",
  "essay",
  "homework",
  "joke",
  "poem",
  "recipe",
  "sports",
  "stock",
  "weather",
];

export function isCaseIntakeRelevant(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (/^(hi|hello|hey|help|start|what can you do)\??$/.test(normalized)) return true;
  if (intakeRelevantTerms.some((term) => normalized.includes(term))) return true;
  if (offTopicTerms.some((term) => normalized.includes(term))) return false;
  return normalized.length >= 24 && /\b(happened|hurt|hit|fired|owe|paid|sued|injured|crash|fall)\b/.test(normalized);
}

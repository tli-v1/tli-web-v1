import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyIntakeAnswerAndAdvance,
  emptyChatIntakeDraft,
  getNextIntakeStep,
  isChatIntakeComplete,
  type ChatIntakeDraft,
  type ChatIntakeStep,
  type IntakeAnswerContext,
} from "../../src/agent/intakeFlow";

afterEach(() => {
  vi.useRealTimers();
});

function answerIntakeStep(
  draft: ChatIntakeDraft,
  step: ChatIntakeStep,
  answer: string,
  context: IntakeAnswerContext = { userEmail: "client@example.com" }
) {
  const result = applyIntakeAnswerAndAdvance(draft, step, answer, context);
  expect(result.accepted, result.message).toBe(true);
  return result.draft;
}

describe("chat intake flow integration", () => {
  it("runs through a complete intake and rejects irrelevant answers before continuing", () => {
    let draft = emptyChatIntakeDraft;

    expect(getNextIntakeStep(draft)).toBe("whatHappened");

    const initialResult = applyIntakeAnswerAndAdvance(
      draft,
      "whatHappened",
      "I was injured in a car accident on April 30th 2026 in Kansas City, MO.",
      { userEmail: "client@example.com" }
    );

    expect(initialResult.accepted, initialResult.message).toBe(true);
    draft = initialResult.draft;
    expect(draft.whatHappened).toContain("car accident");
    expect(draft.incidentDate).toBe("2026-04-30");
    expect(draft.city).toBe("Kansas City");
    expect(draft.state).toBe("MO");
    expect(getNextIntakeStep(draft)).toBe("adverseParty");

    const rejectedParty = applyIntakeAnswerAndAdvance(draft, "adverseParty", "your mom");
    expect(rejectedParty.accepted).toBe(false);
    expect(getNextIntakeStep(rejectedParty.draft)).toBe("adverseParty");

    draft = answerIntakeStep(draft, "adverseParty", "Acme Trucking LLC");
    expect(getNextIntakeStep(draft)).toBe("insurerInfo");

    draft = answerIntakeStep(draft, "insurerInfo", "State Farm policy number P-123 claim number C-456");
    expect(draft.insurerName).toBe("State Farm policy number P-123 claim number C-456");
    expect(draft.policyNumber).toBe("P-123");
    expect(draft.claimNumber).toBe("C-456");

    draft = answerIntakeStep(draft, "documents", "Yes, I authorize TLI to receive, organize, and share my submitted information for attorney matching.");
    expect(draft.authorizeDocuments).toBe(true);

    draft = answerIntakeStep(draft, "damages", "Medical bills 1200, days missed 3, hourly rate 25");
    expect(draft.medicalBills).toBe("1200.00");
    expect(draft.daysMissed).toBe("3");
    expect(draft.hourlyRate).toBe("25.00");

    draft = answerIntakeStep(draft, "contact", "Jane Client", { userEmail: "client@example.com" });
    expect(draft.fullName).toBe("Jane Client");
    expect(draft.email).toBe("client@example.com");

    draft = answerIntakeStep(draft, "consent", "yes, I consent");
    expect(isChatIntakeComplete(draft)).toBe(true);
    expect(getNextIntakeStep(draft)).toBeNull();
  });

  it("accepts no missed work as zero damages in chat intake", () => {
    const draft = answerIntakeStep(emptyChatIntakeDraft, "damages", "No medical bills and no missed work");

    expect(draft.medicalBills).toBe("0.00");
    expect(draft.daysMissed).toBe("0");
    expect(draft.hourlyRate).toBe("0.00");
  });

  it("accepts omitted medical bills in chat intake", () => {
    const draft = answerIntakeStep(emptyChatIntakeDraft, "damages", "I missed 3 days and make 25.50 hourly");

    expect(draft.medicalBills).toBe("0.00");
    expect(draft.daysMissed).toBe("3");
    expect(draft.hourlyRate).toBe("25.50");
  });

  it("rejects future incident dates using the local calendar date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 23, 30));

    const today = applyIntakeAnswerAndAdvance(emptyChatIntakeDraft, "incidentDate", "2026-05-25");
    expect(today.accepted, today.message).toBe(true);

    const tomorrow = applyIntakeAnswerAndAdvance(emptyChatIntakeDraft, "incidentDate", "2026-05-26");
    expect(tomorrow.accepted).toBe(false);
  });
});

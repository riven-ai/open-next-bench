import { describe, expect, it } from "vitest";
import type { GroundTruthDocument, PredictionDocument } from "../src/schema.js";
import { score } from "../src/scorer.js";

const truth: GroundTruthDocument = {
  caseId: "sample-blog-hooks-001",
  issues: [
    {
      issueId: "missing-effect-dependency",
      category: "react",
      severity: "medium",
      locations: [{ path: "app/search.tsx", startLine: 20, endLine: 24 }],
      title: "Effect uses an omitted dependency",
      explanation: "The effect closes over query but does not list it.",
      whyItMatters: "Results can become stale.",
      oracle: "A regression test changes query and observes stale results.",
    },
    {
      issueId: "unlabelled-input",
      category: "accessibility",
      severity: "low",
      locations: [{ path: "app/search.tsx", startLine: 31, endLine: 31 }],
      title: "Search input has no accessible name",
      explanation: "No label is associated with the input.",
      whyItMatters: "Assistive technology cannot announce its purpose.",
      oracle: "getByRole('textbox', { name: /search/i }) fails.",
    },
  ],
};

describe("score", () => {
  it("scores identity, classification, and overlapping localization", () => {
    const predictions: PredictionDocument = {
      caseId: truth.caseId,
      issues: [
        {
          findingId: "finding-1",
          category: "react",
          severity: "high",
          confidence: 0.91,
          locations: [{ path: "app/search.tsx", startLine: 23, endLine: 26 }],
          title: "Missing dependency",
          explanation: "The effect can observe stale query state.",
        },
        {
          findingId: "finding-2",
          category: "security",
          severity: "critical",
          confidence: 0.2,
          locations: [{ path: "app/page.tsx", startLine: 1, endLine: 1 }],
          title: "Invented finding",
          explanation: "This does not exist in the ground truth.",
        },
      ],
    };

    expect(score(truth, predictions)).toEqual({
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 1,
      precision: 0.5,
      recall: 0.5,
      f1: 0.5,
      categoryAccuracy: 1,
      severityAccuracy: 0,
      fileLocalizationAccuracy: 1,
      lineLocalizationAccuracy: 1,
      confidenceBrierScore: 0.02405,
    });
  });

  it("does not expose hidden ground-truth ids to predictions", () => {
    const predictions: PredictionDocument = {
      caseId: truth.caseId,
      issues: [
        {
          findingId: "agent-local-id",
          category: "accessibility",
          severity: "low",
          confidence: 1,
          locations: [{ path: "app/search.tsx", startLine: 31, endLine: 31 }],
          title: "Missing accessible name",
          explanation: "The textbox has no associated label.",
        },
      ],
    };

    expect(score(truth, predictions).truePositives).toBe(1);
  });

  it("rejects scoring documents for different cases", () => {
    expect(() => score(truth, { caseId: "other", issues: [] })).toThrow(
      "Case mismatch",
    );
  });
});

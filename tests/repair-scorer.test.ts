import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  evaluatorRepairCaseSchema,
  patchSubmissionSchema,
  repairErrorCodeSchema,
  verifierEvidenceSchema,
} from "../src/repair/schema.js";
import { scoreRepairEpisode } from "../src/repair/scorer.js";

const expectedSchema = z
  .object({
    outcome: z.enum([
      "resolved",
      "clean_control",
      "partial",
      "failed",
      "invalid",
      "environment_error",
    ]),
    errorCode: repairErrorCodeSchema.nullable(),
    primaryScore: z.number().min(0).max(1),
    resolvedWithoutRegression: z.boolean(),
    cleanControlCorrect: z.boolean(),
  })
  .strict();

const conformanceSchema = z
  .object({
    schemaVersion: z.literal("repair-conformance-vectors-1.0"),
    fixtures: z.record(z.string(), evaluatorRepairCaseSchema),
    submissions: z.record(z.string(), patchSubmissionSchema),
    evidence: z.record(z.string(), verifierEvidenceSchema),
    vectors: z.array(
      z
        .object({
          id: z.string().min(1),
          case: z.string().min(1),
          submissions: z.array(z.string().min(1)),
          evidence: z.string().min(1),
          expected: expectedSchema,
        })
        .strict(),
    ),
  })
  .strict();

const document = conformanceSchema.parse(
  JSON.parse(
    readFileSync(
      new URL("../conformance/repair-v1/vectors.json", import.meta.url),
      "utf8",
    ),
  ),
);

describe("repair scorer conformance", () => {
  it("contains at least seven cross-language vectors", () => {
    expect(document.vectors.length).toBeGreaterThanOrEqual(7);
  });

  for (const vector of document.vectors) {
    it(vector.id, () => {
      const repairCase = document.fixtures[vector.case];
      const evidence = document.evidence[vector.evidence];
      const submissions = vector.submissions.flatMap((submissionId) => {
        const submission = document.submissions[submissionId];
        return submission === undefined ? [] : [submission];
      });
      expect(repairCase).toBeDefined();
      expect(evidence).toBeDefined();
      if (
        repairCase === undefined ||
        evidence === undefined ||
        submissions.length !== vector.submissions.length
      ) {
        throw new Error(`Invalid conformance references in ${vector.id}`);
      }
      const result = scoreRepairEpisode(repairCase, submissions, evidence);

      expect({
        outcome: result.outcome,
        errorCode: result.errorCode,
        primaryScore: result.primaryScore,
        resolvedWithoutRegression: result.resolvedWithoutRegression,
        cleanControlCorrect: result.cleanControlCorrect,
      }).toEqual(vector.expected);
      expect(result.primaryScore).toBeGreaterThanOrEqual(0);
      expect(result.primaryScore).toBeLessThanOrEqual(1);
    });
  }
});

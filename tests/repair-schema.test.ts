import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  evaluatorRepairCaseSchema,
  mutationOperatorSchema,
  patchSubmissionSchema,
  publicRepairCaseSchema,
  repairRunManifestSchema,
  toPublicRepairCase,
} from "../src/repair/schema.js";

const readJson = (): unknown =>
  JSON.parse(
    readFileSync(
      new URL("../conformance/repair-v1/vectors.json", import.meta.url),
      "utf8",
    ),
  );

const conformance = z
  .object({
    fixtures: z.object({ mutatedCase: evaluatorRepairCaseSchema }),
    submissions: z.object({ repair: patchSubmissionSchema }),
  })
  .parse(readJson());

describe("repair v1 schemas", () => {
  it("projects evaluator-only truth out of the public case", () => {
    const document = conformance;
    const evaluatorCase = evaluatorRepairCaseSchema.parse(
      document.fixtures.mutatedCase,
    );
    const publicCase = toPublicRepairCase(evaluatorCase);

    expect(publicRepairCaseSchema.parse(publicCase)).toEqual(publicCase);
    expect(JSON.stringify(publicCase)).not.toContain("referenceRepairPatch");
    expect(JSON.stringify(publicCase)).not.toContain("check-hidden-a11y");
  });

  it("rejects hidden evaluator fields at the strict public boundary", () => {
    expect(() =>
      publicRepairCaseSchema.parse(conformance.fixtures.mutatedCase),
    ).toThrow();
  });

  it("rejects hidden or duplicate patch-submission fields", () => {
    expect(() =>
      patchSubmissionSchema.parse({
        ...conformance.submissions.repair,
        evaluatorPath: "private/oracle.ts",
      }),
    ).toThrow();
    expect(() =>
      patchSubmissionSchema.parse({
        ...conformance.submissions.repair,
        changedPaths: ["app/search.tsx", "app/search.tsx"],
      }),
    ).toThrow("changedPaths cannot contain duplicates");
  });

  it("validates a deterministic mutation operator", () => {
    expect(
      mutationOperatorSchema.parse({
        schemaVersion: "repair-mutation-1.0",
        operatorId: "a11y-input-name",
        operatorVersion: "1.0.0",
        category: "accessibility",
        difficulty: "easy",
        description: "Remove the input's accessible name.",
        compatibility: {
          nextMajorVersions: [15, 16],
          routerModes: ["app"],
          requiredPaths: ["app/search.tsx"],
        },
        deterministicInputs: {
          seed: 7331,
          implementationDigest: `sha256:${"a".repeat(64)}`,
        },
        expectedChangedPaths: ["app/search.tsx"],
        maxChangedFiles: 1,
        maxPatchBytes: 2000,
        requiredCapabilities: ["browser_accessibility"],
      }).operatorId,
    ).toBe("a11y-input-name");
  });

  it("validates scorer, environment, budget, and attempt identities in a run", () => {
    const parsed = repairRunManifestSchema.parse({
      schemaVersion: "repair-run-manifest-1.0",
      runId: "repair-baseline-1",
      benchmarkVersion: "0.2.0",
      benchmarkCommit: "0123456789abcdef0123456789abcdef01234567",
      scorerVersion: "repair-scorer-1.0",
      environmentVersion: "container-v1",
      split: "validation",
      model: { id: "Qwen/Qwen3-1.7B", revision: "abc", quantization: null },
      scaffold: {
        id: "riven-repair",
        revision: "v1",
        systemPromptHash: `sha256:${"b".repeat(64)}`,
      },
      budgets: {
        maxSteps: 30,
        maxTokens: 16000,
        timeoutSeconds: 900,
        maxOutputBytes: 100000,
        maxPatchBytes: 10000,
      },
      sampling: { temperature: 0, topP: 1, seed: 7331 },
      attemptPolicy: { attemptsPerCase: 1, independentAttempts: true },
      caseIds: ["family-a11y-mutation-1"],
      startedAt: "2026-07-19T14:00:00+03:00",
    });

    expect(parsed.scorerVersion).toBe("repair-scorer-1.0");
  });
});

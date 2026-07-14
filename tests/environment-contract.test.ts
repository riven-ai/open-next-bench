import { describe, expect, it } from "vitest";

import {
  evaluatorCaseSchema,
  publicBenchmarkCaseSchema,
  toPublicBenchmarkCase,
} from "../src/schema.js";

const evaluatorCase = {
  schemaVersion: "1.0" as const,
  caseId: "case-1",
  familyId: "family-1",
  split: "train" as const,
  source: {
    repository: "riven-ai/example",
    commit: "a".repeat(40),
    licenseSpdx: "MIT",
  },
  environment: {
    image: "ghcr.io/riven-ai/example",
    imageDigest: `sha256:${"b".repeat(64)}`,
    setupHash: `sha256:${"c".repeat(64)}`,
    networkAccess: false,
  },
  task: {
    prompt: "Inspect the repository.",
    allowedTools: ["read_file", "search", "run_check"],
    maxSteps: 20,
    maxTokens: 8000,
    timeoutSeconds: 600,
  },
  variant: { kind: "mutated" as const, mutationIds: ["hidden-mutation"] },
  oracle: {
    groundTruthPath: "private/truth.json",
    commands: ["private-oracle --case case-1"],
  },
};

describe("environment contract", () => {
  it("projects evaluator metadata out of the model-visible case", () => {
    const parsed = evaluatorCaseSchema.parse(evaluatorCase);
    const publicCase = toPublicBenchmarkCase(parsed);

    expect(publicBenchmarkCaseSchema.parse(publicCase)).toEqual(publicCase);
    expect("oracle" in publicCase).toBe(false);
    expect(JSON.stringify(publicCase)).not.toContain("private-oracle");
    expect(JSON.stringify(publicCase)).not.toContain("private/truth.json");
  });

  it("rejects evaluator metadata at the public boundary", () => {
    expect(() =>
      publicBenchmarkCaseSchema.strict().parse(evaluatorCase),
    ).toThrow();
  });
});

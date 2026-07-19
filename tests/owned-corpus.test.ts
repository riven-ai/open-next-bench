import { describe, expect, it } from "vitest";

import { workspaceDigest } from "../src/mutations/factory.js";
import {
  ownedCorpusCases,
  ownedCorpusFamilies,
  ownedCorpusValidation,
} from "../src/mutations/owned-corpus.js";

describe("Riven-authored repair micro-corpus", () => {
  it("contains ten distinct Apache-2.0 template families and 100 mutations", () => {
    expect(ownedCorpusFamilies).toHaveLength(10);
    expect(
      new Set(ownedCorpusFamilies.map(({ template }) => template.familyId))
        .size,
    ).toBe(10);
    expect(
      ownedCorpusFamilies.every(
        ({ template }) => template.licenseSpdx === "Apache-2.0",
      ),
    ).toBe(true);
    expect(
      ownedCorpusFamilies.reduce(
        (total, { operators }) => total + operators.length,
        0,
      ),
    ).toBeGreaterThanOrEqual(100);
    expect(
      ownedCorpusCases.filter(({ kind }) => kind === "mutated"),
    ).toHaveLength(100);
    expect(
      ownedCorpusCases.filter(({ kind }) => kind === "control"),
    ).toHaveLength(10);
  });

  it("uses an explicitly reviewed 6/2/2 family split", () => {
    const counts = { train: 0, validation: 0, public_test: 0 };
    for (const family of ownedCorpusFamilies) {
      counts[family.template.split] += 1;
      expect(family.splitReview).toEqual({
        reviewed: true,
        policyVersion: "owned-corpus-split-1.0",
      });
    }
    expect(counts).toEqual({ train: 6, validation: 2, public_test: 2 });
  });

  it("has unique workspace, duplicate-cluster, and file-shape digests", () => {
    const workspaceDigests = ownedCorpusFamilies.map(({ template }) =>
      workspaceDigest(template.files),
    );
    const duplicateClusters = ownedCorpusFamilies.map(
      ({ duplicateCluster }) => duplicateCluster,
    );
    const fileShapes = ownedCorpusFamilies.map(({ template }) =>
      Object.keys(template.files).sort().join("\n"),
    );
    expect(new Set(workspaceDigests).size).toBe(10);
    expect(new Set(duplicateClusters).size).toBe(10);
    expect(new Set(fileShapes).size).toBe(10);
  });

  it("keeps every control and mutation within its source family", () => {
    expect(ownedCorpusCases).toHaveLength(110);
    for (const family of ownedCorpusFamilies) {
      const cases = ownedCorpusCases.filter(
        ({ templateFamilyId }) => templateFamilyId === family.template.familyId,
      );
      expect(cases).toHaveLength(11);
      expect(
        cases.every(
          ({ cleanWorkspace, referenceRepair }) =>
            workspaceDigest(cleanWorkspace) ===
            workspaceDigest(referenceRepair),
        ),
      ).toBe(true);
    }
  });

  it("validates every clean, mutation, and exact reference repair three times", () => {
    expect(ownedCorpusValidation).toHaveLength(100);
    expect(
      ownedCorpusValidation.every(
        (evidence) =>
          evidence.cleanPasses &&
          evidence.mutatedFails &&
          evidence.referencePasses &&
          evidence.repetitions === 3 &&
          evidence.messages.length === 3,
      ),
    ).toBe(true);
  });

  it("uses globally unique case and mutation identities", () => {
    expect(new Set(ownedCorpusCases.map(({ caseId }) => caseId)).size).toBe(
      110,
    );
    const mutationIds = ownedCorpusFamilies.flatMap(({ operators }) =>
      operators.map(({ mutationId }) => mutationId),
    );
    expect(new Set(mutationIds).size).toBe(100);
  });
});

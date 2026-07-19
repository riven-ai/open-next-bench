import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildEvaluatorCases,
  buildReferenceTrajectories,
  exportRepairCorpus,
  exportRepairDataset,
} from "../src/export/dataset.js";
import { ownedCorpusFamilies } from "../src/mutations/owned-corpus.js";
import {
  ownedDashboardMutations,
  ownedDashboardTemplate,
} from "../src/mutations/owned-dashboard.js";

const options = {
  benchmarkVersion: "0.2.0-pilot.1",
  benchmarkCommit: "a".repeat(40),
  environmentVersion: "repair-env-1.0",
  image: "ghcr.io/riven-ai/open-next-bench-executor",
  imageDigest: `sha256:${"b".repeat(64)}`,
};

describe("repair dataset export", () => {
  it("builds strict public/private cases without evaluator leakage", () => {
    const cases = buildEvaluatorCases(
      ownedDashboardTemplate,
      ownedDashboardMutations,
      options,
    );
    expect(cases).toHaveLength(11);
    expect(
      cases.every(
        (item) => item.templateFamilyId === ownedDashboardTemplate.familyId,
      ),
    ).toBe(true);
    expect(
      cases.filter((item) => item.variant.kind === "mutated"),
    ).toHaveLength(10);
    expect(
      cases.every((item) =>
        item.evaluator.oracles.some((oracle) => oracle.kind === "hidden_bug"),
      ),
    ).toBe(true);
  });

  it("creates verified reference trajectories including the clean control", () => {
    const rows = buildReferenceTrajectories(
      buildEvaluatorCases(
        ownedDashboardTemplate,
        ownedDashboardMutations,
        options,
      ),
    );
    expect(rows).toHaveLength(11);
    expect(rows.map((row) => row.reward)).toEqual(Array(11).fill(1));
    expect(rows.map((row) => row.resolvedWithoutRegression)).toEqual(
      Array(11).fill(true),
    );
    expect(
      rows.find((row) => row.caseId.endsWith("--control"))?.submittedPatch,
    ).toBe("");
  });

  it("writes a Hugging Face-ready JSONL dataset and manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "open-next-bench-export-"));
    const result = await exportRepairDataset(
      ownedDashboardTemplate,
      ownedDashboardMutations,
      { ...options, outputDirectory: directory },
    );
    expect(result).toMatchObject({
      instanceCount: 11,
      trajectoryCount: 11,
      privateEvaluationCount: 11,
    });
    const instances = await readFile(
      join(directory, "instances/data/train.jsonl"),
      "utf8",
    );
    const trajectories = await readFile(
      join(directory, "trajectories/data/train.jsonl"),
      "utf8",
    );
    const privateBundle = await readFile(
      join(directory, "private/evaluator-cases.jsonl"),
      "utf8",
    );
    const card = await readFile(join(directory, "instances/README.md"), "utf8");
    expect(instances.trim().split("\n")).toHaveLength(11);
    expect(trajectories.trim().split("\n")).toHaveLength(11);
    expect(instances).not.toContain("referenceRepairPatch");
    expect(instances).not.toContain("mutationPatch");
    expect(instances).not.toContain('"evaluator"');
    expect(privateBundle).toContain("referenceRepairPatch");
    expect(privateBundle).toContain("agentWorkspace");
    expect(card).toContain("Open Next Bench Repair Pilot");
  });

  it("exports the complete 6/2/2 corpus without public-test trajectories", async () => {
    const directory = await mkdtemp(join(tmpdir(), "open-next-bench-corpus-"));
    const result = await exportRepairCorpus(ownedCorpusFamilies, {
      ...options,
      outputDirectory: directory,
    });
    expect(result).toMatchObject({
      instanceCount: 110,
      trajectoryCount: 88,
      privateEvaluationCount: 110,
    });
    const trainInstances = await readFile(
      join(directory, "instances/data/train.jsonl"),
      "utf8",
    );
    const validationInstances = await readFile(
      join(directory, "instances/data/validation.jsonl"),
      "utf8",
    );
    const publicTestInstances = await readFile(
      join(directory, "instances/data/public_test.jsonl"),
      "utf8",
    );
    const trainTrajectories = await readFile(
      join(directory, "trajectories/data/train.jsonl"),
      "utf8",
    );
    const validationTrajectories = await readFile(
      join(directory, "trajectories/data/validation.jsonl"),
      "utf8",
    );
    expect(trainInstances.trim().split("\n")).toHaveLength(66);
    expect(validationInstances.trim().split("\n")).toHaveLength(22);
    expect(publicTestInstances.trim().split("\n")).toHaveLength(22);
    expect(trainTrajectories.trim().split("\n")).toHaveLength(66);
    expect(validationTrajectories.trim().split("\n")).toHaveLength(22);
    expect(trainTrajectories).not.toContain('"split":"public_test"');
    expect(validationTrajectories).not.toContain('"split":"public_test"');
  });
});

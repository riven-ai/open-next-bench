import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  adversarialPolicyNames,
  runAdversarialBaselineReport,
  writeAdversarialBaselineReport,
  type AdversarialAggregate,
  type AdversarialBaselineReport,
  type AdversarialPolicyName,
} from "../src/baselines/adversarial.js";

const benchmarkCommit = "a".repeat(40);
let report: AdversarialBaselineReport;

beforeAll(async () => {
  report = await runAdversarialBaselineReport(benchmarkCommit);
}, 30_000);

const aggregateFor = (policy: AdversarialPolicyName): AdversarialAggregate => {
  const aggregate = report.aggregates.find((item) => item.policy === policy);
  if (aggregate === undefined)
    throw new Error(`missing aggregate for ${policy}`);
  return aggregate;
};

describe("adversarial repair baselines", () => {
  it("runs every policy over every owned case through the executable oracle", () => {
    expect(report.corpus).toEqual({
      familyCount: 10,
      caseCount: 110,
      controlCaseCount: 10,
      mutatedCaseCount: 100,
    });
    expect(report.policies).toEqual(adversarialPolicyNames);
    expect(report.caseResults).toHaveLength(990);
    for (const policy of adversarialPolicyNames) {
      const results = report.caseResults.filter(
        (result) => result.policy === policy,
      );
      expect(results).toHaveLength(110);
      expect(new Set(results.map(({ caseId }) => caseId)).size).toBe(110);
      expect(new Set(results.map(({ oracle }) => oracle.source))).toEqual(
        new Set(["evaluator_private_executable"]),
      );
      expect(results.every(({ oracle }) => oracle.checkedFiles > 0)).toBe(true);
    }
    expect(report.proof).toEqual({
      expectedCaseResultCount: 990,
      actualCaseResultCount: 990,
      allCasesCoveredByEveryPolicy: true,
      allCaseBoundsSatisfied: true,
      allAggregateBoundsSatisfied: true,
    });
  });

  it("proves the reference and never-edit controls have the expected bounds", () => {
    expect(aggregateFor("reference")).toMatchObject({
      totalPrimaryScore: 110,
      meanPrimaryScore: 1,
      mutationResolvedCount: 100,
      cleanControlCorrectCount: 10,
      boundSatisfied: true,
    });
    expect(aggregateFor("never-edit")).toMatchObject({
      totalPrimaryScore: 10,
      meanPrimaryScore: 0.090909,
      mutationResolvedCount: 0,
      cleanControlCorrectCount: 10,
      boundSatisfied: true,
    });
  });

  it("bounds every gaming policy at zero and records the rejection reason", () => {
    const zeroScorePolicies = adversarialPolicyNames.filter(
      (policy) => policy !== "reference" && policy !== "never-edit",
    );
    for (const policy of zeroScorePolicies) {
      expect(aggregateFor(policy)).toMatchObject({
        totalPrimaryScore: 0,
        meanPrimaryScore: 0,
        mutationResolvedCount: 0,
        cleanControlCorrectCount: 0,
        boundSatisfied: true,
      });
    }
    expect(
      aggregateFor("duplicate-spam").errorCodeCounts[
        "invalid_submission_count"
      ],
    ).toBe(110);
    for (const policy of [
      "delete-feature",
      "hardcode-answer",
      "modify-tests",
      "oracle-discovery",
      "path-traversal",
    ] as const) {
      expect(aggregateFor(policy).tamperDetectedCount).toBe(110);
    }
    expect(aggregateFor("oracle-discovery").actionRejectedCount).toBe(110);
    expect(aggregateFor("path-traversal").actionRejectedCount).toBe(110);
  });

  it("is byte-deterministic for the same benchmark revision", async () => {
    const repeated = await runAdversarialBaselineReport(benchmarkCommit);
    expect(JSON.stringify(repeated)).toBe(JSON.stringify(report));
  }, 30_000);

  it("writes the complete machine-readable report", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "open-next-bench-baseline-report-"),
    );
    try {
      const outputPath = join(directory, "nested", "report.json");
      await writeAdversarialBaselineReport(report, outputPath);
      const written: unknown = JSON.parse(await readFile(outputPath, "utf8"));
      expect(written).toEqual(report);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects an unpinned benchmark revision before materialization", async () => {
    await expect(runAdversarialBaselineReport("main")).rejects.toThrow(
      "benchmarkCommit must be a 40-character lowercase git SHA",
    );
  });
});

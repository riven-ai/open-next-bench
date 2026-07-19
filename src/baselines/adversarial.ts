import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  evaluateOracleBundle,
  materializeOwnedCorpus,
  removeExecutableArtifacts,
  resetAgentWorkspace,
  resolveConfinedPath,
  type ExecutableCaseBundle,
  type OracleBundleResult,
} from "../executor/executable-cases.js";
import { buildEvaluatorCases } from "../export/dataset.js";
import type { MaterializedMutationCase } from "../mutations/contracts.js";
import {
  ownedCorpusCases,
  ownedCorpusFamilies,
} from "../mutations/owned-corpus.js";
import {
  patchSubmissionSchema,
  verifierEvidenceSchema,
  type EvaluatorRepairCase,
  type PatchSubmission,
  type RepairResult,
  type VerifierEvidence,
} from "../repair/schema.js";
import { scoreRepairEpisode } from "../repair/scorer.js";

export const adversarialPolicyNames = [
  "reference",
  "never-edit",
  "always-edit",
  "delete-feature",
  "hardcode-answer",
  "modify-tests",
  "duplicate-spam",
  "oracle-discovery",
  "path-traversal",
] as const;

export type AdversarialPolicyName = (typeof adversarialPolicyNames)[number];

const errorCodeNames: readonly Exclude<RepairResult["errorCode"], null>[] = [
  "invalid_submission_count",
  "case_mismatch",
  "verification_error",
  "patch_rejected",
  "tamper_detected",
  "unnecessary_control_edit",
  "hidden_test_failed",
  "regression_failed",
];

const BASELINE_VERSION = "repair-adversarial-baselines-1.0";
const BENCHMARK_VERSION = "0.2.0-pilot.1";
const ENVIRONMENT_VERSION = "owned-executable-repair-1.0";
const EXECUTOR_IMAGE = "local/open-next-bench-owned-executor:1.0";
const EXECUTOR_IMAGE_DIGEST = `sha256:${"e".repeat(64)}`;

interface PolicyAction {
  description: string;
  attemptedPaths: readonly string[];
  applied: boolean;
  rejected: boolean;
  rejectionReason: string | null;
}

interface PolicyAttempt {
  action: PolicyAction;
  submissions: readonly PatchSubmission[];
}

export interface ExpectedCaseBound {
  minimumPrimaryScore: number;
  maximumPrimaryScore: number;
  allowedOutcomes: readonly RepairResult["outcome"][];
  allowedErrorCodes: readonly RepairResult["errorCode"][];
}

export interface AdversarialCaseResult {
  policy: AdversarialPolicyName;
  caseId: string;
  templateFamilyId: string;
  split: EvaluatorRepairCase["split"];
  variantKind: EvaluatorRepairCase["variant"]["kind"];
  mutationId: string | null;
  action: PolicyAction;
  oracle: OracleBundleResult & { source: "evaluator_private_executable" };
  result: RepairResult;
  expected: ExpectedCaseBound;
  boundSatisfied: boolean;
}

export interface AdversarialAggregate {
  policy: AdversarialPolicyName;
  caseCount: number;
  controlCaseCount: number;
  mutatedCaseCount: number;
  totalPrimaryScore: number;
  meanPrimaryScore: number;
  mutationResolvedCount: number;
  cleanControlCorrectCount: number;
  tamperDetectedCount: number;
  actionRejectedCount: number;
  outcomeCounts: Record<RepairResult["outcome"], number>;
  errorCodeCounts: Record<string, number>;
  expected: {
    minimumMeanPrimaryScore: number;
    maximumMeanPrimaryScore: number;
    mutationResolvedCount: number;
    cleanControlCorrectCount: number;
  };
  boundSatisfied: boolean;
}

export interface AdversarialBaselineReport {
  schemaVersion: "repair-adversarial-baseline-report-1.0";
  baselineVersion: typeof BASELINE_VERSION;
  benchmarkVersion: typeof BENCHMARK_VERSION;
  benchmarkCommit: string;
  scorerVersion: "repair-scorer-1.0";
  environmentVersion: typeof ENVIRONMENT_VERSION;
  corpus: {
    familyCount: number;
    caseCount: number;
    controlCaseCount: number;
    mutatedCaseCount: number;
  };
  policies: readonly AdversarialPolicyName[];
  caseResults: readonly AdversarialCaseResult[];
  aggregates: readonly AdversarialAggregate[];
  proof: {
    expectedCaseResultCount: number;
    actualCaseResultCount: number;
    allCasesCoveredByEveryPolicy: boolean;
    allCaseBoundsSatisfied: boolean;
    allAggregateBoundsSatisfied: boolean;
  };
}

const roundSix = (value: number): number =>
  Math.round(value * 1_000_000) / 1_000_000;

const sha256 = (value: string): string =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

const unifiedDiff = (path: string, before: string, after: string): string => {
  if (before === after) return "";
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,${String(beforeLines.length)} +1,${String(afterLines.length)} @@`,
    ...beforeLines.map((line) => `-${line}`),
    ...afterLines.map((line) => `+${line}`),
    "",
  ].join("\n");
};

const submission = (
  repairCase: EvaluatorRepairCase,
  policy: AdversarialPolicyName,
  unifiedDiffValue: string,
  changedPaths: readonly string[],
  suffix = "1",
): PatchSubmission =>
  patchSubmissionSchema.parse({
    schemaVersion: "repair-submission-1.0",
    caseId: repairCase.caseId,
    submissionId: `${policy}-${suffix}`,
    unifiedDiff: unifiedDiffValue,
    changedPaths: [...changedPaths],
    publicCheckIds: [],
  });

const unchangedAction = (description: string): PolicyAction => ({
  description,
  attemptedPaths: [],
  applied: false,
  rejected: false,
  rejectionReason: null,
});

const targetPathFor = (mutationCase: MaterializedMutationCase): string => {
  const target =
    mutationCase.changedPaths[0] ??
    Object.keys(mutationCase.agentWorkspace).sort()[0];
  if (target === undefined) {
    throw new Error(`case ${mutationCase.caseId} has no editable files`);
  }
  return target;
};

const writeChangedFile = async (
  bundle: ExecutableCaseBundle,
  path: string,
  content: string,
): Promise<void> => {
  const target = resolveConfinedPath(bundle.agentWorkspaceDirectory, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
};

const rejectedEscapeAction = (
  description: string,
  attemptedPath: string,
  reason: string,
): PolicyAction => ({
  description,
  attemptedPaths: [attemptedPath],
  applied: false,
  rejected: true,
  rejectionReason: reason,
});

const attemptPolicy = async (
  policy: AdversarialPolicyName,
  repairCase: EvaluatorRepairCase,
  mutationCase: MaterializedMutationCase,
  bundle: ExecutableCaseBundle,
): Promise<PolicyAttempt> => {
  if (policy === "reference") {
    for (const path of mutationCase.changedPaths) {
      const content = mutationCase.referenceRepair[path];
      if (content === undefined) {
        throw new Error(`reference repair is missing ${path}`);
      }
      await writeChangedFile(bundle, path, content);
    }
    return {
      action: {
        ...unchangedAction("Apply the evaluator-owned reference repair."),
        attemptedPaths: [...mutationCase.changedPaths],
        applied: mutationCase.changedPaths.length > 0,
      },
      submissions: [
        submission(
          repairCase,
          policy,
          repairCase.evaluator.referenceRepairPatch,
          mutationCase.changedPaths,
        ),
      ],
    };
  }

  if (policy === "never-edit") {
    return {
      action: unchangedAction("Submit without inspecting or editing the case."),
      submissions: [submission(repairCase, policy, "", [])],
    };
  }

  if (policy === "duplicate-spam") {
    return {
      action: unchangedAction("Submit the same empty terminal answer twice."),
      submissions: [
        submission(repairCase, policy, "", [], "1"),
        submission(repairCase, policy, "", [], "2"),
      ],
    };
  }

  if (policy === "oracle-discovery" || policy === "path-traversal") {
    const attemptedPath =
      policy === "oracle-discovery"
        ? "../evaluator-private/oracle-definition.json"
        : "/etc/passwd";
    let rejectionReason: string | null = null;
    try {
      resolveConfinedPath(bundle.agentWorkspaceDirectory, attemptedPath);
    } catch (error) {
      rejectionReason = error instanceof Error ? error.message : String(error);
    }
    if (rejectionReason === null) {
      throw new Error(`${policy} unexpectedly escaped workspace confinement`);
    }
    return {
      action: rejectedEscapeAction(
        policy === "oracle-discovery"
          ? "Attempt to discover the evaluator-private oracle through traversal."
          : "Attempt to read an absolute host path.",
        attemptedPath,
        rejectionReason,
      ),
      submissions: [submission(repairCase, policy, "", [])],
    };
  }

  const targetPath = targetPathFor(mutationCase);
  const before = mutationCase.agentWorkspace[targetPath];
  if (before === undefined) {
    throw new Error(`case ${mutationCase.caseId} is missing ${targetPath}`);
  }

  if (policy === "modify-tests") {
    const testPath = "tests/baseline-protected.test.ts";
    const after = "// adversarial baseline attempted to bypass the verifier\n";
    await writeChangedFile(bundle, testPath, after);
    return {
      action: {
        description: "Add a test file intended to bypass verification.",
        attemptedPaths: [testPath],
        applied: true,
        rejected: false,
        rejectionReason: null,
      },
      submissions: [
        submission(repairCase, policy, unifiedDiff(testPath, "", after), [
          testPath,
        ]),
      ],
    };
  }

  let after: string;
  let description: string;
  if (policy === "always-edit") {
    after = `${before}\n// adversarial always-edit baseline\n`;
    description = "Edit one file regardless of whether a defect exists.";
  } else if (policy === "delete-feature") {
    after = "";
    description = "Erase the target feature instead of repairing it.";
  } else {
    after = "export default function HardcodedAnswer() { return null; }\n";
    description =
      "Replace the target with a fixture-specific hardcoded answer.";
  }
  await writeChangedFile(bundle, targetPath, after);
  return {
    action: {
      description,
      attemptedPaths: [targetPath],
      applied: true,
      rejected: false,
      rejectionReason: null,
    },
    submissions: [
      submission(repairCase, policy, unifiedDiff(targetPath, before, after), [
        targetPath,
      ]),
    ],
  };
};

const oraclePassed = (
  kind: EvaluatorRepairCase["evaluator"]["oracles"][number]["kind"],
  result: OracleBundleResult,
): boolean => {
  if (kind === "hidden_bug") return result.hiddenPassed;
  if (kind === "regression") return result.regressionPassed;
  throw new Error(`unsupported owned executable oracle kind: ${kind}`);
};

interface TamperAssessment {
  protectedFilesUnchanged: boolean;
  featurePreserved: boolean;
  tamperReasons: VerifierEvidence["tamperReasons"];
}

const assessTamper = async (
  repairCase: EvaluatorRepairCase,
  attempt: PolicyAttempt,
  bundle: ExecutableCaseBundle,
): Promise<TamperAssessment> => {
  const changedPaths = attempt.submissions.flatMap((item) => item.changedPaths);
  const protectedFileModified = changedPaths.some((path) =>
    repairCase.evaluator.protectedPaths.some(
      (protectedPath) =>
        path === protectedPath || path.startsWith(`${protectedPath}/`),
    ),
  );
  let featureDeleted = false;
  let fixtureHardcoded = false;
  for (const path of changedPaths) {
    if (
      repairCase.evaluator.protectedPaths.some(
        (protectedPath) =>
          path === protectedPath || path.startsWith(`${protectedPath}/`),
      )
    ) {
      continue;
    }
    const content = await readFile(
      resolveConfinedPath(bundle.agentWorkspaceDirectory, path),
      "utf8",
    );
    featureDeleted ||= content.length === 0;
    fixtureHardcoded ||= content.includes("function HardcodedAnswer()");
  }

  const tamperReasons: VerifierEvidence["tamperReasons"] = [];
  if (protectedFileModified) {
    tamperReasons.push("protected_file_modified", "test_deleted_or_skipped");
  }
  if (featureDeleted) tamperReasons.push("feature_deleted");
  if (fixtureHardcoded) tamperReasons.push("fixture_hardcoded");
  if (attempt.action.rejected) {
    if (
      attempt.action.attemptedPaths.some((path) =>
        path.includes("evaluator-private"),
      )
    ) {
      tamperReasons.push("oracle_discovery");
    } else {
      tamperReasons.push("dependency_escape");
    }
  }
  return {
    protectedFilesUnchanged: !protectedFileModified,
    featurePreserved: !featureDeleted,
    tamperReasons,
  };
};

const verifierEvidence = async (
  repairCase: EvaluatorRepairCase,
  attempt: PolicyAttempt,
  oracle: OracleBundleResult,
  bundle: ExecutableCaseBundle,
): Promise<VerifierEvidence> => {
  const primarySubmission = attempt.submissions[0];
  if (primarySubmission === undefined) {
    throw new Error(`${repairCase.caseId} policy emitted no submission`);
  }
  const tamper = await assessTamper(repairCase, attempt, bundle);
  return verifierEvidenceSchema.parse({
    schemaVersion: "repair-verifier-evidence-1.0",
    caseId: repairCase.caseId,
    submissionId: primarySubmission.submissionId,
    status: "completed",
    patchApplies: true,
    protectedFilesUnchanged: tamper.protectedFilesUnchanged,
    featurePreserved: tamper.featurePreserved,
    tamperReasons: tamper.tamperReasons,
    hiddenBugTestPassed: oracle.hiddenPassed,
    regressionSuitePassed: oracle.regressionPassed,
    qualityScore: 1,
    evidenceScore: 1,
    efficiencyScore: 1,
    oracleResults: repairCase.evaluator.oracles.map((definition) => {
      const passed = oraclePassed(definition.kind, oracle);
      return {
        oracleId: definition.oracleId,
        kind: definition.kind,
        status: passed ? "passed" : "failed",
        exitCode: passed ? definition.expectedExitCode : 1,
        durationMs: 0,
        outputDigest: sha256(
          JSON.stringify({
            caseId: repairCase.caseId,
            oracleId: definition.oracleId,
            passed,
          }),
        ),
      };
    }),
    wallTimeMs: 0,
  });
};

const expectedCaseBound = (
  policy: AdversarialPolicyName,
  kind: EvaluatorRepairCase["variant"]["kind"],
): ExpectedCaseBound => {
  if (policy === "reference") {
    return {
      minimumPrimaryScore: 1,
      maximumPrimaryScore: 1,
      allowedOutcomes: [kind === "control" ? "clean_control" : "resolved"],
      allowedErrorCodes: [null],
    };
  }
  if (policy === "never-edit") {
    return kind === "control"
      ? {
          minimumPrimaryScore: 1,
          maximumPrimaryScore: 1,
          allowedOutcomes: ["clean_control"],
          allowedErrorCodes: [null],
        }
      : {
          minimumPrimaryScore: 0,
          maximumPrimaryScore: 0,
          allowedOutcomes: ["failed"],
          allowedErrorCodes: ["hidden_test_failed"],
        };
  }
  if (policy === "always-edit") {
    return {
      minimumPrimaryScore: 0,
      maximumPrimaryScore: 0,
      allowedOutcomes: ["failed"],
      allowedErrorCodes: [
        kind === "control" ? "unnecessary_control_edit" : "hidden_test_failed",
      ],
    };
  }
  if (policy === "duplicate-spam") {
    return {
      minimumPrimaryScore: 0,
      maximumPrimaryScore: 0,
      allowedOutcomes: ["invalid"],
      allowedErrorCodes: ["invalid_submission_count"],
    };
  }
  return {
    minimumPrimaryScore: 0,
    maximumPrimaryScore: 0,
    allowedOutcomes: ["invalid"],
    allowedErrorCodes: ["tamper_detected"],
  };
};

const satisfiesCaseBound = (
  result: RepairResult,
  expected: ExpectedCaseBound,
): boolean =>
  result.primaryScore >= expected.minimumPrimaryScore &&
  result.primaryScore <= expected.maximumPrimaryScore &&
  expected.allowedOutcomes.includes(result.outcome) &&
  expected.allowedErrorCodes.includes(result.errorCode);

const emptyOutcomeCounts = (): Record<RepairResult["outcome"], number> => ({
  resolved: 0,
  clean_control: 0,
  partial: 0,
  failed: 0,
  invalid: 0,
  environment_error: 0,
});

const emptyErrorCodeCounts = (): Record<string, number> => {
  const counts: Record<string, number> = { none: 0 };
  for (const code of errorCodeNames) counts[code] = 0;
  return counts;
};

const aggregatePolicy = (
  policy: AdversarialPolicyName,
  results: readonly AdversarialCaseResult[],
): AdversarialAggregate => {
  const outcomeCounts = emptyOutcomeCounts();
  const errorCodeCounts = emptyErrorCodeCounts();
  for (const item of results) {
    outcomeCounts[item.result.outcome] += 1;
    const errorKey = item.result.errorCode ?? "none";
    errorCodeCounts[errorKey] = (errorCodeCounts[errorKey] ?? 0) + 1;
  }
  const controlCaseCount = results.filter(
    ({ variantKind }) => variantKind === "control",
  ).length;
  const mutatedCaseCount = results.length - controlCaseCount;
  const totalPrimaryScore = roundSix(
    results.reduce((sum, { result }) => sum + result.primaryScore, 0),
  );
  const meanPrimaryScore = roundSix(totalPrimaryScore / results.length);
  const mutationResolvedCount = results.filter(
    ({ variantKind, result }) =>
      variantKind === "mutated" && result.resolvedWithoutRegression,
  ).length;
  const cleanControlCorrectCount = results.filter(
    ({ variantKind, result }) =>
      variantKind === "control" && result.cleanControlCorrect,
  ).length;
  const expectedMean =
    policy === "reference"
      ? 1
      : policy === "never-edit"
        ? roundSix(controlCaseCount / results.length)
        : 0;
  const expectedMutationResolved =
    policy === "reference" ? mutatedCaseCount : 0;
  const expectedCleanControls =
    policy === "reference" || policy === "never-edit" ? controlCaseCount : 0;
  const expected = {
    minimumMeanPrimaryScore: expectedMean,
    maximumMeanPrimaryScore: expectedMean,
    mutationResolvedCount: expectedMutationResolved,
    cleanControlCorrectCount: expectedCleanControls,
  };
  return {
    policy,
    caseCount: results.length,
    controlCaseCount,
    mutatedCaseCount,
    totalPrimaryScore,
    meanPrimaryScore,
    mutationResolvedCount,
    cleanControlCorrectCount,
    tamperDetectedCount: results.filter(
      ({ result }) => result.errorCode === "tamper_detected",
    ).length,
    actionRejectedCount: results.filter(({ action }) => action.rejected).length,
    outcomeCounts,
    errorCodeCounts,
    expected,
    boundSatisfied:
      results.every(({ boundSatisfied }) => boundSatisfied) &&
      meanPrimaryScore >= expected.minimumMeanPrimaryScore &&
      meanPrimaryScore <= expected.maximumMeanPrimaryScore &&
      mutationResolvedCount === expected.mutationResolvedCount &&
      cleanControlCorrectCount === expected.cleanControlCorrectCount,
  };
};

const evaluatorCasesForCorpus = (
  benchmarkCommit: string,
): EvaluatorRepairCase[] =>
  ownedCorpusFamilies.flatMap(({ template, operators }) =>
    buildEvaluatorCases(template, operators, {
      benchmarkVersion: BENCHMARK_VERSION,
      benchmarkCommit,
      environmentVersion: ENVIRONMENT_VERSION,
      image: EXECUTOR_IMAGE,
      imageDigest: EXECUTOR_IMAGE_DIGEST,
    }),
  );

export const runAdversarialBaselineReport = async (
  benchmarkCommit: string,
): Promise<AdversarialBaselineReport> => {
  if (!/^[a-f0-9]{40}$/u.test(benchmarkCommit)) {
    throw new Error("benchmarkCommit must be a 40-character lowercase git SHA");
  }
  const root = await mkdtemp(join(tmpdir(), "open-next-bench-baselines-"));
  try {
    const bundles = await materializeOwnedCorpus(root);
    const evaluatorCases = evaluatorCasesForCorpus(benchmarkCommit);
    if (
      bundles.length !== ownedCorpusCases.length ||
      evaluatorCases.length !== ownedCorpusCases.length
    ) {
      throw new Error(
        "owned corpus, executable bundle, and evaluator case counts differ",
      );
    }

    const caseResults: AdversarialCaseResult[] = [];
    for (const policy of adversarialPolicyNames) {
      for (const [index, mutationCase] of ownedCorpusCases.entries()) {
        const bundle = bundles[index];
        const repairCase = evaluatorCases[index];
        if (
          bundle === undefined ||
          repairCase === undefined ||
          bundle.caseId !== mutationCase.caseId ||
          repairCase.caseId !== mutationCase.caseId
        ) {
          throw new Error(
            `baseline case alignment failed at index ${String(index)}`,
          );
        }
        await resetAgentWorkspace(bundle);
        const attempt = await attemptPolicy(
          policy,
          repairCase,
          mutationCase,
          bundle,
        );
        const oracle = await evaluateOracleBundle(
          bundle,
          bundle.agentWorkspaceDirectory,
        );
        const evidence = await verifierEvidence(
          repairCase,
          attempt,
          oracle,
          bundle,
        );
        const result = scoreRepairEpisode(
          repairCase,
          attempt.submissions,
          evidence,
        );
        const expected = expectedCaseBound(policy, repairCase.variant.kind);
        caseResults.push({
          policy,
          caseId: repairCase.caseId,
          templateFamilyId: repairCase.templateFamilyId,
          split: repairCase.split,
          variantKind: repairCase.variant.kind,
          mutationId: mutationCase.mutationId,
          action: attempt.action,
          oracle: {
            ...oracle,
            source: "evaluator_private_executable",
          },
          result,
          expected,
          boundSatisfied: satisfiesCaseBound(result, expected),
        });
      }
    }

    const aggregates = adversarialPolicyNames.map((policy) =>
      aggregatePolicy(
        policy,
        caseResults.filter((result) => result.policy === policy),
      ),
    );
    const expectedCaseResultCount =
      ownedCorpusCases.length * adversarialPolicyNames.length;
    return {
      schemaVersion: "repair-adversarial-baseline-report-1.0",
      baselineVersion: BASELINE_VERSION,
      benchmarkVersion: BENCHMARK_VERSION,
      benchmarkCommit,
      scorerVersion: "repair-scorer-1.0",
      environmentVersion: ENVIRONMENT_VERSION,
      corpus: {
        familyCount: ownedCorpusFamilies.length,
        caseCount: ownedCorpusCases.length,
        controlCaseCount: ownedCorpusCases.filter(
          ({ kind }) => kind === "control",
        ).length,
        mutatedCaseCount: ownedCorpusCases.filter(
          ({ kind }) => kind === "mutated",
        ).length,
      },
      policies: adversarialPolicyNames,
      caseResults,
      aggregates,
      proof: {
        expectedCaseResultCount,
        actualCaseResultCount: caseResults.length,
        allCasesCoveredByEveryPolicy:
          caseResults.length === expectedCaseResultCount &&
          adversarialPolicyNames.every(
            (policy) =>
              caseResults.filter((result) => result.policy === policy)
                .length === ownedCorpusCases.length,
          ),
        allCaseBoundsSatisfied: caseResults.every(
          ({ boundSatisfied }) => boundSatisfied,
        ),
        allAggregateBoundsSatisfied: aggregates.every(
          ({ boundSatisfied }) => boundSatisfied,
        ),
      },
    };
  } finally {
    await removeExecutableArtifacts(root);
  }
};

export const writeAdversarialBaselineReport = async (
  report: AdversarialBaselineReport,
  outputPath: string,
): Promise<void> => {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
};

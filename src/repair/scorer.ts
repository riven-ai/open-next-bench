import { Buffer } from "node:buffer";

import {
  evaluatorRepairCaseSchema,
  patchSubmissionSchema,
  repairResultSchema,
  verifierEvidenceSchema,
  type EvaluatorRepairCase,
  type PatchSubmission,
  type RepairResult,
  type VerifierEvidence,
} from "./schema.js";

const roundSix = (value: number): number =>
  Math.round(value * 1_000_000) / 1_000_000;

const emptyDiagnostics = (submissionCount: number) => ({
  submissionCount,
  changedFileCount: 0,
  patchBytes: 0,
  wallTimeMs: 0,
  qualityScore: 0,
  evidenceScore: 0,
  efficiencyScore: 0,
});

const diagnostics = (
  submissionCount: number,
  submission: PatchSubmission,
  evidence: VerifierEvidence | null,
) => ({
  submissionCount,
  changedFileCount: submission.changedPaths.length,
  patchBytes: Buffer.byteLength(submission.unifiedDiff, "utf8"),
  wallTimeMs: evidence?.wallTimeMs ?? 0,
  qualityScore: evidence?.qualityScore ?? 0,
  evidenceScore: evidence?.evidenceScore ?? 0,
  efficiencyScore: evidence?.efficiencyScore ?? 0,
});

const failedResult = ({
  repairCase,
  submissionId,
  outcome,
  errorCode,
  submissionCount,
  submission,
  evidence,
  patchAccepted = false,
  tamperFree = false,
  hiddenBugResolved = false,
  regressionsPassed = false,
  primaryScore = 0,
}: {
  repairCase: EvaluatorRepairCase;
  submissionId: string | null;
  outcome: "partial" | "failed" | "invalid" | "environment_error";
  errorCode:
    | "invalid_submission_count"
    | "case_mismatch"
    | "verification_error"
    | "patch_rejected"
    | "tamper_detected"
    | "unnecessary_control_edit"
    | "hidden_test_failed"
    | "regression_failed";
  submissionCount: number;
  submission?: PatchSubmission;
  evidence?: VerifierEvidence | null;
  patchAccepted?: boolean;
  tamperFree?: boolean;
  hiddenBugResolved?: boolean;
  regressionsPassed?: boolean;
  primaryScore?: number;
}): RepairResult =>
  repairResultSchema.parse({
    schemaVersion: "repair-result-1.0",
    scorerVersion: "repair-scorer-1.0",
    caseId: repairCase.caseId,
    submissionId,
    outcome,
    errorCode,
    primaryScore,
    resolvedWithoutRegression: false,
    cleanControlCorrect: false,
    gates: {
      singleSubmission: submissionCount === 1,
      patchAccepted,
      tamperFree,
      hiddenBugResolved,
      regressionsPassed,
    },
    diagnostics:
      submission === undefined
        ? emptyDiagnostics(submissionCount)
        : diagnostics(submissionCount, submission, evidence ?? null),
  });

const oracleEvidenceIsComplete = (
  repairCase: EvaluatorRepairCase,
  evidence: VerifierEvidence,
): boolean => {
  const resultsById = new Map(
    evidence.oracleResults.map((result) => [result.oracleId, result]),
  );
  if (resultsById.size !== evidence.oracleResults.length) return false;
  return repairCase.evaluator.oracles.every((oracle) => {
    const result = resultsById.get(oracle.oracleId);
    return result !== undefined && result.kind === oracle.kind;
  });
};

const oracleKindPassed = (
  evidence: VerifierEvidence,
  kind: "hidden_bug" | "regression",
): boolean => {
  const results = evidence.oracleResults.filter(
    (result) => result.kind === kind,
  );
  return (
    results.length > 0 && results.every((result) => result.status === "passed")
  );
};

export function scoreRepairEpisode(
  caseInput: EvaluatorRepairCase,
  submissionInputs: readonly PatchSubmission[],
  evidenceInput: VerifierEvidence | null,
): RepairResult {
  const repairCase = evaluatorRepairCaseSchema.parse(caseInput);
  const submissions = submissionInputs.map((submission) =>
    patchSubmissionSchema.parse(submission),
  );

  if (submissions.length !== 1) {
    return failedResult({
      repairCase,
      submissionId: null,
      outcome: "invalid",
      errorCode: "invalid_submission_count",
      submissionCount: submissions.length,
    });
  }

  const submission = submissions[0];
  if (submission === undefined) {
    return failedResult({
      repairCase,
      submissionId: null,
      outcome: "invalid",
      errorCode: "invalid_submission_count",
      submissionCount: submissions.length,
    });
  }
  if (submission.caseId !== repairCase.caseId) {
    return failedResult({
      repairCase,
      submissionId: submission.submissionId,
      outcome: "invalid",
      errorCode: "case_mismatch",
      submissionCount: submissions.length,
      submission,
    });
  }

  const evidence =
    evidenceInput === null ? null : verifierEvidenceSchema.parse(evidenceInput);
  if (
    evidence === null ||
    evidence.caseId !== repairCase.caseId ||
    evidence.submissionId !== submission.submissionId ||
    evidence.status !== "completed" ||
    !oracleEvidenceIsComplete(repairCase, evidence)
  ) {
    return failedResult({
      repairCase,
      submissionId: submission.submissionId,
      outcome:
        evidence?.status === "environment_error" ||
        evidence?.status === "timeout"
          ? "environment_error"
          : "invalid",
      errorCode: "verification_error",
      submissionCount: submissions.length,
      submission,
      evidence,
    });
  }

  const patchBytes = Buffer.byteLength(submission.unifiedDiff, "utf8");
  if (
    !evidence.patchApplies ||
    patchBytes > repairCase.task.budgets.maxPatchBytes
  ) {
    return failedResult({
      repairCase,
      submissionId: submission.submissionId,
      outcome: "invalid",
      errorCode: "patch_rejected",
      submissionCount: submissions.length,
      submission,
      evidence,
    });
  }

  const tamperFree =
    evidence.protectedFilesUnchanged &&
    evidence.featurePreserved &&
    evidence.tamperReasons.length === 0;
  if (!tamperFree) {
    return failedResult({
      repairCase,
      submissionId: submission.submissionId,
      outcome: "invalid",
      errorCode: "tamper_detected",
      submissionCount: submissions.length,
      submission,
      evidence,
      patchAccepted: true,
    });
  }

  const hiddenBugResolved =
    evidence.hiddenBugTestPassed && oracleKindPassed(evidence, "hidden_bug");
  const regressionsPassed =
    evidence.regressionSuitePassed && oracleKindPassed(evidence, "regression");
  const edited =
    submission.changedPaths.length > 0 ||
    submission.unifiedDiff.trim().length > 0;

  if (repairCase.variant.kind === "control") {
    if (edited) {
      return failedResult({
        repairCase,
        submissionId: submission.submissionId,
        outcome: "failed",
        errorCode: "unnecessary_control_edit",
        submissionCount: submissions.length,
        submission,
        evidence,
        patchAccepted: true,
        tamperFree: true,
        hiddenBugResolved,
        regressionsPassed,
      });
    }
    if (!hiddenBugResolved) {
      return failedResult({
        repairCase,
        submissionId: submission.submissionId,
        outcome: "failed",
        errorCode: "hidden_test_failed",
        submissionCount: submissions.length,
        submission,
        evidence,
        patchAccepted: true,
        tamperFree: true,
        regressionsPassed,
      });
    }
    if (!regressionsPassed) {
      return failedResult({
        repairCase,
        submissionId: submission.submissionId,
        outcome: "partial",
        errorCode: "regression_failed",
        submissionCount: submissions.length,
        submission,
        evidence,
        patchAccepted: true,
        tamperFree: true,
        hiddenBugResolved: true,
        primaryScore: 0.2,
      });
    }
    return repairResultSchema.parse({
      schemaVersion: "repair-result-1.0",
      scorerVersion: "repair-scorer-1.0",
      caseId: repairCase.caseId,
      submissionId: submission.submissionId,
      outcome: "clean_control",
      errorCode: null,
      primaryScore: 1,
      resolvedWithoutRegression: true,
      cleanControlCorrect: true,
      gates: {
        singleSubmission: true,
        patchAccepted: true,
        tamperFree: true,
        hiddenBugResolved: true,
        regressionsPassed: true,
      },
      diagnostics: diagnostics(submissions.length, submission, evidence),
    });
  }

  if (!hiddenBugResolved) {
    return failedResult({
      repairCase,
      submissionId: submission.submissionId,
      outcome: "failed",
      errorCode: "hidden_test_failed",
      submissionCount: submissions.length,
      submission,
      evidence,
      patchAccepted: true,
      tamperFree: true,
      regressionsPassed,
    });
  }
  if (!regressionsPassed) {
    return failedResult({
      repairCase,
      submissionId: submission.submissionId,
      outcome: "partial",
      errorCode: "regression_failed",
      submissionCount: submissions.length,
      submission,
      evidence,
      patchAccepted: true,
      tamperFree: true,
      hiddenBugResolved: true,
      primaryScore: 0.2,
    });
  }

  const primaryScore = roundSix(
    0.8 +
      evidence.qualityScore * 0.1 +
      evidence.evidenceScore * 0.05 +
      evidence.efficiencyScore * 0.05,
  );
  return repairResultSchema.parse({
    schemaVersion: "repair-result-1.0",
    scorerVersion: "repair-scorer-1.0",
    caseId: repairCase.caseId,
    submissionId: submission.submissionId,
    outcome: "resolved",
    errorCode: null,
    primaryScore,
    resolvedWithoutRegression: true,
    cleanControlCorrect: false,
    gates: {
      singleSubmission: true,
      patchAccepted: true,
      tamperFree: true,
      hiddenBugResolved: true,
      regressionsPassed: true,
    },
    diagnostics: diagnostics(submissions.length, submission, evidence),
  });
}

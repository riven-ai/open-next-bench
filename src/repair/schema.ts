import { z } from "zod";

const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/);
const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const commitSchema = z.string().regex(/^[a-f0-9]{40}$/);
const workspacePathSchema = z
  .string()
  .min(1)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.split("/").some((segment) => segment === ".."),
    "workspace paths must be relative and cannot contain '..'",
  );

export const repairSplitSchema = z.enum([
  "train",
  "validation",
  "public_test",
  "secret_holdout",
]);

export const repairCategorySchema = z.enum([
  "correctness",
  "typescript",
  "react",
  "nextjs",
  "performance",
  "accessibility",
  "security",
  "data",
]);

export const mutationOperatorSchema = z
  .object({
    schemaVersion: z.literal("repair-mutation-1.0"),
    operatorId: identifierSchema,
    operatorVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    category: repairCategorySchema,
    difficulty: z.enum(["easy", "medium", "hard"]),
    description: z.string().min(1),
    compatibility: z
      .object({
        nextMajorVersions: z.array(z.number().int().positive()).min(1),
        routerModes: z.array(z.enum(["app", "pages", "hybrid"])).min(1),
        requiredPaths: z.array(workspacePathSchema),
      })
      .strict(),
    deterministicInputs: z
      .object({
        seed: z.number().int(),
        implementationDigest: sha256Schema,
      })
      .strict(),
    expectedChangedPaths: z.array(workspacePathSchema).min(1),
    maxChangedFiles: z.number().int().positive(),
    maxPatchBytes: z.number().int().positive(),
    requiredCapabilities: z.array(identifierSchema),
  })
  .strict();

export const executableOracleSchema = z
  .object({
    oracleId: identifierSchema,
    kind: z.enum(["public", "hidden_bug", "regression", "quality"]),
    commandId: identifierSchema,
    timeoutSeconds: z.number().int().positive(),
    expectedExitCode: z.number().int(),
  })
  .strict();

const sourceSchema = z
  .object({
    repository: z.string().min(1),
    commit: commitSchema,
    licenseSpdx: z.string().min(1),
    templatePath: workspacePathSchema.nullable(),
  })
  .strict();

const environmentSchema = z
  .object({
    environmentVersion: z.string().min(1),
    image: z.string().min(1),
    imageDigest: sha256Schema,
    setupHash: sha256Schema,
    networkAccess: z.literal(false),
  })
  .strict();

const budgetsSchema = z
  .object({
    maxSteps: z.number().int().positive(),
    maxTokens: z.number().int().positive(),
    timeoutSeconds: z.number().int().positive(),
    maxOutputBytes: z.number().int().positive(),
    maxPatchBytes: z.number().int().positive(),
  })
  .strict();

const mutationReferenceSchema = z
  .object({
    operatorId: identifierSchema,
    operatorVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    seed: z.number().int(),
  })
  .strict();

export const publicRepairCaseSchema = z
  .object({
    schemaVersion: z.literal("repair-case-1.0"),
    caseId: identifierSchema,
    templateFamilyId: identifierSchema,
    duplicateCluster: sha256Schema,
    split: repairSplitSchema,
    source: sourceSchema,
    environment: environmentSchema,
    scorerVersion: z.literal("repair-scorer-1.0"),
    task: z
      .object({
        issueStatement: z.string().min(1),
        allowedCapabilities: z.array(identifierSchema).min(1),
        budgets: budgetsSchema,
        attemptPolicy: z
          .object({
            attemptsPerCase: z.number().int().positive(),
            terminalSubmissionsPerAttempt: z.literal(1),
          })
          .strict(),
      })
      .strict(),
    variant: z
      .object({
        kind: z.enum(["control", "mutated"]),
        mutations: z.array(mutationReferenceSchema),
      })
      .strict()
      .superRefine((variant, context) => {
        if (variant.kind === "control" && variant.mutations.length !== 0) {
          context.addIssue({
            code: "custom",
            message: "control variants cannot declare mutations",
          });
        }
        if (variant.kind === "mutated" && variant.mutations.length === 0) {
          context.addIssue({
            code: "custom",
            message: "mutated variants require at least one mutation",
          });
        }
      }),
  })
  .strict();

export const evaluatorRepairCaseSchema = publicRepairCaseSchema
  .extend({
    evaluator: z
      .object({
        mutationPatch: z.string(),
        referenceRepairPatch: z.string(),
        protectedPaths: z.array(workspacePathSchema),
        oracles: z.array(executableOracleSchema).min(2),
        groundTruthLocations: z.array(workspacePathSchema),
      })
      .strict()
      .superRefine((evaluator, context) => {
        for (const requiredKind of ["hidden_bug", "regression"] as const) {
          if (!evaluator.oracles.some(({ kind }) => kind === requiredKind)) {
            context.addIssue({
              code: "custom",
              message: `evaluator requires a ${requiredKind} oracle`,
            });
          }
        }
      }),
  })
  .strict();

export const toPublicRepairCase = (
  repairCase: EvaluatorRepairCase,
): PublicRepairCase => {
  const {
    schemaVersion,
    caseId,
    templateFamilyId,
    duplicateCluster,
    split,
    source,
    environment,
    scorerVersion,
    task,
    variant,
  } = repairCase;
  return publicRepairCaseSchema.parse({
    schemaVersion,
    caseId,
    templateFamilyId,
    duplicateCluster,
    split,
    source,
    environment,
    scorerVersion,
    task,
    variant,
  });
};

export const patchSubmissionSchema = z
  .object({
    schemaVersion: z.literal("repair-submission-1.0"),
    caseId: identifierSchema,
    submissionId: identifierSchema,
    unifiedDiff: z.string().max(1_000_000),
    changedPaths: z.array(workspacePathSchema).max(1_000),
    publicCheckIds: z.array(identifierSchema).max(100),
  })
  .strict()
  .superRefine((submission, context) => {
    if (
      new Set(submission.changedPaths).size !== submission.changedPaths.length
    ) {
      context.addIssue({
        code: "custom",
        message: "changedPaths cannot contain duplicates",
      });
    }
  });

export const executableOracleResultSchema = z
  .object({
    oracleId: identifierSchema,
    kind: z.enum(["public", "hidden_bug", "regression", "quality"]),
    status: z.enum(["passed", "failed", "error", "timeout"]),
    exitCode: z.number().int().nullable(),
    durationMs: z.number().int().nonnegative(),
    outputDigest: sha256Schema,
  })
  .strict();

export const verifierEvidenceSchema = z
  .object({
    schemaVersion: z.literal("repair-verifier-evidence-1.0"),
    caseId: identifierSchema,
    submissionId: identifierSchema,
    status: z.enum(["completed", "environment_error", "timeout"]),
    patchApplies: z.boolean(),
    protectedFilesUnchanged: z.boolean(),
    featurePreserved: z.boolean(),
    tamperReasons: z.array(
      z.enum([
        "protected_file_modified",
        "test_deleted_or_skipped",
        "feature_deleted",
        "fixture_hardcoded",
        "dependency_escape",
        "network_escape",
        "oracle_discovery",
      ]),
    ),
    hiddenBugTestPassed: z.boolean(),
    regressionSuitePassed: z.boolean(),
    qualityScore: z.number().min(0).max(1),
    evidenceScore: z.number().min(0).max(1),
    efficiencyScore: z.number().min(0).max(1),
    oracleResults: z.array(executableOracleResultSchema),
    wallTimeMs: z.number().int().nonnegative(),
  })
  .strict();

export const repairErrorCodeSchema = z.enum([
  "invalid_submission_count",
  "case_mismatch",
  "verification_error",
  "patch_rejected",
  "tamper_detected",
  "unnecessary_control_edit",
  "hidden_test_failed",
  "regression_failed",
]);

export const repairResultSchema = z
  .object({
    schemaVersion: z.literal("repair-result-1.0"),
    scorerVersion: z.literal("repair-scorer-1.0"),
    caseId: identifierSchema,
    submissionId: identifierSchema.nullable(),
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
    gates: z
      .object({
        singleSubmission: z.boolean(),
        patchAccepted: z.boolean(),
        tamperFree: z.boolean(),
        hiddenBugResolved: z.boolean(),
        regressionsPassed: z.boolean(),
      })
      .strict(),
    diagnostics: z
      .object({
        submissionCount: z.number().int().nonnegative(),
        changedFileCount: z.number().int().nonnegative(),
        patchBytes: z.number().int().nonnegative(),
        wallTimeMs: z.number().int().nonnegative(),
        qualityScore: z.number().min(0).max(1),
        evidenceScore: z.number().min(0).max(1),
        efficiencyScore: z.number().min(0).max(1),
      })
      .strict(),
  })
  .strict();

export const repairRunManifestSchema = z
  .object({
    schemaVersion: z.literal("repair-run-manifest-1.0"),
    runId: identifierSchema,
    benchmarkVersion: z.string().min(1),
    benchmarkCommit: commitSchema,
    scorerVersion: z.literal("repair-scorer-1.0"),
    environmentVersion: z.string().min(1),
    split: repairSplitSchema,
    model: z
      .object({
        id: z.string().min(1),
        revision: z.string().min(1),
        quantization: z.string().min(1).nullable(),
      })
      .strict(),
    scaffold: z
      .object({
        id: identifierSchema,
        revision: z.string().min(1),
        systemPromptHash: sha256Schema,
      })
      .strict(),
    budgets: budgetsSchema,
    sampling: z
      .object({
        temperature: z.number().min(0),
        topP: z.number().min(0).max(1),
        seed: z.number().int(),
      })
      .strict(),
    attemptPolicy: z
      .object({
        attemptsPerCase: z.number().int().positive(),
        independentAttempts: z.boolean(),
      })
      .strict(),
    caseIds: z.array(identifierSchema).min(1),
    startedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const repairScoringInputSchema = z
  .object({
    case: evaluatorRepairCaseSchema,
    submissions: z.array(patchSubmissionSchema),
    evidence: verifierEvidenceSchema.nullable(),
  })
  .strict();

export type MutationOperator = z.infer<typeof mutationOperatorSchema>;
export type ExecutableOracle = z.infer<typeof executableOracleSchema>;
export type PublicRepairCase = z.infer<typeof publicRepairCaseSchema>;
export type EvaluatorRepairCase = z.infer<typeof evaluatorRepairCaseSchema>;
export type PatchSubmission = z.infer<typeof patchSubmissionSchema>;
export type ExecutableOracleResult = z.infer<
  typeof executableOracleResultSchema
>;
export type VerifierEvidence = z.infer<typeof verifierEvidenceSchema>;
export type RepairResult = z.infer<typeof repairResultSchema>;
export type RepairRunManifest = z.infer<typeof repairRunManifestSchema>;
export type RepairScoringInput = z.infer<typeof repairScoringInputSchema>;

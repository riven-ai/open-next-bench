import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { materializeFamily, workspaceDigest } from "../mutations/factory.js";
import type {
  MaterializedMutationCase,
  MutationOperator,
  TemplateFamily,
  Workspace,
} from "../mutations/contracts.js";
import {
  evaluatorRepairCaseSchema,
  mutationOperatorSchema,
  publicRepairCaseSchema,
  toPublicRepairCase,
  type EvaluatorRepairCase,
  type PublicRepairCase,
} from "../repair/schema.js";

const commitSchema = z.string().regex(/^[a-f0-9]{40}$/);

export const exportOptionsSchema = z
  .object({
    benchmarkVersion: z.string().min(1),
    benchmarkCommit: commitSchema,
    environmentVersion: z.string().min(1),
    image: z.string().min(1),
    imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    outputDirectory: z.string().min(1),
  })
  .strict();

export type ExportOptions = z.infer<typeof exportOptionsSchema>;

export const trajectoryRowSchema = z
  .object({
    schemaVersion: z.literal("repair-trajectory-1.0"),
    trajectoryId: z.string().min(1),
    caseId: z.string().min(1),
    templateFamilyId: z.string().min(1),
    split: z.enum(["train", "validation", "public_test"]),
    source: z.literal("reference_repair"),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["system", "user", "assistant"]),
            content: z.string(),
          })
          .strict(),
      )
      .min(3),
    submittedPatch: z.string(),
    changedPaths: z.array(z.string()),
    reward: z.literal(1),
    resolvedWithoutRegression: z.literal(true),
    terminationReason: z.literal("reference_verified"),
  })
  .strict();

export type TrajectoryRow = z.infer<typeof trajectoryRowSchema>;

const sha256 = (value: string): string =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

const splitForFamily = (
  familyId: string,
): "train" | "validation" | "public_test" => {
  const byte = createHash("sha256").update(familyId).digest()[0];
  if (byte === undefined) throw new Error("unable to hash family id");
  if (byte < 154) return "train";
  if (byte < 205) return "validation";
  return "public_test";
};

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

const patchBetween = (
  before: Workspace,
  after: Workspace,
  paths: readonly string[],
): string =>
  paths
    .map((path) => unifiedDiff(path, before[path] ?? "", after[path] ?? ""))
    .join("");

const operatorForCase = (
  item: MaterializedMutationCase,
  operators: readonly MutationOperator[],
): MutationOperator | null => {
  if (item.mutationId === null) return null;
  const operator = operators.find(
    (candidate) => candidate.mutationId === item.mutationId,
  );
  if (operator === undefined) {
    throw new Error(`missing operator for case ${item.caseId}`);
  }
  return operator;
};

const setupHashFor = (template: TemplateFamily): string =>
  sha256(
    JSON.stringify({
      familyId: template.familyId,
      packageJson: template.files["package.json"] ?? "",
    }),
  );

export const buildEvaluatorCases = (
  template: TemplateFamily,
  operators: readonly MutationOperator[],
  optionsInput: Omit<ExportOptions, "outputDirectory">,
): EvaluatorRepairCase[] => {
  const options = exportOptionsSchema
    .omit({ outputDirectory: true })
    .parse(optionsInput);
  const split = splitForFamily(template.familyId);
  const duplicateCluster = workspaceDigest(template.files);
  return materializeFamily(template, operators).map((item) => {
    const operator = operatorForCase(item, operators);
    const mutationPatch = patchBetween(
      item.cleanWorkspace,
      item.agentWorkspace,
      item.changedPaths,
    );
    const referenceRepairPatch = patchBetween(
      item.agentWorkspace,
      item.referenceRepair,
      item.changedPaths,
    );
    return evaluatorRepairCaseSchema.parse({
      schemaVersion: "repair-case-1.0",
      caseId: item.caseId,
      templateFamilyId: item.templateFamilyId,
      duplicateCluster,
      split,
      source: {
        repository: "riven-ai/open-next-bench",
        commit: options.benchmarkCommit,
        licenseSpdx: template.licenseSpdx,
        templatePath: `corpus/templates/${template.familyId}`,
      },
      environment: {
        environmentVersion: options.environmentVersion,
        image: options.image,
        imageDigest: options.imageDigest,
        setupHash: setupHashFor(template),
        networkAccess: false,
      },
      scorerVersion: "repair-scorer-1.0",
      task: {
        issueStatement: item.issueStatement,
        allowedCapabilities: [
          "list_files",
          "search",
          "read_file",
          "edit_file",
          "run_check",
          "submit_patch",
        ],
        budgets: {
          maxSteps: 40,
          maxTokens: 32_768,
          timeoutSeconds: 900,
          maxOutputBytes: 1_000_000,
          maxPatchBytes: 250_000,
        },
        attemptPolicy: {
          attemptsPerCase: 1,
          terminalSubmissionsPerAttempt: 1,
        },
      },
      variant: {
        kind: item.kind,
        mutations:
          operator === null
            ? []
            : [
                {
                  operatorId: operator.mutationId,
                  operatorVersion: operator.version,
                  seed: 0,
                },
              ],
      },
      evaluator: {
        mutationPatch,
        referenceRepairPatch,
        protectedPaths: ["tests"],
        oracles: [
          {
            oracleId: `${item.caseId}.hidden`,
            kind: "hidden_bug",
            commandId: `${item.caseId}.hidden`,
            timeoutSeconds: 120,
            expectedExitCode: 0,
          },
          {
            oracleId: `${item.caseId}.regression`,
            kind: "regression",
            commandId: "public-smoke",
            timeoutSeconds: 120,
            expectedExitCode: 0,
          },
        ],
        groundTruthLocations: [...item.changedPaths],
      },
    });
  });
};

export const buildMutationRows = (
  operators: readonly MutationOperator[],
): unknown[] =>
  operators.map((operator) =>
    mutationOperatorSchema.parse({
      schemaVersion: "repair-mutation-1.0",
      operatorId: operator.mutationId,
      operatorVersion: operator.version,
      category: operator.category,
      difficulty: operator.difficulty,
      description: operator.issueStatement,
      compatibility: {
        nextMajorVersions: [16],
        routerModes: ["app"],
        requiredPaths: [operator.changedPath],
      },
      deterministicInputs: {
        seed: 0,
        implementationDigest: sha256(operator.apply.toString()),
      },
      expectedChangedPaths: [operator.changedPath],
      maxChangedFiles: 1,
      maxPatchBytes: 250_000,
      requiredCapabilities: ["read_file", "edit_file", "submit_patch"],
    }),
  );

export const buildReferenceTrajectories = (
  cases: readonly EvaluatorRepairCase[],
): TrajectoryRow[] =>
  cases
    .filter((item) => item.split !== "secret_holdout")
    .map((item) =>
      trajectoryRowSchema.parse({
        schemaVersion: "repair-trajectory-1.0",
        trajectoryId: `${item.caseId}.reference`,
        caseId: item.caseId,
        templateFamilyId: item.templateFamilyId,
        split: item.split,
        source: "reference_repair",
        messages: [
          {
            role: "system",
            content:
              "Repair the reported defect with the smallest behaviorally correct patch. Do not modify tests or verifier files.",
          },
          { role: "user", content: item.task.issueStatement },
          {
            role: "assistant",
            content:
              item.evaluator.referenceRepairPatch.length === 0
                ? "The project is a clean control; no patch is required."
                : item.evaluator.referenceRepairPatch,
          },
        ],
        submittedPatch: item.evaluator.referenceRepairPatch,
        changedPaths: item.evaluator.groundTruthLocations,
        reward: 1,
        resolvedWithoutRegression: true,
        terminationReason: "reference_verified",
      }),
    );

const jsonLines = (rows: readonly unknown[]): string =>
  `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;

const datasetCard = (
  options: ExportOptions,
  instanceCount: number,
): string => `---
pretty_name: Open Next Bench Repair Pilot
license: apache-2.0
task_categories:
  - text-generation
tags:
  - code
  - agents
  - software-engineering
  - nextjs
  - synthetic
---

# Open Next Bench Repair Pilot

Private-first, Riven-authored repair training data generated by Open Next Bench
${options.benchmarkVersion} at commit ${options.benchmarkCommit}.

This release contains ${String(instanceCount)} task instances plus verified reference-repair
trajectories. All variants from a template remain in one family-level split. Evaluator-private
mutation patches, hidden tests, and secret-holdout trajectories are not part of the public instances
file. This pilot is for training-system and generalization experiments, not a leaderboard claim.
`;

export interface DatasetExportResult {
  outputDirectory: string;
  instanceCount: number;
  trajectoryCount: number;
  manifestDigest: string;
}

export const exportRepairDataset = async (
  template: TemplateFamily,
  operators: readonly MutationOperator[],
  optionsInput: ExportOptions,
): Promise<DatasetExportResult> => {
  const options = exportOptionsSchema.parse(optionsInput);
  const evaluatorCases = buildEvaluatorCases(template, operators, {
    benchmarkVersion: options.benchmarkVersion,
    benchmarkCommit: options.benchmarkCommit,
    environmentVersion: options.environmentVersion,
    image: options.image,
    imageDigest: options.imageDigest,
  });
  const publicCases: PublicRepairCase[] = evaluatorCases.map((item) =>
    publicRepairCaseSchema.parse(toPublicRepairCase(item)),
  );
  const trajectories = buildReferenceTrajectories(evaluatorCases);
  const mutations = buildMutationRows(operators);
  const manifest = {
    schemaVersion: "repair-dataset-manifest-1.0",
    benchmarkVersion: options.benchmarkVersion,
    benchmarkCommit: options.benchmarkCommit,
    environmentVersion: options.environmentVersion,
    scorerVersion: "repair-scorer-1.0",
    templateFamilyIds: [template.familyId],
    instanceCount: publicCases.length,
    trajectoryCount: trajectories.length,
    files: {
      instances: "instances.jsonl",
      trajectories: "trajectories.jsonl",
      mutations: "mutations.jsonl",
    },
  };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  await mkdir(options.outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      join(options.outputDirectory, "instances.jsonl"),
      jsonLines(publicCases),
    ),
    writeFile(
      join(options.outputDirectory, "trajectories.jsonl"),
      jsonLines(trajectories),
    ),
    writeFile(
      join(options.outputDirectory, "mutations.jsonl"),
      jsonLines(mutations),
    ),
    writeFile(join(options.outputDirectory, "MANIFEST.json"), manifestJson),
    writeFile(
      join(options.outputDirectory, "README.md"),
      datasetCard(options, publicCases.length),
    ),
  ]);
  return {
    outputDirectory: options.outputDirectory,
    instanceCount: publicCases.length,
    trajectoryCount: trajectories.length,
    manifestDigest: sha256(manifestJson),
  };
};

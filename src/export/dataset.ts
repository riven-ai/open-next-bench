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
  const split = template.split;
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
    .filter((item) => item.split === "train" || item.split === "validation")
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
  privateEvaluationCount: number;
  manifestDigest: string;
}

export interface CorpusFamilyInput {
  template: TemplateFamily;
  operators: readonly MutationOperator[];
}

interface PrivateEvaluationRow {
  schemaVersion: "repair-evaluator-bundle-1.1";
  case: EvaluatorRepairCase;
  agentWorkspace: Workspace;
  referenceWorkspace: Workspace;
}

const buildPrivateEvaluationRows = (
  family: CorpusFamilyInput,
  options: Omit<ExportOptions, "outputDirectory">,
): PrivateEvaluationRow[] => {
  const evaluatorCases = buildEvaluatorCases(
    family.template,
    family.operators,
    options,
  );
  const materialized = materializeFamily(family.template, family.operators);
  return evaluatorCases.map((repairCase, index) => {
    const item = materialized[index];
    if (item === undefined || item.caseId !== repairCase.caseId) {
      throw new Error("materialized case order differs from evaluator cases");
    }
    return {
      schemaVersion: "repair-evaluator-bundle-1.1",
      case: repairCase,
      agentWorkspace: item.agentWorkspace,
      referenceWorkspace: item.referenceRepair,
    };
  });
};

const rowsForSplit = <Row extends { split: string }>(
  rows: readonly Row[],
  split: string,
): Row[] => rows.filter((row) => row.split === split);

const casesForSplit = (
  rows: readonly PublicRepairCase[],
  split: PublicRepairCase["split"],
): PublicRepairCase[] => rowsForSplit(rows, split);

const trajectoriesForSplit = (
  rows: readonly TrajectoryRow[],
  split: TrajectoryRow["split"],
): TrajectoryRow[] => rowsForSplit(rows, split);

export const exportRepairCorpus = async (
  families: readonly CorpusFamilyInput[],
  optionsInput: ExportOptions,
): Promise<DatasetExportResult> => {
  const options = exportOptionsSchema.parse(optionsInput);
  if (families.length === 0) throw new Error("at least one family is required");
  const caseOptions = {
    benchmarkVersion: options.benchmarkVersion,
    benchmarkCommit: options.benchmarkCommit,
    environmentVersion: options.environmentVersion,
    image: options.image,
    imageDigest: options.imageDigest,
  };
  const privateRows = families.flatMap((family) =>
    buildPrivateEvaluationRows(family, caseOptions),
  );
  const evaluatorCases = privateRows.map((row) => row.case);
  const publicCases: PublicRepairCase[] = evaluatorCases.map((item) =>
    publicRepairCaseSchema.parse(toPublicRepairCase(item)),
  );
  const trajectories = buildReferenceTrajectories(evaluatorCases);
  const mutations = families.flatMap(({ operators }) =>
    buildMutationRows(operators),
  );
  const manifest = {
    schemaVersion: "repair-dataset-manifest-1.0",
    benchmarkVersion: options.benchmarkVersion,
    benchmarkCommit: options.benchmarkCommit,
    environmentVersion: options.environmentVersion,
    scorerVersion: "repair-scorer-1.0",
    templateFamilyIds: families.map(({ template }) => template.familyId),
    instanceCount: publicCases.length,
    trajectoryCount: trajectories.length,
    privateEvaluationCount: privateRows.length,
    splitCounts: {
      trainFamilies: families.filter(
        ({ template }) => template.split === "train",
      ).length,
      validationFamilies: families.filter(
        ({ template }) => template.split === "validation",
      ).length,
      publicTestFamilies: families.filter(
        ({ template }) => template.split === "public_test",
      ).length,
      trainInstances: casesForSplit(publicCases, "train").length,
      validationInstances: casesForSplit(publicCases, "validation").length,
      publicTestInstances: casesForSplit(publicCases, "public_test").length,
    },
    files: {
      instances: {
        train: "instances/data/train.jsonl",
        validation: "instances/data/validation.jsonl",
        publicTest: "instances/data/public_test.jsonl",
      },
      trajectories: {
        train: "trajectories/data/train.jsonl",
        validation: "trajectories/data/validation.jsonl",
      },
      mutations: "instances/mutations.jsonl",
      privateEvaluatorBundle: "private/evaluator-cases.jsonl",
    },
  };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  const instanceDirectory = join(options.outputDirectory, "instances");
  const instanceDataDirectory = join(instanceDirectory, "data");
  const trajectoryDirectory = join(options.outputDirectory, "trajectories");
  const trajectoryDataDirectory = join(trajectoryDirectory, "data");
  const privateDirectory = join(options.outputDirectory, "private");
  await Promise.all([
    mkdir(instanceDataDirectory, { recursive: true }),
    mkdir(trajectoryDataDirectory, { recursive: true }),
    mkdir(privateDirectory, { recursive: true }),
  ]);
  const card = datasetCard(options, publicCases.length);
  await Promise.all([
    writeFile(
      join(instanceDataDirectory, "train.jsonl"),
      jsonLines(casesForSplit(publicCases, "train")),
    ),
    writeFile(
      join(instanceDataDirectory, "validation.jsonl"),
      jsonLines(casesForSplit(publicCases, "validation")),
    ),
    writeFile(
      join(instanceDataDirectory, "public_test.jsonl"),
      jsonLines(casesForSplit(publicCases, "public_test")),
    ),
    writeFile(join(instanceDirectory, "mutations.jsonl"), jsonLines(mutations)),
    writeFile(join(instanceDirectory, "README.md"), card),
    writeFile(join(instanceDirectory, "MANIFEST.json"), manifestJson),
    writeFile(
      join(trajectoryDataDirectory, "train.jsonl"),
      jsonLines(trajectoriesForSplit(trajectories, "train")),
    ),
    writeFile(
      join(trajectoryDataDirectory, "validation.jsonl"),
      jsonLines(trajectoriesForSplit(trajectories, "validation")),
    ),
    writeFile(join(trajectoryDirectory, "README.md"), card),
    writeFile(join(trajectoryDirectory, "MANIFEST.json"), manifestJson),
    writeFile(
      join(privateDirectory, "evaluator-cases.jsonl"),
      jsonLines(privateRows),
    ),
    writeFile(join(options.outputDirectory, "MANIFEST.json"), manifestJson),
  ]);
  return {
    outputDirectory: options.outputDirectory,
    instanceCount: publicCases.length,
    trajectoryCount: trajectories.length,
    privateEvaluationCount: privateRows.length,
    manifestDigest: sha256(manifestJson),
  };
};

export const exportRepairDataset = async (
  template: TemplateFamily,
  operators: readonly MutationOperator[],
  optionsInput: ExportOptions,
): Promise<DatasetExportResult> =>
  exportRepairCorpus([{ template, operators }], optionsInput);

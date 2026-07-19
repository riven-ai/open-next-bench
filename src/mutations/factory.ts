import { createHash } from "node:crypto";

import type {
  MaterializedMutationCase,
  MutationOperator,
  TemplateFamily,
  Workspace,
} from "./contracts.js";

const cloneWorkspace = (workspace: Workspace): Workspace => ({ ...workspace });

export const workspaceDigest = (workspace: Workspace): string => {
  const hash = createHash("sha256");
  for (const [path, content] of Object.entries(workspace).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    hash.update(path);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
};

export const replaceExactlyOnce = (
  workspace: Workspace,
  path: string,
  before: string,
  after: string,
): Workspace => {
  const content = workspace[path];
  if (content === undefined) throw new Error(`missing mutation path: ${path}`);
  const first = content.indexOf(before);
  if (first < 0 || content.indexOf(before, first + before.length) >= 0) {
    throw new Error(`mutation anchor must occur exactly once: ${path}`);
  }
  return { ...workspace, [path]: content.replace(before, after) };
};

export const materializeFamily = (
  template: TemplateFamily,
  operators: readonly MutationOperator[],
): MaterializedMutationCase[] => {
  const cleanWorkspace = cloneWorkspace(template.files);
  const cleanCase: MaterializedMutationCase = {
    caseId: `${template.familyId}--control`,
    templateFamilyId: template.familyId,
    kind: "control",
    mutationId: null,
    mutationVersion: null,
    category: null,
    difficulty: null,
    issueStatement:
      "Verify this project and make no changes when no reproducible defect exists.",
    cleanWorkspace,
    agentWorkspace: cloneWorkspace(cleanWorkspace),
    referenceRepair: cloneWorkspace(cleanWorkspace),
    changedPaths: [],
  };

  const mutations = operators.map((operator) => {
    const mutated = operator.apply(cleanWorkspace);
    if (workspaceDigest(mutated) === workspaceDigest(cleanWorkspace)) {
      throw new Error(
        `mutation ${operator.mutationId} did not change the workspace`,
      );
    }
    return {
      caseId: `${template.familyId}--${operator.mutationId}`,
      templateFamilyId: template.familyId,
      kind: "mutated" as const,
      mutationId: operator.mutationId,
      mutationVersion: operator.version,
      category: operator.category,
      difficulty: operator.difficulty,
      issueStatement: operator.issueStatement,
      cleanWorkspace,
      agentWorkspace: mutated,
      referenceRepair: cloneWorkspace(cleanWorkspace),
      changedPaths: [operator.changedPath],
    };
  });

  return [cleanCase, ...mutations];
};

export interface ValidationEvidence {
  mutationId: string;
  cleanPasses: boolean;
  mutatedFails: boolean;
  referencePasses: boolean;
  repetitions: number;
  messages: readonly string[];
}

export const validateOperator = (
  template: TemplateFamily,
  operator: MutationOperator,
  repetitions = 3,
): ValidationEvidence => {
  if (!Number.isInteger(repetitions) || repetitions < 1) {
    throw new Error("repetitions must be a positive integer");
  }
  const messages: string[] = [];
  let cleanPasses = true;
  let mutatedFails = true;
  let referencePasses = true;
  for (let index = 0; index < repetitions; index += 1) {
    const clean = cloneWorkspace(template.files);
    const mutated = operator.apply(clean);
    const reference = cloneWorkspace(clean);
    const cleanResult = operator.oracle(clean);
    const mutatedResult = operator.oracle(mutated);
    const referenceResult = operator.oracle(reference);
    cleanPasses &&= cleanResult.passed;
    mutatedFails &&= !mutatedResult.passed;
    referencePasses &&= referenceResult.passed;
    messages.push(
      `run=${String(index + 1)} clean=${cleanResult.message} mutated=${mutatedResult.message} reference=${referenceResult.message}`,
    );
  }
  return {
    mutationId: operator.mutationId,
    cleanPasses,
    mutatedFails,
    referencePasses,
    repetitions,
    messages,
  };
};

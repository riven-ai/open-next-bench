export type Workspace = Readonly<Record<string, string>>;

export interface TemplateFamily {
  familyId: string;
  name: string;
  licenseSpdx: string;
  description: string;
  split: "train" | "validation" | "public_test";
  files: Workspace;
}

export interface MutationOracleResult {
  passed: boolean;
  message: string;
}

export interface MutationOperator {
  mutationId: string;
  version: string;
  category:
    | "accessibility"
    | "correctness"
    | "nextjs"
    | "performance"
    | "react"
    | "security"
    | "typescript";
  difficulty: "easy" | "medium" | "hard";
  issueStatement: string;
  changedPath: string;
  apply: (workspace: Workspace) => Workspace;
  oracle: (workspace: Workspace) => MutationOracleResult;
}

export interface MaterializedMutationCase {
  caseId: string;
  templateFamilyId: string;
  kind: "control" | "mutated";
  mutationId: string | null;
  mutationVersion: string | null;
  category: MutationOperator["category"] | null;
  difficulty: MutationOperator["difficulty"] | null;
  issueStatement: string;
  cleanWorkspace: Workspace;
  agentWorkspace: Workspace;
  referenceRepair: Workspace;
  changedPaths: readonly string[];
}

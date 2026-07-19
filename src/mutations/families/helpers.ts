import type {
  MutationOperator,
  MutationOracleResult,
  TemplateFamily,
  Workspace,
} from "../contracts.js";
import { replaceExactlyOnce } from "../factory.js";

export interface SyntheticTemplateInput {
  familyId: string;
  name: string;
  description: string;
  split: TemplateFamily["split"];
  files: Workspace;
}

export const syntheticTemplate = (
  input: SyntheticTemplateInput,
): TemplateFamily => ({
  familyId: input.familyId,
  name: input.name,
  licenseSpdx: "Apache-2.0",
  description: input.description,
  split: input.split,
  files: {
    "package.json": JSON.stringify(
      {
        name: input.familyId,
        private: true,
        scripts: { test: "node tests/public-smoke.mjs" },
        dependencies: {
          next: "16.2.4",
          react: "19.2.0",
          "react-dom": "19.2.0",
        },
      },
      null,
      2,
    ),
    "tests/public-smoke.mjs": `import assert from "node:assert/strict";
assert.equal(1 + 1, 2);
console.log("public smoke passed");
`,
    ...input.files,
  },
});

export interface ReplacementMutationInput {
  mutationId: string;
  category: MutationOperator["category"];
  difficulty: MutationOperator["difficulty"];
  issueStatement: string;
  changedPath: string;
  before: string;
  after: string;
}

const originalBehaviorOracle = (
  workspace: Workspace,
  path: string,
  expected: string,
): MutationOracleResult =>
  workspace[path]?.includes(expected) === true
    ? { passed: true, message: `${path} preserves ${expected}` }
    : { passed: false, message: `${path} is missing ${expected}` };

export const replacementMutations = (
  definitions: readonly ReplacementMutationInput[],
): readonly MutationOperator[] =>
  definitions.map((definition) => ({
    mutationId: definition.mutationId,
    version: "1.0.0",
    category: definition.category,
    difficulty: definition.difficulty,
    issueStatement: definition.issueStatement,
    changedPath: definition.changedPath,
    apply: (workspace) =>
      replaceExactlyOnce(
        workspace,
        definition.changedPath,
        definition.before,
        definition.after,
      ),
    oracle: (workspace) =>
      originalBehaviorOracle(
        workspace,
        definition.changedPath,
        definition.before,
      ),
  }));

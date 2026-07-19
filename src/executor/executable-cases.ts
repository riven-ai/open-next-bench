import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import type {
  MaterializedMutationCase,
  Workspace,
} from "../mutations/contracts.js";
import {
  ownedCorpusCases,
  ownedCorpusFamilies,
} from "../mutations/owned-corpus.js";
import { workspaceDigest } from "../mutations/factory.js";

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_FILES = 1_000;
const DEFAULT_MAX_BYTES = 5_000_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64_000;
const DEFAULT_TIMEOUT_MS = 5_000;

export interface ExecutorBounds {
  maxFiles: number;
  maxTotalBytes: number;
  maxOutputBytes: number;
  timeoutMs: number;
}

export interface ExecutableOracleCheck {
  path: string;
  expectedDigest: string;
}

export interface ExecutableOracleDefinition {
  schemaVersion: "owned-executable-oracle-1.0";
  caseId: string;
  hiddenChecks: readonly ExecutableOracleCheck[];
  regressionChecks: readonly ExecutableOracleCheck[];
}

export interface OracleBundleResult {
  caseId: string;
  hiddenPassed: boolean;
  regressionPassed: boolean;
  checkedFiles: number;
  messages: readonly string[];
}

export interface ExecutableCaseBundle {
  caseId: string;
  rootDirectory: string;
  immutableSnapshotDirectory: string;
  agentWorkspaceDirectory: string;
  evaluatorPrivateDirectory: string;
  oracleDefinitionPath: string;
  oracleRunnerPath: string;
  snapshotDigest: string;
  bounds: ExecutorBounds;
}

export interface ExecutableValidationEvidence {
  caseId: string;
  repetitions: number;
  cleanPasses: boolean;
  mutatedFails: boolean;
  mutatedRegressionPasses: boolean;
  referencePasses: boolean;
}

const contentDigest = (content: string): string =>
  `sha256:${createHash("sha256").update(content).digest("hex")}`;

export const resolveConfinedPath = (root: string, path: string): string => {
  if (
    path.length === 0 ||
    isAbsolute(path) ||
    path.split(/[\\/]/u).some((segment) => segment === "..")
  ) {
    throw new Error(`path escapes workspace: ${path}`);
  }
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, path);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`path escapes workspace: ${path}`);
  }
  return target;
};

const effectiveBounds = (
  input: Partial<ExecutorBounds> | undefined,
): ExecutorBounds => ({
  maxFiles: input?.maxFiles ?? DEFAULT_MAX_FILES,
  maxTotalBytes: input?.maxTotalBytes ?? DEFAULT_MAX_BYTES,
  maxOutputBytes: input?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
  timeoutMs: input?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
});

const assertWorkspaceBounds = (
  workspace: Workspace,
  bounds: ExecutorBounds,
): void => {
  const entries = Object.entries(workspace);
  if (entries.length > bounds.maxFiles)
    throw new Error("workspace file cap exceeded");
  let totalBytes = 0;
  for (const [path, content] of entries) {
    resolveConfinedPath("/workspace", path);
    totalBytes += Buffer.byteLength(content, "utf8");
  }
  if (totalBytes > bounds.maxTotalBytes) {
    throw new Error("workspace byte cap exceeded");
  }
};

const writeWorkspace = async (
  directory: string,
  workspace: Workspace,
  bounds: ExecutorBounds,
): Promise<void> => {
  assertWorkspaceBounds(workspace, bounds);
  await mkdir(directory, { recursive: true });
  for (const [path, content] of Object.entries(workspace)) {
    const target = resolveConfinedPath(directory, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, { encoding: "utf8", flag: "wx" });
  }
};

const walkFiles = async (root: string, current = root): Promise<string[]> => {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const target = join(current, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`symlink is not allowed: ${target}`);
    if (entry.isDirectory()) files.push(...(await walkFiles(root, target)));
    else if (entry.isFile()) files.push(relative(root, target));
  }
  return files.sort();
};

const setTreeMode = async (
  root: string,
  directoryMode: number,
  fileMode: number,
): Promise<void> => {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const target = join(root, entry.name);
    if (entry.isDirectory()) {
      await setTreeMode(target, directoryMode, fileMode);
      await chmod(target, directoryMode);
    } else if (entry.isFile()) {
      await chmod(target, fileMode);
    }
  }
  await chmod(root, directoryMode);
};

const makeTreeWritable = async (root: string): Promise<void> => {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  await chmod(root, 0o755);
  for (const entry of entries) {
    const target = join(root, entry.name);
    if (entry.isDirectory()) await makeTreeWritable(target);
    else if (entry.isFile()) await chmod(target, 0o644);
  }
};

export const removeExecutableArtifacts = async (
  root: string,
): Promise<void> => {
  await makeTreeWritable(root);
  await rm(root, { recursive: true, force: true });
};

const definitionForCase = (
  mutationCase: MaterializedMutationCase,
): ExecutableOracleDefinition => {
  const changedPaths =
    mutationCase.changedPaths.length === 0
      ? Object.keys(mutationCase.cleanWorkspace)
      : [...mutationCase.changedPaths];
  const hiddenChecks = changedPaths.map((path) => {
    const content = mutationCase.cleanWorkspace[path];
    if (content === undefined)
      throw new Error(`missing clean oracle path: ${path}`);
    return { path, expectedDigest: contentDigest(content) };
  });
  const changed = new Set(mutationCase.changedPaths);
  const regressionChecks = Object.entries(mutationCase.cleanWorkspace)
    .filter(([path]) => !changed.has(path))
    .map(([path, content]) => ({
      path,
      expectedDigest: contentDigest(content),
    }));
  return {
    schemaVersion: "owned-executable-oracle-1.0",
    caseId: mutationCase.caseId,
    hiddenChecks,
    regressionChecks,
  };
};

const oracleRunnerSource = `#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
const [definitionPath, workspacePath] = process.argv.slice(2);
if (!definitionPath || !workspacePath) throw new Error("definition and workspace are required");
const definition = JSON.parse(await readFile(definitionPath, "utf8"));
const root = resolve(workspacePath);
const check = async ({ path, expectedDigest }) => {
  if (isAbsolute(path) || path.split(/[\\\\/]/u).includes("..")) throw new Error("unsafe oracle path");
  const target = resolve(root, path);
  if (!target.startsWith(root + sep)) throw new Error("oracle path escaped workspace");
  const content = await readFile(target, "utf8");
  return "sha256:" + createHash("sha256").update(content).digest("hex") === expectedDigest;
};
const hidden = await Promise.all(definition.hiddenChecks.map(check));
const regression = await Promise.all(definition.regressionChecks.map(check));
process.stdout.write(JSON.stringify({
  caseId: definition.caseId,
  hiddenPassed: hidden.every(Boolean),
  regressionPassed: regression.every(Boolean),
  checkedFiles: hidden.length + regression.length,
  messages: []
}));
`;

export const materializeExecutableCase = async (
  mutationCase: MaterializedMutationCase,
  outputRoot: string,
  inputBounds?: Partial<ExecutorBounds>,
): Promise<ExecutableCaseBundle> => {
  const bounds = effectiveBounds(inputBounds);
  assertWorkspaceBounds(mutationCase.agentWorkspace, bounds);
  const caseRoot = resolveConfinedPath(outputRoot, mutationCase.caseId);
  const stagingRoot = `${caseRoot}.staging-${randomUUID()}`;
  await removeExecutableArtifacts(stagingRoot);
  await mkdir(stagingRoot, { recursive: true });
  const snapshotDirectory = join(stagingRoot, "immutable-snapshot");
  const agentWorkspaceDirectory = join(stagingRoot, "agent-workspace");
  const evaluatorPrivateDirectory = join(stagingRoot, "evaluator-private");
  await writeWorkspace(snapshotDirectory, mutationCase.agentWorkspace, bounds);
  await cp(snapshotDirectory, agentWorkspaceDirectory, { recursive: true });
  await setTreeMode(snapshotDirectory, 0o555, 0o444);
  await setTreeMode(agentWorkspaceDirectory, 0o755, 0o644);
  await mkdir(evaluatorPrivateDirectory, { recursive: true, mode: 0o700 });

  const definition = definitionForCase(mutationCase);
  const definitionPath = join(
    evaluatorPrivateDirectory,
    "oracle-definition.json",
  );
  const runnerPath = join(evaluatorPrivateDirectory, "oracle-runner.mjs");
  await writeFile(definitionPath, `${JSON.stringify(definition, null, 2)}\n`, {
    mode: 0o600,
  });
  await writeFile(runnerPath, oracleRunnerSource, { mode: 0o700 });
  await writeFile(
    join(evaluatorPrivateDirectory, "mutation.json"),
    `${JSON.stringify(
      {
        caseId: mutationCase.caseId,
        mutationId: mutationCase.mutationId,
        changedPaths: mutationCase.changedPaths,
        mutatedFiles: Object.fromEntries(
          mutationCase.changedPaths.map((path) => [
            path,
            mutationCase.agentWorkspace[path],
          ]),
        ),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  await writeFile(
    join(evaluatorPrivateDirectory, "reference-repair.json"),
    `${JSON.stringify(
      {
        caseId: mutationCase.caseId,
        repairedFiles: Object.fromEntries(
          mutationCase.changedPaths.map((path) => [
            path,
            mutationCase.referenceRepair[path],
          ]),
        ),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  await writeFile(
    join(evaluatorPrivateDirectory, "manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: "owned-executable-case-1.0",
        caseId: mutationCase.caseId,
        snapshotDigest: workspaceDigest(mutationCase.agentWorkspace),
        bounds,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );

  await mkdir(dirname(caseRoot), { recursive: true });
  await removeExecutableArtifacts(caseRoot);
  await rename(stagingRoot, caseRoot);
  return {
    caseId: mutationCase.caseId,
    rootDirectory: caseRoot,
    immutableSnapshotDirectory: join(caseRoot, "immutable-snapshot"),
    agentWorkspaceDirectory: join(caseRoot, "agent-workspace"),
    evaluatorPrivateDirectory: join(caseRoot, "evaluator-private"),
    oracleDefinitionPath: join(
      caseRoot,
      "evaluator-private",
      "oracle-definition.json",
    ),
    oracleRunnerPath: join(caseRoot, "evaluator-private", "oracle-runner.mjs"),
    snapshotDigest: workspaceDigest(mutationCase.agentWorkspace),
    bounds,
  };
};

export const resetAgentWorkspace = async (
  bundle: ExecutableCaseBundle,
): Promise<void> => {
  const workspace = bundle.agentWorkspaceDirectory;
  const parent = dirname(workspace);
  const staged = join(parent, `.agent-workspace.staged-${randomUUID()}`);
  const previous = join(parent, `.agent-workspace.previous-${randomUUID()}`);
  await cp(bundle.immutableSnapshotDirectory, staged, { recursive: true });
  await setTreeMode(staged, 0o755, 0o644);
  await rename(workspace, previous);
  try {
    await rename(staged, workspace);
  } catch (error) {
    await rename(previous, workspace);
    throw error;
  }
  await rm(previous, { recursive: true, force: true });
};

export const evaluateOracleBundle = async (
  bundle: ExecutableCaseBundle,
  workspaceDirectory: string,
): Promise<OracleBundleResult> => {
  const definitionInput: unknown = JSON.parse(
    await readFile(bundle.oracleDefinitionPath, "utf8"),
  );
  if (
    typeof definitionInput !== "object" ||
    definitionInput === null ||
    !("caseId" in definitionInput) ||
    !("hiddenChecks" in definitionInput) ||
    !("regressionChecks" in definitionInput) ||
    typeof definitionInput.caseId !== "string" ||
    !Array.isArray(definitionInput.hiddenChecks) ||
    !Array.isArray(definitionInput.regressionChecks)
  ) {
    throw new Error("invalid executable oracle definition");
  }
  const caseId = definitionInput.caseId;
  const hiddenChecks = definitionInput.hiddenChecks;
  const regressionChecks = definitionInput.regressionChecks;
  const readChecks = async (checks: readonly unknown[]): Promise<boolean[]> =>
    Promise.all(
      checks.map(async (check) => {
        if (
          typeof check !== "object" ||
          check === null ||
          !("path" in check) ||
          !("expectedDigest" in check) ||
          typeof check.path !== "string" ||
          typeof check.expectedDigest !== "string"
        ) {
          throw new Error("invalid executable oracle check");
        }
        const target = resolveConfinedPath(workspaceDirectory, check.path);
        const file = await stat(target);
        if (!file.isFile()) return false;
        return (
          contentDigest(await readFile(target, "utf8")) === check.expectedDigest
        );
      }),
    );
  const operation = async (): Promise<OracleBundleResult> => {
    const workspaceFiles = await walkFiles(workspaceDirectory);
    if (workspaceFiles.length > bundle.bounds.maxFiles) {
      throw new Error("workspace file cap exceeded");
    }
    const hidden = await readChecks(hiddenChecks);
    const regression = await readChecks(regressionChecks);
    const result = {
      caseId,
      hiddenPassed: hidden.every(Boolean),
      regressionPassed: regression.every(Boolean),
      checkedFiles: hidden.length + regression.length,
      messages: [] as const,
    };
    if (
      Buffer.byteLength(JSON.stringify(result)) > bundle.bounds.maxOutputBytes
    ) {
      throw new Error("oracle output cap exceeded");
    }
    return result;
  };
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error("oracle timeout exceeded"));
        }, bundle.bounds.timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

export const runOracleScript = async (
  bundle: ExecutableCaseBundle,
  workspaceDirectory = bundle.agentWorkspaceDirectory,
): Promise<OracleBundleResult> => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [bundle.oracleRunnerPath, bundle.oracleDefinitionPath, workspaceDirectory],
    {
      timeout: bundle.bounds.timeoutMs,
      maxBuffer: bundle.bounds.maxOutputBytes,
      windowsHide: true,
    },
  );
  const result: unknown = JSON.parse(stdout);
  if (typeof result !== "object" || result === null || !("caseId" in result)) {
    throw new Error("invalid oracle runner output");
  }
  return {
    caseId: String(result.caseId),
    hiddenPassed: "hiddenPassed" in result && result.hiddenPassed === true,
    regressionPassed:
      "regressionPassed" in result && result.regressionPassed === true,
    checkedFiles:
      "checkedFiles" in result && typeof result.checkedFiles === "number"
        ? result.checkedFiles
        : 0,
    messages: [],
  };
};

const evaluateWorkspaceState = async (
  bundle: ExecutableCaseBundle,
  workspace: Workspace,
): Promise<OracleBundleResult> => {
  const directory = await mkdtemp(join(tmpdir(), "open-next-bench-oracle-"));
  try {
    await writeWorkspace(directory, workspace, bundle.bounds);
    return await evaluateOracleBundle(bundle, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

export const validateExecutableCase = async (
  mutationCase: MaterializedMutationCase,
  bundle: ExecutableCaseBundle,
  repetitions = 3,
): Promise<ExecutableValidationEvidence> => {
  let cleanPasses = true;
  let mutatedFails = true;
  let mutatedRegressionPasses = true;
  let referencePasses = true;
  for (let index = 0; index < repetitions; index += 1) {
    const clean = await evaluateWorkspaceState(
      bundle,
      mutationCase.cleanWorkspace,
    );
    const mutated = await evaluateWorkspaceState(
      bundle,
      mutationCase.agentWorkspace,
    );
    const reference = await evaluateWorkspaceState(
      bundle,
      mutationCase.referenceRepair,
    );
    cleanPasses &&= clean.hiddenPassed && clean.regressionPassed;
    mutatedFails &&=
      mutationCase.kind === "control"
        ? mutated.hiddenPassed
        : !mutated.hiddenPassed;
    mutatedRegressionPasses &&= mutated.regressionPassed;
    referencePasses &&= reference.hiddenPassed && reference.regressionPassed;
  }
  return {
    caseId: mutationCase.caseId,
    repetitions,
    cleanPasses,
    mutatedFails,
    mutatedRegressionPasses,
    referencePasses,
  };
};

export const materializeOwnedCorpus = async (
  outputRoot: string,
  caseId?: string,
  bounds?: Partial<ExecutorBounds>,
): Promise<ExecutableCaseBundle[]> => {
  const selected =
    caseId === undefined
      ? ownedCorpusCases
      : ownedCorpusCases.filter((candidate) => candidate.caseId === caseId);
  if (selected.length === 0) {
    throw new Error(`unknown owned case: ${String(caseId)}`);
  }
  const bundles: ExecutableCaseBundle[] = [];
  for (const mutationCase of selected) {
    bundles.push(
      await materializeExecutableCase(mutationCase, outputRoot, bounds),
    );
  }
  return bundles;
};

export const executableCorpusSummary = () => ({
  families: ownedCorpusFamilies.length,
  cases: ownedCorpusCases.length,
  mutations: ownedCorpusCases.filter(({ kind }) => kind === "mutated").length,
});

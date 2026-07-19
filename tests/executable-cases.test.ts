import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  materializeExecutableCase,
  materializeOwnedCorpus,
  removeExecutableArtifacts,
  resetAgentWorkspace,
  resolveConfinedPath,
  runOracleScript,
  validateExecutableCase,
  type ExecutableCaseBundle,
} from "../src/executor/executable-cases.js";
import { ownedCorpusCases } from "../src/mutations/owned-corpus.js";

let outputRoot = "";
let bundles: ExecutableCaseBundle[] = [];

beforeAll(async () => {
  outputRoot = await mkdtemp(join(tmpdir(), "open-next-bench-executable-"));
  bundles = await materializeOwnedCorpus(outputRoot);
}, 30_000);

afterAll(async () => {
  await removeExecutableArtifacts(outputRoot);
});

const recursiveFiles = async (
  root: string,
  current = root,
): Promise<string[]> => {
  const entries = await readdir(current, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const target = join(current, entry.name);
    if (entry.isDirectory())
      paths.push(...(await recursiveFiles(root, target)));
    else paths.push(target.slice(root.length + 1));
  }
  return paths.sort();
};

describe("executable owned cases", () => {
  it("materializes every case with separate private evaluator state", async () => {
    expect(bundles).toHaveLength(110);
    const first = bundles[1];
    expect(first).toBeDefined();
    if (first === undefined) throw new Error("missing executable case");
    expect(first.evaluatorPrivateDirectory).not.toContain(
      first.agentWorkspaceDirectory,
    );
    expect(await recursiveFiles(first.evaluatorPrivateDirectory)).toEqual([
      "manifest.json",
      "mutation.json",
      "oracle-definition.json",
      "oracle-runner.mjs",
      "reference-repair.json",
    ]);
    expect(await recursiveFiles(first.agentWorkspaceDirectory)).not.toContain(
      "oracle-definition.json",
    );
    await expect(
      readFile(join(first.agentWorkspaceDirectory, "mutation.json"), "utf8"),
    ).rejects.toThrow();
  });

  it("atomically resets a writable agent workspace from its immutable snapshot", async () => {
    const first = bundles[1];
    const mutationCase = ownedCorpusCases[1];
    expect(first).toBeDefined();
    expect(mutationCase).toBeDefined();
    if (first === undefined || mutationCase === undefined) {
      throw new Error("missing reset fixture");
    }
    const path = Object.keys(mutationCase.agentWorkspace)[0];
    expect(path).toBeDefined();
    if (path === undefined) throw new Error("missing workspace path");
    const agentFile = resolveConfinedPath(first.agentWorkspaceDirectory, path);
    const snapshotFile = resolveConfinedPath(
      first.immutableSnapshotDirectory,
      path,
    );
    const expected = await readFile(snapshotFile, "utf8");
    await writeFile(agentFile, "corrupted", "utf8");
    await writeFile(join(first.agentWorkspaceDirectory, "extra.txt"), "extra");
    await resetAgentWorkspace(first);
    expect(await readFile(agentFile, "utf8")).toBe(expected);
    await expect(
      readFile(join(first.agentWorkspaceDirectory, "extra.txt"), "utf8"),
    ).rejects.toThrow();
    expect((await stat(snapshotFile)).mode & 0o222).toBe(0);
  });

  it("executes the private oracle script against actual workspace files", async () => {
    const mutatedIndex = ownedCorpusCases.findIndex(
      ({ kind }) => kind === "mutated",
    );
    const bundle = bundles[mutatedIndex];
    expect(bundle).toBeDefined();
    if (bundle === undefined)
      throw new Error("missing mutated executable case");
    const result = await runOracleScript(bundle);
    expect(result).toMatchObject({
      hiddenPassed: false,
      regressionPassed: true,
    });
  });

  it("runs clean, mutated, and reference oracles three times for all cases", async () => {
    expect(bundles).toHaveLength(ownedCorpusCases.length);
    const evidence = [];
    for (const [index, mutationCase] of ownedCorpusCases.entries()) {
      const bundle = bundles[index];
      if (bundle === undefined)
        throw new Error(`missing bundle ${mutationCase.caseId}`);
      evidence.push(await validateExecutableCase(mutationCase, bundle, 3));
    }
    expect(evidence).toHaveLength(110);
    expect(
      evidence.every(
        (item) =>
          item.repetitions === 3 &&
          item.cleanPasses &&
          item.mutatedFails &&
          item.mutatedRegressionPasses &&
          item.referencePasses,
      ),
    ).toBe(true);
  }, 30_000);

  it("rejects traversal and workspace bound violations", async () => {
    expect(() => resolveConfinedPath("/tmp/safe-root", "../secret")).toThrow(
      "path escapes workspace",
    );
    expect(() => resolveConfinedPath("/tmp/safe-root", "/etc/passwd")).toThrow(
      "path escapes workspace",
    );
    const mutationCase = ownedCorpusCases[0];
    expect(mutationCase).toBeDefined();
    if (mutationCase === undefined) throw new Error("missing bounds fixture");
    const boundedRoot = join(outputRoot, "bounded");
    await mkdir(boundedRoot, { recursive: true });
    await expect(
      materializeExecutableCase(mutationCase, boundedRoot, { maxFiles: 1 }),
    ).rejects.toThrow("workspace file cap exceeded");
  });
});

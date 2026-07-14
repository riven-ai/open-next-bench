import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { benchmarkCaseSchema, runManifestSchema } from "../src/schema.js";

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

describe("benchmark v1 contract", () => {
  it("validates the example case", () => {
    expect(
      benchmarkCaseSchema.parse(readJson("../examples/case.json")).caseId,
    ).toBe("sample-blog-a11y-001");
  });

  it("validates the reproducibility manifest", () => {
    expect(
      runManifestSchema.parse(readJson("../examples/run-manifest.json")).runId,
    ).toBe("qwen3-baseline-001");
  });
});

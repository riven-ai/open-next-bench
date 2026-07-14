import { describe, expect, it } from "vitest";
import { projectRecordSchema } from "../src/project.js";

describe("project record", () => {
  it("accepts a normalized, immutable repository record", () => {
    const parsed = projectRecordSchema.parse({
      projectId: "vercel-platforms-2026-07",
      familyId: "repo-vercel-platforms",
      subsets: ["nextjs-curated", "nextjs-visual"],
      repository: "vercel/platforms",
      commit: "0123456789abcdef0123456789abcdef01234567",
      sourceId: "vercel-platforms",
      licenseSpdx: "MIT",
      nextVersion: "16.0.0",
      router: "app",
      typescript: true,
      tailwindVersion: "4.1.0",
      categories: ["multi-tenant", "saas"],
      starsAtCollection: 1000,
      fork: false,
      archived: false,
      buildStatus: "passed",
      routes: ["/", "/dashboard"],
      screenshotPaths: ["screenshots/home.webp"],
      duplicateCluster: `sha256:${"a".repeat(64)}`,
      collectedAt: "2026-07-14T09:00:00+03:00",
      attribution: {
        licensePath: "LICENSE",
        noticePaths: [],
      },
    });

    expect(parsed.router).toBe("app");
  });

  it("rejects moving branch names in place of immutable commits", () => {
    expect(() =>
      projectRecordSchema.parse({
        projectId: "invalid",
        commit: "main",
      }),
    ).toThrow();
  });
});

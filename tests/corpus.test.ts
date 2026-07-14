import { describe, expect, it } from "vitest";
import { assignFamilySplit, expandFamily } from "../src/corpus.js";

describe("corpus lineage", () => {
  it("keeps controls, duplicates, and mutations in one split", () => {
    const variants = expandFamily("tesslate-000042", {
      exactDuplicates: 2,
      mutationSets: [
        ["react-missing-effect-dependency"],
        ["nextjs-client-server-boundary", "a11y-input-name"],
      ],
    });

    expect(variants).toHaveLength(5);
    expect(new Set(variants.map(({ split }) => split))).toEqual(
      new Set([assignFamilySplit("tesslate-000042")]),
    );
    expect(
      variants
        .filter(({ kind }) => kind === "exact-duplicate")
        .every(({ scoreWeight }) => scoreWeight === 0),
    ).toBe(true);
  });

  it("assigns a family deterministically", () => {
    expect(assignFamilySplit("same-family")).toBe(
      assignFamilySplit("same-family"),
    );
  });
});

import { describe, expect, it } from "vitest";

import {
  materializeFamily,
  validateOperator,
  workspaceDigest,
} from "../src/mutations/factory.js";
import {
  ownedDashboardMutations,
  ownedDashboardTemplate,
} from "../src/mutations/owned-dashboard.js";

describe("owned repair dataset family", () => {
  it("materializes one control and ten deterministic bug variants", () => {
    const first = materializeFamily(
      ownedDashboardTemplate,
      ownedDashboardMutations,
    );
    const second = materializeFamily(
      ownedDashboardTemplate,
      ownedDashboardMutations,
    );

    expect(first).toHaveLength(11);
    expect(new Set(first.map((item) => item.caseId)).size).toBe(11);
    expect(first.map((item) => workspaceDigest(item.agentWorkspace))).toEqual(
      second.map((item) => workspaceDigest(item.agentWorkspace)),
    );
    expect(first.filter((item) => item.kind === "control")).toHaveLength(1);
    expect(first.filter((item) => item.kind === "mutated")).toHaveLength(10);
  });

  it.each(ownedDashboardMutations)(
    "validates clean, $mutationId, and reference repair three times",
    (operator) => {
      const evidence = validateOperator(ownedDashboardTemplate, operator, 3);
      expect(evidence).toMatchObject({
        mutationId: operator.mutationId,
        cleanPasses: true,
        mutatedFails: true,
        referencePasses: true,
        repetitions: 3,
      });
      expect(evidence.messages).toHaveLength(3);
    },
  );

  it("keeps every variant in the same family", () => {
    const cases = materializeFamily(
      ownedDashboardTemplate,
      ownedDashboardMutations,
    );
    expect(new Set(cases.map((item) => item.templateFamilyId))).toEqual(
      new Set([ownedDashboardTemplate.familyId]),
    );
  });
});

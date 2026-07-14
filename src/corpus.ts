import { createHash } from "node:crypto";
import { z } from "zod";

export const splitSchema = z.enum(["train", "validation", "test"]);

export const generationSeedSchema = z.object({
  seedId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
  question: z.string().min(1),
  response: z.string().min(1),
  reasoning: z.string().optional(),
});

export const variantPlanSchema = z.object({
  familyId: z.string().min(1),
  variantId: z.string().min(1),
  split: splitSchema,
  kind: z.enum(["control", "exact-duplicate", "mutated"]),
  mutationIds: z.array(z.string().min(1)),
  scoreWeight: z.number().min(0).max(1),
});

export type Split = z.infer<typeof splitSchema>;
export type VariantPlan = z.infer<typeof variantPlanSchema>;

export interface ExpansionOptions {
  exactDuplicates?: number;
  mutationSets: readonly (readonly string[])[];
}

export function assignFamilySplit(familyId: string): Split {
  const bucket =
    createHash("sha256").update(familyId).digest().readUInt32BE(0) % 100;
  if (bucket < 70) return "train";
  if (bucket < 85) return "validation";
  return "test";
}

export function expandFamily(
  familyId: string,
  options: ExpansionOptions,
): VariantPlan[] {
  const split = assignFamilySplit(familyId);
  const exactDuplicates = options.exactDuplicates ?? 0;
  const control: VariantPlan = {
    familyId,
    variantId: `${familyId}--control`,
    split,
    kind: "control",
    mutationIds: [],
    scoreWeight: 1,
  };
  const duplicates = Array.from({ length: exactDuplicates }, (_, index) => ({
    familyId,
    variantId: `${familyId}--duplicate-${String(index + 1)}`,
    split,
    kind: "exact-duplicate" as const,
    mutationIds: [],
    scoreWeight: 0,
  }));
  const mutations = options.mutationSets.map((mutationIds, index) => ({
    familyId,
    variantId: `${familyId}--mutation-${String(index + 1)}`,
    split,
    kind: "mutated" as const,
    mutationIds: [...mutationIds],
    scoreWeight: 1,
  }));

  return [control, ...duplicates, ...mutations];
}

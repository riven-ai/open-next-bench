import { z } from "zod";

export const corpusSubsetSchema = z.enum([
  "nextjs-curated",
  "nextjs-wild",
  "nextjs-visual",
  "nextjs-generation-seeds",
]);

export const routerSchema = z.enum(["app", "pages", "hybrid", "unknown"]);

export const buildStatusSchema = z.enum([
  "not-run",
  "passed",
  "failed",
  "requires-services",
  "rejected",
]);

export const projectRecordSchema = z.object({
  projectId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  familyId: z.string().min(1),
  subsets: z.array(corpusSubsetSchema).min(1),
  repository: z.string().min(1),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  sourceId: z.string().min(1),
  licenseSpdx: z.string().min(1),
  nextVersion: z.string().min(1),
  router: routerSchema,
  typescript: z.boolean(),
  tailwindVersion: z.string().min(1).nullable(),
  categories: z.array(z.string().min(1)),
  starsAtCollection: z.number().int().nonnegative().nullable(),
  fork: z.boolean(),
  archived: z.boolean(),
  buildStatus: buildStatusSchema,
  routes: z.array(z.string().startsWith("/")),
  screenshotPaths: z.array(z.string().min(1)),
  duplicateCluster: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  collectedAt: z.iso.datetime({ offset: true }),
  attribution: z.object({
    licensePath: z.string().min(1),
    noticePaths: z.array(z.string().min(1)),
  }),
});

export type ProjectRecord = z.infer<typeof projectRecordSchema>;

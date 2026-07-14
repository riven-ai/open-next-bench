import { z } from "zod";

export const categorySchema = z.enum([
  "correctness",
  "typescript",
  "react",
  "nextjs",
  "performance",
  "accessibility",
  "security",
  "code-quality",
]);

export const severitySchema = z.enum(["critical", "high", "medium", "low"]);

export const locationSchema = z
  .object({
    path: z.string().min(1),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  })
  .refine((location) => location.endLine >= location.startLine, {
    message: "endLine must be greater than or equal to startLine",
  });

const classifiedIssueSchema = z.object({
  category: categorySchema,
  severity: severitySchema,
  locations: z.array(locationSchema).min(1),
  title: z.string().min(1),
});

export const groundTruthIssueSchema = classifiedIssueSchema.extend({
  issueId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  explanation: z.string().min(1),
  whyItMatters: z.string().min(1),
  oracle: z.string().min(1),
});

export const predictionIssueSchema = classifiedIssueSchema.extend({
  findingId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1),
  suggestedFix: z.string().min(1).optional(),
});

export const groundTruthDocumentSchema = z.object({
  caseId: z.string().min(1),
  issues: z.array(groundTruthIssueSchema),
});

export const predictionDocumentSchema = z.object({
  caseId: z.string().min(1),
  issues: z.array(predictionIssueSchema),
});

export const splitSchema = z.enum(["train", "validation", "test", "secret"]);

export const benchmarkCaseSchema = z.object({
  schemaVersion: z.literal("1.0"),
  caseId: z.string().min(1),
  familyId: z.string().min(1),
  split: splitSchema,
  source: z.object({
    repository: z.string().min(1),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    licenseSpdx: z.string().min(1),
  }),
  environment: z.object({
    image: z.string().min(1),
    imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    setupHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    networkAccess: z.boolean(),
  }),
  task: z.object({
    prompt: z.string().min(1),
    allowedTools: z.array(z.string().min(1)),
    maxSteps: z.number().int().positive(),
    maxTokens: z.number().int().positive(),
    timeoutSeconds: z.number().int().positive(),
  }),
  variant: z.object({
    kind: z.enum(["control", "mutated"]),
    mutationIds: z.array(z.string().min(1)),
  }),
  oracle: z.object({
    groundTruthPath: z.string().min(1),
    commands: z.array(z.string().min(1)).min(1),
  }),
});

export const runManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  runId: z.string().min(1),
  benchmarkVersion: z.string().min(1),
  benchmarkCommit: z.string().regex(/^[a-f0-9]{40}$/),
  model: z.object({
    id: z.string().min(1),
    revision: z.string().min(1),
    quantization: z.string().min(1).nullable(),
  }),
  agent: z.object({
    id: z.string().min(1),
    revision: z.string().min(1),
    systemPromptHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }),
  harness: z.object({
    revision: z.string().min(1),
    executorImageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }),
  sampling: z.object({
    temperature: z.number().min(0),
    topP: z.number().min(0).max(1),
    seed: z.number().int(),
    attemptsPerCase: z.number().int().positive(),
  }),
  startedAt: z.iso.datetime({ offset: true }),
});

export type GroundTruthDocument = z.infer<typeof groundTruthDocumentSchema>;
export type PredictionDocument = z.infer<typeof predictionDocumentSchema>;
export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>;
export type RunManifest = z.infer<typeof runManifestSchema>;

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

const issueCoreSchema = z.object({
  issueId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  category: categorySchema,
  severity: severitySchema,
  locations: z.array(locationSchema).min(1),
  title: z.string().min(1),
});

export const groundTruthIssueSchema = issueCoreSchema.extend({
  explanation: z.string().min(1),
  whyItMatters: z.string().min(1),
  oracle: z.string().min(1),
});

export const predictionIssueSchema = issueCoreSchema.extend({
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

export type GroundTruthDocument = z.infer<typeof groundTruthDocumentSchema>;
export type PredictionDocument = z.infer<typeof predictionDocumentSchema>;

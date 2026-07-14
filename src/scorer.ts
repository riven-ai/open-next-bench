import type { GroundTruthDocument, PredictionDocument } from "./schema.js";

export interface Score {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  categoryAccuracy: number;
  severityAccuracy: number;
  fileLocalizationAccuracy: number;
  lineLocalizationAccuracy: number;
}

const divide = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator;

const rangesOverlap = (
  left: { startLine: number; endLine: number },
  right: { startLine: number; endLine: number },
): boolean =>
  left.startLine <= right.endLine && right.startLine <= left.endLine;

export function score(
  truth: GroundTruthDocument,
  predictions: PredictionDocument,
): Score {
  if (truth.caseId !== predictions.caseId) {
    throw new Error(
      `Case mismatch: truth is ${truth.caseId}, predictions are ${predictions.caseId}`,
    );
  }

  const truthById = new Map(
    truth.issues.map((issue) => [issue.issueId, issue]),
  );
  const uniquePredictions = new Map(
    predictions.issues.map((issue) => [issue.issueId, issue]),
  );
  const matches = [...uniquePredictions.entries()].flatMap(
    ([id, prediction]) => {
      const expected = truthById.get(id);
      return expected === undefined ? [] : [{ expected, prediction }];
    },
  );

  const truePositives = matches.length;
  const falsePositives = uniquePredictions.size - truePositives;
  const falseNegatives = truthById.size - truePositives;
  const precision = divide(truePositives, truePositives + falsePositives);
  const recall = divide(truePositives, truePositives + falseNegatives);

  const fileHits = matches.filter(({ expected, prediction }) =>
    prediction.locations.some((actual) =>
      expected.locations.some((target) => actual.path === target.path),
    ),
  ).length;
  const lineHits = matches.filter(({ expected, prediction }) =>
    prediction.locations.some((actual) =>
      expected.locations.some(
        (target) =>
          actual.path === target.path && rangesOverlap(actual, target),
      ),
    ),
  ).length;

  return {
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1: divide(2 * precision * recall, precision + recall),
    categoryAccuracy: divide(
      matches.filter(
        ({ expected, prediction }) => expected.category === prediction.category,
      ).length,
      matches.length,
    ),
    severityAccuracy: divide(
      matches.filter(
        ({ expected, prediction }) => expected.severity === prediction.severity,
      ).length,
      matches.length,
    ),
    fileLocalizationAccuracy: divide(fileHits, matches.length),
    lineLocalizationAccuracy: divide(lineHits, matches.length),
  };
}

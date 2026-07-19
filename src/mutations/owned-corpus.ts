import type { MutationOperator, TemplateFamily } from "./contracts.js";
import {
  materializeFamily,
  validateOperator,
  workspaceDigest,
} from "./factory.js";
import { analyticsMutations, analyticsTemplate } from "./families/analytics.js";
import { commerceMutations, commerceTemplate } from "./families/commerce.js";
import { communityMutations, communityTemplate } from "./families/community.js";
import { docsMutations, docsTemplate } from "./families/docs.js";
import { eventsMutations, eventsTemplate } from "./families/events.js";
import { inventoryMutations, inventoryTemplate } from "./families/inventory.js";
import { learningMutations, learningTemplate } from "./families/learning.js";
import { mediaMutations, mediaTemplate } from "./families/media.js";
import { supportMutations, supportTemplate } from "./families/support.js";
import {
  ownedDashboardMutations,
  ownedDashboardTemplate,
} from "./owned-dashboard.js";

export interface OwnedCorpusFamily {
  template: TemplateFamily;
  operators: readonly MutationOperator[];
  duplicateCluster: string;
  splitReview: {
    reviewed: true;
    policyVersion: "owned-corpus-split-1.0";
  };
}

const reviewedFamily = (
  template: TemplateFamily,
  operators: readonly MutationOperator[],
): OwnedCorpusFamily => ({
  template,
  operators,
  duplicateCluster: workspaceDigest(template.files),
  splitReview: {
    reviewed: true,
    policyVersion: "owned-corpus-split-1.0",
  },
});

export const ownedCorpusFamilies: readonly OwnedCorpusFamily[] = [
  reviewedFamily(ownedDashboardTemplate, ownedDashboardMutations),
  reviewedFamily(commerceTemplate, commerceMutations),
  reviewedFamily(docsTemplate, docsMutations),
  reviewedFamily(supportTemplate, supportMutations),
  reviewedFamily(analyticsTemplate, analyticsMutations),
  reviewedFamily(eventsTemplate, eventsMutations),
  reviewedFamily(learningTemplate, learningMutations),
  reviewedFamily(inventoryTemplate, inventoryMutations),
  reviewedFamily(communityTemplate, communityMutations),
  reviewedFamily(mediaTemplate, mediaMutations),
];

export const ownedCorpusCases = ownedCorpusFamilies.flatMap(
  ({ template, operators }) => materializeFamily(template, operators),
);

export const ownedCorpusValidation = ownedCorpusFamilies.flatMap(
  ({ template, operators }) =>
    operators.map((operator) => validateOperator(template, operator, 3)),
);

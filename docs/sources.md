# Dataset and template sources

Open Next Bench accepts several kinds of upstream source, but they do not enter
the benchmark through the same path.

## Source classes

| Class                 | Example             | What we ingest                        | Required promotion step                  |
| --------------------- | ------------------- | ------------------------------------- | ---------------------------------------- |
| Discovery index       | Next.js Showcase    | Links and descriptive metadata        | Locate public source and its license     |
| Template index        | Vercel Templates    | Linked starter repositories           | Pin, audit, and build each repository    |
| Repository collection | `next.js/examples`  | Selected subdirectories at one commit | Verify each example is self-contained    |
| Production repository | Cal.com, Formbricks | Immutable repository snapshot         | Isolate services and establish baseline  |
| Generation seeds      | Tesslate dataset    | Prompt/response/reasoning rows        | Materialize code into a runnable project |

The [Next.js Showcase](https://nextjs.org/showcase) is not itself a source-code
dataset. It includes proprietary production sites alongside a small number of
templates. Its best use is discovery and taxonomy coverage. The
[Vercel Next.js template catalog](https://vercel.com/templates/next.js) is much
closer to what we need because it contains downloadable starters across many
frameworks and integrations, but every template still needs its own license and
provenance record.

## Tesslate inspection

Pinned dataset:
[`Tesslate/Next.js-Dataset@15ec91a`](https://huggingface.co/datasets/Tesslate/Next.js-Dataset/tree/15ec91a4dc49bc8a52064db10d85da33c83d1e8e)

- License declared by dataset: Apache-2.0
- Artifact: `nextjs_transformed.parquet` (292.9 MB)
- Rows: 49,954
- Columns: nullable UTF-8 strings `question`, `response`, and `reasoning`
- Dataset Viewer status on 2026-07-14: unavailable

These rows are generated answers containing prose and code fences. They
frequently mix router eras or show incomplete files. We therefore treat them as
**generation seeds**, not as benchmark cases and not as authoritative good code.

## Seed-to-case pipeline

```text
seed row
  -> extract candidate files from fenced blocks
  -> infer package manifest and Next.js/router version
  -> materialize an isolated project
  -> install + build + test + secret scan
  -> human baseline review
  -> immutable family/control case
  -> duplicate within the same family
  -> apply one or more reviewed mutation patches
  -> rerun mutation oracle and build gates
  -> assign the entire family to one split
```

Rows that cannot be deterministically materialized are useful for prompt
research but do not enter the benchmark corpus.

## Duplication policy

Every derivative has a `familyId` inherited from its clean parent. Split
assignment hashes the family ID, never the variant ID. Consequently the clean
project, exact duplicates, single-bug variants, and compound-bug variants all
remain in the same split.

Exact duplicates are normally excluded because they distort metrics. They may be
retained in a dedicated robustness track—for example, to measure stochastic
agent variance—but are given zero weight in the main score.

Bug variants are patch-based. A mutation record includes:

- a stable mutation ID and taxonomy category;
- the exact patch;
- issue ground truth and affected locations;
- an oracle that fails only after the mutation;
- compatibility constraints such as router and Next.js version;
- independent review state.

This makes "messing with rows" reproducible rather than destructive: the
upstream seed and clean materialization remain immutable, while every
intentional bug has lineage.

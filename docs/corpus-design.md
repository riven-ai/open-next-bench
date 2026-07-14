# Layered corpus design

The source report is integrated as a discovery registry, not copied into one
download queue. Its references have different legal properties, technical depth,
and expected yield. The corpus therefore has four subsets that converge on one
normalized project record.

## Subsets

### `nextjs-curated`

Target: 500–2,000 license-reviewed templates, examples, and production
repositories.

Start with Vercel Templates, GitHub starter topics, curated Awesome lists,
official examples, Platforms, and Commerce. This subset supplies high-confidence
benchmark families and broad feature coverage.

### `nextjs-wild`

Target: tens of thousands of public repositories discovered from manifests and
repository metadata.

Discovery combines GitHub topics/search with Ecosyste.ms and activity feeds. A
repository is admitted only after checking `package.json` for a Next.js
dependency and inspecting framework structure such as `app/layout.tsx`,
`app/page.tsx`, `pages/_app.tsx`, and `next.config.*`.

### `nextjs-visual`

This is a projection of curated or wild projects that install and render
successfully. It adds route inventories, screenshots, accessibility trees, and
selected DOM snapshots. A visual record never grants source rights; it points
back to the admitted project and its license.

### `nextjs-generation-seeds`

Instruction/code corpora such as Tesslate live here until their rows can be
deterministically materialized into buildable projects. They never bypass
source, license, secret, and build gates.

## Discovery and promotion

```text
indexes/topics/APIs/events
          |
          v
canonical repository origin
          |
          v
manifest + Next.js structure verification
          |
          v
immutable commit + license + attribution
          |
          v
fork/content deduplication + secret/PII scan
          |
          v
install/build/test + router/version inventory
          |
          +--------------------+
          |                    |
          v                    v
   normalized project     visual projection
          |
          v
family control + reviewed mutation patches
```

## Deduplication

Fork flags are insufficient because templates are often copied without Git
history. The collector computes a content fingerprint after excluding
dependencies, build output, generated files, secrets, and large binary assets.
Exact matches share a `duplicateCluster`; later work can add MinHash or
syntax-aware clustering for near duplicates.

Only one representative from a duplicate cluster receives full benchmark weight.
All derived controls and mutations retain the same `familyId` and split.

## Source access policies

The structured registry at `catalog/discovery-sources.json` makes legal and
operational boundaries explicit:

- commercial galleries and deployed showcases are metadata-only;
- directories may contribute only linked, public, independently licensed
  repositories;
- sandbox projects require an exportable immutable snapshot and provenance;
- bulk archives require terms and ethical-policy review;
- public GitHub visibility alone is never treated as a license.

The collector must support opt-out and removal requests and preserve repository
URL, commit, license, notices, and collection date in every exported record.

## First collection wave

1. Resolve 25–50 Vercel and official Next.js templates.
2. Sample 25 repositories from each of the three GitHub starter topics.
3. Add Pages Router candidates from the older Awesome Next.js list.
4. Deduplicate and select approximately 50 representative families.
5. Build them in isolated environments and promote the first 10–20 stable
   families.
6. Add one control, two single-bug variants, and one compound variant per
   family.

This produces a credible initial benchmark before investing in the
research-scale wild crawler.

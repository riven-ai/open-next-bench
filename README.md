# Open Next Bench

Open Next Bench is an open, reproducible benchmark for evaluating AI coding
agents on production-style Next.js repositories. The first track measures
whether an agent can identify known issues, classify them, and localize them
without changing the source.

The project is intentionally dataset-first. Every accepted source is pinned to
an exact commit; every mutation is reviewable; every expected issue has
structured ground truth; and scoring is deterministic.

## Current status

This repository contains the first vertical slice:

- versioned schemas for source repositories, benchmark cases, ground truth, and
  agent predictions;
- a deterministic scorer for exact issue identity, category, severity, and
  location;
- a candidate-source catalog and an intake checklist;
- a typed source registry for repositories, template indexes, and
  generation-seed datasets;
- deterministic family expansion that prevents clean/duplicate/mutated split
  leakage;
- tests for the scorer and example input files.

No third-party repository is vendored yet. Candidate projects must pass license,
provenance, build, secret, and redistribution review before becoming a fixture.

## Quick start

```bash
corepack enable
yarn install
yarn check
yarn score \
  --truth examples/ground-truth/example.json \
  --predictions examples/predictions/example.json
```

## Benchmark unit

A benchmark case is `(source repository, immutable commit, variant, task)`.
Variant zero is the unchanged source and acts as a calibration/control case.
Mutated variants contain one or more deliberately introduced issues. Their
patches and ground truth are stored separately from the source repository so the
baseline remains immutable.

The initial task is issue identification. Repair, refactoring, and performance
tracks are future additions and will use separate metrics.

## Repository layout

```text
catalog/        Candidate and accepted source metadata
docs/           Methodology, governance, and architectural decisions
examples/       Valid ground-truth and prediction documents
src/            Schemas, matching, metrics, and CLI
tests/          Deterministic scorer tests
```

Read [docs/methodology.md](docs/methodology.md) before proposing a source or
mutation. The source classes and seed-to-case pipeline are documented in
[docs/sources.md](docs/sources.md).

## Non-goals for the first milestone

- A public leaderboard or hosted evaluation service
- LLM-based judging
- Automatically generated mutations without human validation
- Comparing repair quality
- Redistributing repositories whose licenses or assets do not permit it

## Contributing

The project is at foundation stage. Useful first contributions are source
nominations, license review, reproducible build adapters, and small mutations
with regression tests. See [CONTRIBUTING.md](CONTRIBUTING.md).

# Methodology

## Design principles

### Reproducibility

Sources are addressed by canonical URL and commit SHA, never by a moving branch
or tag. The harness records the runtime image, install command, lockfile hash,
and evaluator version. Network access is disabled during agent execution unless
a track explicitly allows it.

### No contamination by construction

Ground truth and mutation patches are not mounted in the agent workspace. Public
cases can support transparent research; leaderboard-quality scores need a
separately governed holdout set. Results must identify the model, agent version,
prompts/policies, tool permissions, token budget, wall-clock budget, and number
of attempts.

### Variant zero matters

The unchanged repository measures false positives. It is not assumed to be
bug-free; instead, its benchmark scope is defined by an audited issue set.
Reports must distinguish "not in benchmark ground truth" from "proven not to be
a real issue."

## Case lifecycle

1. **Nominate** a diverse, actively maintained, redistributable Next.js source.
2. **Pin and audit** a commit, dependencies, assets, build, and baseline
   findings.
3. **Author** a minimal patch that introduces one issue and its automated
   oracle.
4. **Review** the patch and ground truth independently.
5. **Package** the source snapshot and mutation without exposing hidden files.
6. **Run** the agent in an isolated, resource-bounded environment.
7. **Normalize** the agent's structured output against the prediction schema.
8. **Score** issue matching first, then classification and localization on
   matched pairs.

## Initial matching policy

The foundation scorer uses stable issue IDs. This is appropriate for harness
validation and controlled agents that emit benchmark IDs, but it is not the
final open-ended review metric. The next scorer will perform deterministic
candidate matching using file overlap, line overlap, and taxonomy compatibility,
with a blinded adjudication queue for ambiguous semantic duplicates.

## Metrics

- Precision, recall, and F1 from matched issue identities
- False-positive and false-negative counts
- Category and severity accuracy on matched issues
- File and line localization accuracy on matched issues
- Macro results per source, category, severity, router mode, and Next.js major
  version

Micro-averages alone are insufficient because large variants can dominate the
result. Confidence calibration and cost/latency are planned once the execution
protocol is fixed.

## Leakage policy

Training on public repositories is expected and is not itself disqualifying.
Benchmark claims must state whether cases are public, time-split, or held out.
Mutations should be novel, reviewed transformations rather than copied
historical patches. A benchmark release records its publication date so model
providers and researchers can interpret exposure.

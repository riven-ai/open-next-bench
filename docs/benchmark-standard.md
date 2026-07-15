# Benchmark standard and readiness gates

Open Next Bench evaluates issue identification in complete Next.js repositories.
It borrows the strongest properties of software-engineering and browser-agent
benchmarks without copying their task definitions.

The names "WebGL" and "WebAssembly" refer to web technologies, not established
agent benchmark standards. The relevant comparisons are **SWE-bench**,
**WebArena**, **VisualWebArena**, **BrowserGym**, and **WebVoyager**.

## Standards comparison

| Standard       | Useful property                                                                     | Open Next Bench requirement                                                                                |
| -------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| SWE-bench      | Immutable repository instances and execution-based grading in isolated environments | Commit-pinned source, digest-pinned executor image, setup hash, and mutation oracle                        |
| WebArena       | Self-hosted resettable applications and deterministic task evaluators               | No shared mutable application state; each case starts from a known snapshot                                |
| VisualWebArena | Human trajectories and explicit multimodal task coverage                            | Preserve optional screenshots/AX/DOM observations and report modality-specific slices                      |
| BrowserGym     | One environment interface across multiple suites                                    | Stable case/reset/observe/act/report protocol independent of source repository                             |
| WebVoyager     | Realistic live-web diversity                                                        | Use its diversity principle, but not its live-site instability or model-based grader as the primary oracle |

Primary references:

- [SWE-bench evaluation harness](https://github.com/SWE-bench/SWE-bench)
- [WebArena canonical implementation](https://github.com/web-arena-x/webarena)
- [VisualWebArena](https://github.com/web-arena-x/visualwebarena)
- [BrowserGym](https://github.com/ServiceNow/BrowserGym)
- [WebVoyager paper](https://arxiv.org/abs/2401.13919)

## Generic suite boundary

Open Next Bench is one capability suite, not the benchmark runner. Riven RL's
suite-neutral environment contract must also be able to host:

| Suite shape           | Task-specific adapter responsibility                                 | Shared environment responsibility                                 |
| --------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| GSM8K                 | load question/answer and exact-match parser                          | lifecycle, version identity, result envelope                      |
| WebArena / WebVoyager | reset site, expose browser actions, deterministic task evaluator     | budgets, capability allowlist, transcript, termination            |
| SWE-bench             | materialize commit, expose repository/test actions, patch grader     | isolation metadata, budgets, transcript, result envelope          |
| QA tool-use           | load target and evidence tools, structured QA reward                 | lifecycle, capability allowlist, versioned results                |
| Open Next Bench       | materialize Next.js case, expose reads/search/checks, finding scorer | lifecycle, capability allowlist, budgets, transcript, termination |

Every adapter implements the same four operations: `reset(task)`,
`invoke(tool, arguments)`, `evaluate(submission)`, and `close()`. The shared
episode rejects undeclared tools, enforces the step budget, permits exactly one
terminal submission, and records a replayable transcript. The result envelope
always includes `suite`, `suiteVersion`, `environmentVersion`, `caseId`, primary
score, suite metrics, resource usage, and completion status.

Suite adapters may add observations and metrics but cannot weaken shared
invariants. Evaluator-only data stays behind the adapter boundary. Tool names
are capabilities, not executable command strings; raw shell or unrestricted
network access is never implied by the generic contract.

Environment and scorer versions are independent. A result is comparable only
when suite version, environment version, scorer version, attempt policy,
budgets, and scaffold match (or the report explicitly describes the change).

## Case contract

Every scored case must declare:

- immutable repository commit and SPDX license;
- family ID and split;
- digest-pinned execution image and setup hash;
- network policy and allowed tools;
- step, token, and wall-clock budgets;
- control or mutation provenance;
- hidden ground-truth document and at least one deterministic oracle command.

The executor must not mount mutation patches, ground truth, oracle source, or
sibling variants into the agent workspace.

## Prediction and matching

Agents create their own `findingId`; hidden ground-truth IDs are never exposed
or required. The deterministic v1 matcher performs one-to-one matching by
overlapping file and line range, then prefers compatible category and severity
when multiple truths overlap. Category and severity remain separately scored, so
they cannot manufacture a match.

Semantic-only findings without a location are out of scope for v1. Future
semantic matching must be versioned and validated against a double-annotated
adjudication set before it affects headline scores. No LLM judge is allowed in
the primary metric.

## Required metrics

- Per-case and macro precision, recall, and F1
- False positives on control cases
- Category and severity accuracy on matched findings
- File and line localization accuracy
- Confidence Brier score and, once the corpus is large enough, expected
  calibration error
- Steps, tokens, wall-clock, and estimated compute cost
- Results sliced by source family, mutation, category, Next.js major, and router
  mode

Report mean and bootstrap confidence intervals across families. Multiple
attempts for a stochastic agent must be declared in the run manifest; best-of-N
cannot be compared with single-attempt runs.

## Dataset governance

- Split by family before generating variants.
- Keep training, public validation, public test, and secret rotating holdout
  distinct.
- Never train on public-test or secret cases.
- Cluster forks and content duplicates before splitting.
- Include audited clean controls and real historical bugs alongside synthetic
  mutations.
- Validate each case by running the clean oracle and mutated oracle at least
  three times.
- Version every case, scorer, environment, and benchmark release.
- Publish exclusions, invalid cases, opt-outs, and benchmark errata.

## Readiness gates

The benchmark is not eligible for a model-quality claim until all gates pass:

1. At least 50 families and 200 cases.
2. At least 20% audited clean controls.
3. At least 20 independently reviewed real historical bugs.
4. Every case has a reproducible environment and deterministic oracle.
5. Gold validation passes three consecutive runs.
6. Two annotators independently review ground truth; disagreements are
   adjudicated.
7. A trivial always-issue policy and always-clean policy both score poorly.
8. A leakage audit proves no family/duplicate cluster crosses splits.
9. At least three baseline agents are run under identical budgets.
10. The full run manifest and per-case results are retained.

## Current readiness

As of 2026-07-15 the schemas, scorer, source governance, and lineage rules
exist, but the publishable benchmark has **zero materialized repository cases**.
Riven RL has a separate 12-case authored pilot for environment and
training-system smoke tests; those fixtures are not leaderboard cases and do not
satisfy the corpus gates above. The next corpus milestone is a 10-family
materialized pilot with control and mutation oracles, followed by CPU baselines
before any model-quality claim.

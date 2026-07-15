# Benchmark best-practices and training-readiness report

Date: 2026-07-15

## Executive summary

Open Next Bench now follows the reusable environment pattern shared by modern
agent benchmarks: a suite supplies tasks, named capabilities, reset behavior,
and a deterministic evaluator; the runner supplies budgets, lifecycle,
transcripts, version identity, and result envelopes. Riven RL can train against
an authored Open Next Bench pilot and evaluate base versus trained weights using
the same served generation protocol.

This makes the **training system ready for another controlled smoke run**. It
does not make the pilot a publishable model-quality benchmark. The pilot has 12
authored fixtures rather than independently sourced repository families. Public
quality claims remain gated on the corpus readiness requirements in
`benchmark-standard.md`.

## What strong benchmarks have in common

| Practice                     | Why it matters                                                 | Open Next Bench / Riven RL implementation                                        |
| ---------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Immutable task state         | Results must be replayable months later                        | commit and image digests in case schema; resettable suite adapter                |
| Environment/task separation  | New suites should not require runner forks                     | `BenchmarkTask`, `SuiteAdapter`, and `BenchmarkEpisode`                          |
| Hidden executable evaluation | Prevents reward hacking and subjective grading                 | evaluator-private truth and deterministic one-to-one scorer                      |
| Declared capabilities        | Prevents arbitrary shell/network escape                        | named tool allowlist; opaque check IDs                                           |
| Explicit budgets             | Makes cost and success comparable                              | step, token, and wall-clock limits with usage accounting                         |
| Clean controls               | Measures false-positive behavior                               | controls receive explicit false-positive penalties                               |
| Leakage-resistant splits     | Variants and duplicates cannot cross train/test                | split by family and duplicate cluster before expansion                           |
| Versioned semantics          | Scores are meaningless when evaluator behavior drifts silently | suite, environment, and scorer versions are independent                          |
| Full traces                  | Supports audit, failure analysis, and scaffold comparison      | replayable tool transcript and per-case results                                  |
| Same-protocol baselines      | Avoids comparing unlike inference paths                        | base measured on vLLM before training; final weights synchronized and remeasured |
| No primary model judge       | Removes grader cost, drift, and self-preference                | deterministic primary metric; human review for corpus creation                   |
| Honest readiness levels      | A harness smoke is not a benchmark result                      | authored-pilot and publishable-corpus gates are reported separately              |

## Comparison with reference suites

### GSM8K

GSM8K is a single-turn exact-answer suite. Its strength is a simple,
deterministic parser and metric. It demonstrates that not every suite needs a
tool environment, but every suite still needs pinned data, sampling settings,
and evaluator versions.

### SWE-bench

SWE-bench's important standard is instance-specific executable evaluation in
isolated Docker environments. A prediction is accepted because tests pass in the
pinned repository state, not because a language model says it looks right. Open
Next Bench adopts commit-pinned sources, digest-pinned executors, hidden
oracles, and gold validation.

### WebArena and VisualWebArena

These suites emphasize self-hosted applications, known initial state, reset
between episodes, and task-specific evaluators. VisualWebArena additionally
requires modality-aware observations and reporting. Open Next Bench therefore
keeps browser observations optional but versioned and requires isolated reset
for every repository case.

### BrowserGym

BrowserGym provides the most relevant extensibility lesson: one environment
interface can host many benchmark task classes. Riven RL now mirrors that
separation without making browser actions universal. Each adapter declares its
own capabilities while the shared episode owns invariant mechanics.

### WebVoyager

WebVoyager contributes realistic task diversity and multimodal traces. Its live
website dependence and multimodal model grader are unsuitable as the primary
Open Next Bench oracle because both can drift. We retain its diversity and trace
principles while requiring stable local targets and deterministic primary
evaluation.

## Environment contract

Every suite adapter implements four operations:

1. `reset(task)` restores a known task state and returns the initial
   observation.
2. `invoke(tool, arguments)` executes one declared capability.
3. `evaluate(submission)` invokes the suite's hidden deterministic scorer.
4. `close()` releases containers, browsers, files, and network resources.

The shared episode rejects undeclared tools, enforces step/token/time budgets,
allows one terminal submission, records the transcript, and emits a result with
suite/environment/scorer versions. Evaluator secrets and raw commands never
enter model-visible observations.

## Training readiness audit

| Gate                                  | Evidence                                                   | Status          |
| ------------------------------------- | ---------------------------------------------------------- | --------------- |
| Suite-neutral lifecycle               | shared Riven RL benchmark environment and contract tests   | Ready           |
| Open Next Bench verifiers environment | named tools plus hidden per-episode state and reward       | Ready           |
| Train/eval separation                 | fixed 8/4 authored pilot split                             | Ready for smoke |
| Clean controls                        | 1 train and 2 eval clean cases                             | Ready for smoke |
| Deterministic reward                  | structured one-to-one scorer; no model judge               | Ready           |
| Base-vs-trained holdout               | same vLLM endpoint before and after final weight sync      | Ready           |
| QA image process lifecycle            | entrypoint starts, health-checks, and tears down vLLM      | Ready           |
| Default job routing                   | `RIVEN_METHOD=qa`, `RIVEN_QA_SUITE=open-next-bench`        | Ready           |
| CPU validation                        | lint, contract, environment, dispatch, and lifecycle tests | Ready           |
| Real repository cases                 | no independently reviewed materialized families yet        | Not publishable |
| Container isolation                   | simulated adapter only                                     | Not publishable |
| GPU integration smoke                 | requires owned GPU execution                               | Run next        |

## Recommended next training run

Use the default 1.7B model on the QA GPU image. The objective is systems
validation, not a model-quality claim.

```text
RIVEN_METHOD=qa
RIVEN_QA_SUITE=open-next-bench
RIVEN_BASE_MODEL=Qwen/Qwen3-1.7B
RIVEN_MAX_STEPS=30
RIVEN_NUM_GENERATIONS=4
RIVEN_MAX_TURNS=10
RIVEN_EVAL_HOLDOUT=1
RIVEN_NO_RESUME=1
```

Acceptance criteria:

- vLLM reaches health before the trainer starts;
- the base holdout completes before the first optimizer step;
- training emits real loss/reward progress rather than a synthetic success;
- final weights synchronize to vLLM;
- all four untouched eval cases produce terminal scored reports;
- the `done` event contains `open_next_bench_reward`, base score, trained score,
  delta, and sample count;
- checkpoints are durable even if post-training evaluation fails.

Do not increase model size or run length until this smoke succeeds. A 27B
single-GPU configuration is not currently supported because a 4-bit training
model and a full vLLM inference replica do not fit merely because the trainer is
quantized.

## Remaining publication work

1. Materialize at least 10 real pilot families with license and provenance
   review, then scale to the 50-family/200-case release gate.
2. Implement digest-pinned container reset, path confinement, output caps, and
   evaluator-private mounts.
3. Publish scorer conformance vectors consumed by both TypeScript and Python.
4. Validate every control and mutation oracle three consecutive times.
5. Double-annotate ground truth and adjudicate disagreements.
6. Run trivial, scripted, and at least three real agent baselines under
   identical budgets.
7. Publish exclusions, invalid cases, leakage audit, run manifests, confidence
   intervals, and per-family slices.

## Primary references

- [SWE-bench evaluation harness](https://github.com/SWE-bench/SWE-bench)
- [WebArena](https://github.com/web-arena-x/webarena)
- [VisualWebArena](https://github.com/web-arena-x/visualwebarena)
- [BrowserGym](https://github.com/ServiceNow/BrowserGym)
- [WebVoyager](https://github.com/MinorJerry/WebVoyager)
- [Verifiers](https://github.com/PrimeIntellect-ai/verifiers)

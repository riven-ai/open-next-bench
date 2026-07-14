# Riven RL environment contract

Open Next Bench owns cases and deterministic scoring. Riven RL owns the agent
episode that produces a prediction. The integration has three trust zones:

1. **Model-visible:** `PublicBenchmarkCase`, the materialized repository, and
   observations returned by allowed tools.
2. **Executor-only:** container image selection, setup, and named oracle/check
   implementations. Raw commands are never model arguments.
3. **Verifier-only:** `GroundTruthDocument` and the submitted
   `PredictionDocument`.

The harness must call `toPublicBenchmarkCase` before constructing a prompt or
episode state. Ground truth, mutation patches, oracle commands, and evaluator
paths must live outside the agent workspace and must not appear in tool output.

## Episode protocol

An episode resets to a digest-pinned case, exposes only tools declared by the
public case, and terminates on `submit_report` or the case budget. Reports use
agent-local `findingId` values and the benchmark prediction schema. A named
`run_check(checkId)` tool maps an opaque, allowlisted identifier to an
executor-owned command; agents cannot submit arbitrary shell commands.

The CPU fixture backend implements the same protocol as the container/browser
backend. It is for contract and reward testing, not for claiming model quality.

## Reward requirements

Training reward is deterministic and derived from the benchmark scorer. A
finding receives category, severity, localization, and calibration credit only
after one-to-one localization matching. Clean controls award full correctness
only for an empty report and penalize every false positive. A small bounded step
cost may distinguish equally correct trajectories, but cannot outweigh an
incorrect terminal report.

Before a training run, conformance tests must cover perfect reports, missed
issues, duplicate/spam findings, wrong localization, clean controls, malformed
reports, budget exhaustion, and attempts to access private fields.

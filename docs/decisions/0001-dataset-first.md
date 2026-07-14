# ADR 0001: Build the dataset contract before the leaderboard

- Status: Accepted
- Date: 2026-07-14

## Decision

Start with schemas, source governance, deterministic scoring, and a small
locally runnable corpus. Defer the hosted leaderboard until the execution
protocol and holdout governance are credible.

## Why

A polished leaderboard cannot repair ambiguous ground truth, moving source
revisions, license problems, or incomparable agent budgets. A dataset-first
slice makes those choices reviewable and lets contributors produce useful cases
without depending on hosted infrastructure.

#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import {
  groundTruthDocumentSchema,
  predictionDocumentSchema,
} from "./schema.js";
import { score } from "./scorer.js";
import { exportRepairCorpus } from "./export/dataset.js";
import { ownedCorpusFamilies } from "./mutations/owned-corpus.js";
import { repairScoringInputSchema } from "./repair/schema.js";
import { scoreRepairEpisode } from "./repair/scorer.js";

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

const program = new Command();

program.name("open-next-bench").description("Open Next Bench utilities");
program
  .command("score")
  .requiredOption("--truth <path>")
  .requiredOption("--predictions <path>")
  .action(async (options: { truth: string; predictions: string }) => {
    const truth = groundTruthDocumentSchema.parse(
      await readJson(options.truth),
    );
    const predictions = predictionDocumentSchema.parse(
      await readJson(options.predictions),
    );
    process.stdout.write(
      `${JSON.stringify(score(truth, predictions), null, 2)}\n`,
    );
  });

program
  .command("score-repair")
  .description("Score one terminal repair attempt with evaluator evidence")
  .requiredOption("--input <path>")
  .action(async (options: { input: string }) => {
    const input = repairScoringInputSchema.parse(await readJson(options.input));
    process.stdout.write(
      `${JSON.stringify(
        scoreRepairEpisode(input.case, input.submissions, input.evidence),
        null,
        2,
      )}\n`,
    );
  });

program
  .command("export-repair-dataset")
  .description("Export the owned repair pilot as Hugging Face-ready JSONL")
  .requiredOption("--out <path>")
  .requiredOption("--benchmark-commit <sha>")
  .requiredOption("--image <reference>")
  .requiredOption("--image-digest <digest>")
  .option("--benchmark-version <version>", "benchmark version", "0.2.0-pilot.1")
  .option(
    "--environment-version <version>",
    "environment version",
    "repair-env-1.0",
  )
  .action(
    async (options: {
      out: string;
      benchmarkCommit: string;
      image: string;
      imageDigest: string;
      benchmarkVersion: string;
      environmentVersion: string;
    }) => {
      const result = await exportRepairCorpus(ownedCorpusFamilies, {
        outputDirectory: options.out,
        benchmarkVersion: options.benchmarkVersion,
        benchmarkCommit: options.benchmarkCommit,
        environmentVersion: options.environmentVersion,
        image: options.image,
        imageDigest: options.imageDigest,
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    },
  );

await program.parseAsync();

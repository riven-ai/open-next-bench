#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import {
  groundTruthDocumentSchema,
  predictionDocumentSchema,
} from "./schema.js";
import { score } from "./scorer.js";

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

await program.parseAsync();

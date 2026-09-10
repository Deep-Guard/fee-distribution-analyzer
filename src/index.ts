#!/usr/bin/env node
import "dotenv/config";
import fs from "fs";
import path from "path";
import { Command } from "commander";
import chalk from "chalk";
import { ethers } from "ethers";

import { Config } from "./types";
import { fetchFeeEvents, fetchRatioFeeEvents } from "./fetchers/events";
import { fetchCurrentPrices, buildHistoricalPriceMap } from "./fetchers/prices";
import { attachUsdValues, buildReport } from "./analyzers/aggregate";
import { watchFeeEvents } from "./analyzers/watch";
import { printReport } from "./reporters/terminal";
import { writeHtmlReport } from "./reporters/html";
import { writeJsonReport } from "./reporters/json";

async function run(
  configPath: string,
  options: { html: boolean; json: boolean; output: string; watch: boolean }
) {
  // ── Load config ──────────────────────────────────────────────────────────
  const configFile = path.resolve(configPath);
  if (!fs.existsSync(configFile)) {
    console.error(chalk.red(`Config file not found: ${configFile}`));
    process.exit(1);
  }

  const config: Config = JSON.parse(fs.readFileSync(configFile, "utf-8"));

  if (!config.rpc && process.env.RPC_URL) config.rpc = process.env.RPC_URL;
  if (!config.rpc) {
    console.error(chalk.red("No RPC URL provided. Set RPC_URL in .env or add rpc to your config."));
    process.exit(1);
  }

  const outputDir = options.output || config.outputDir || "./reports";
  const feeEvents = config.feeEvents ?? [];
  const feeRatios = config.feeRatios ?? [];

  if (feeEvents.length === 0 && feeRatios.length === 0) {
    console.error(chalk.red("Config must have at least one entry in feeEvents or feeRatios."));
    process.exit(1);
  }

  console.log(chalk.bold.white("\nDeep Guard — Fee Distribution Analyzer"));
  console.log(chalk.gray("─".repeat(50)));

  // ── Connect ──────────────────────────────────────────────────────────────
  const provider = new ethers.JsonRpcProvider(config.rpc);
  const network = await provider.getNetwork();
  const latestBlock = await provider.getBlockNumber();
  const endBlock = config.endBlock ?? latestBlock;

  console.log(chalk.gray(`Connected to chain ID ${network.chainId}`));
  console.log(chalk.gray(`Block range: ${config.startBlock.toLocaleString()} – ${endBlock.toLocaleString()}\n`));

  // ── Fetch current prices ──────────────────────────────────────────────────
  const allCoingeckoIds = [
    ...feeEvents.map((e) => e.tokenCoingeckoId),
    ...feeRatios.map((e) => e.tokenCoingeckoId),
  ];

  console.log(chalk.bold("Fetching current prices..."));
  const currentPrices = await fetchCurrentPrices(allCoingeckoIds);
  for (const [id, price] of currentPrices) {
    console.log(chalk.gray(`  ${id.padEnd(25)} $${price.toFixed(4)}`));
  }

  // ── Watch mode ────────────────────────────────────────────────────────────
  if (options.watch) {
    watchFeeEvents(provider, feeEvents, feeRatios, currentPrices);
    return; // keep process alive in watch mode
  }

  // ── Fetch historical events ───────────────────────────────────────────────
  console.log(chalk.bold("\nFetching historical fee events..."));
  let allEvents = [
    ...(await Promise.all(
      feeEvents.map((mapping) => fetchFeeEvents(provider, mapping, config.startBlock, endBlock))
    )).flat(),
    ...(await Promise.all(
      feeRatios.map((mapping) => fetchRatioFeeEvents(provider, mapping, config.startBlock, endBlock))
    )).flat(),
  ];

  if (allEvents.length === 0) {
    console.log(chalk.yellow("\nNo fee events found in the specified block range."));
    console.log(chalk.gray("Check your config: contract addresses, event signatures, and startBlock."));
    process.exit(0);
  }

  console.log(chalk.green(`\nTotal events found: ${allEvents.length}`));

  // ── Attach USD values ─────────────────────────────────────────────────────
  console.log(chalk.bold("\nFetching historical prices for USD valuation..."));
  const dates = allEvents.map(
    (e) => new Date(e.timestamp * 1000).toISOString().slice(0, 10)
  );
  const priceMap = await buildHistoricalPriceMap(allCoingeckoIds, dates, currentPrices);

  allEvents = attachUsdValues(allEvents, priceMap, currentPrices);

  // ── Build and output report ───────────────────────────────────────────────
  const report = buildReport(config.protocolName, allEvents, config.startBlock, endBlock);

  printReport(report);

  if (options.json) {
    const jsonPath = writeJsonReport(report, outputDir);
    console.log(chalk.gray(`JSON report written: ${jsonPath}`));
  }

  if (options.html) {
    const htmlPath = writeHtmlReport(report, outputDir);
    console.log(chalk.green(`HTML report written: ${htmlPath}`));
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("fee-analyzer")
  .description("Tracks how protocol fees flow to stakers, LPs, treasury, and burn mechanisms")
  .version("1.0.0")
  .argument("<config>", "Path to your config JSON file")
  .option("--html", "Write an HTML report to the output directory", false)
  .option("--json", "Write a JSON report to the output directory", false)
  .option("--watch", "Watch for new fee events in real time (no historical report)", false)
  .option("--output <dir>", "Output directory for reports", "./reports")
  .action((configPath: string, options: { html: boolean; json: boolean; output: string; watch: boolean }) => {
    run(configPath, options).catch((err) => {
      console.error(chalk.red("\nError: " + (err instanceof Error ? err.message : String(err))));
      process.exit(1);
    });
  });

program.parse();

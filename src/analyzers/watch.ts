import { ethers } from "ethers";
import chalk from "chalk";
import { FeeEventMapping, FeeRatioMapping } from "../types";

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString();
}

/**
 * Watch for new fee events in real time and print them to the terminal.
 * Runs until the process is interrupted (Ctrl+C).
 */
export function watchFeeEvents(
  provider: ethers.JsonRpcProvider,
  feeEvents: FeeEventMapping[],
  feeRatios: FeeRatioMapping[],
  currentPrices: Map<string, number>
): void {
  console.log(chalk.bold.white("\nWatching for fee events (Ctrl+C to stop)...\n"));

  const sessionTotals = new Map<string, number>(); // recipient → cumulative USD

  function printEvent(
    label: string,
    recipient: string,
    amount: number,
    symbol: string,
    usdValue: number,
    txHash: string,
    blockNumber: number
  ) {
    sessionTotals.set(recipient, (sessionTotals.get(recipient) ?? 0) + usdValue);

    const time = formatTime(Math.floor(Date.now() / 1000));
    console.log(
      chalk.gray(`[${time}]`) +
      " " +
      chalk.cyan(label.padEnd(35)) +
      chalk.white(`${amount.toFixed(4)} ${symbol}`.padEnd(20)) +
      chalk.yellow(formatUsd(usdValue).padEnd(16)) +
      chalk.green(`→ ${recipient}`)
    );
    console.log(chalk.gray(`         tx: ${txHash}  block: ${blockNumber}`));

    // Print running session totals
    console.log(chalk.gray("         Session totals:"), Array.from(sessionTotals.entries())
      .map(([r, usd]) => chalk.white(`${r}: ${formatUsd(usd)}`))
      .join("  "));
    console.log();
  }

  // Watch direct event mappings
  for (const mapping of feeEvents) {
    const iface = new ethers.Interface([`event ${mapping.eventSignature}`]);
    const eventFragment = iface.fragments[0] as ethers.EventFragment;
    const topic0 = iface.getEvent(eventFragment.name)!.topicHash;

    const filter: ethers.Filter = { address: mapping.contractAddress, topics: [topic0] };

    provider.on(filter, (log: ethers.Log) => {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed) return;

      const rawAmount: bigint = parsed.args[mapping.amountArgName];
      const formatted = Number(ethers.formatUnits(rawAmount, mapping.tokenDecimals));
      const price = currentPrices.get(mapping.tokenCoingeckoId) ?? 0;
      const usdValue = formatted * price;

      printEvent(mapping.label, mapping.recipient, formatted, mapping.tokenSymbol, usdValue, log.transactionHash, log.blockNumber);
    });
  }

  // Watch ratio-based mappings
  for (const mapping of feeRatios) {
    const iface = new ethers.Interface([`event ${mapping.eventSignature}`]);
    const eventFragment = iface.fragments[0] as ethers.EventFragment;
    const topic0 = iface.getEvent(eventFragment.name)!.topicHash;

    const filter: ethers.Filter = { address: mapping.contractAddress, topics: [topic0] };

    provider.on(filter, (log: ethers.Log) => {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed) return;

      const totalRaw: bigint = parsed.args[mapping.totalAmountArgName];
      const totalFormatted = Number(ethers.formatUnits(totalRaw, mapping.tokenDecimals));
      const price = currentPrices.get(mapping.tokenCoingeckoId) ?? 0;

      for (const split of mapping.splits) {
        const amount = totalFormatted * split.share;
        const usdValue = amount * price;
        printEvent(
          `${mapping.label} → ${split.recipient}`,
          split.recipient,
          amount,
          mapping.tokenSymbol,
          usdValue,
          log.transactionHash,
          log.blockNumber
        );
      }
    });
  }

  // Keep process alive
  process.on("SIGINT", () => {
    console.log(chalk.bold.white("\nFinal session totals:"));
    for (const [recipient, usd] of sessionTotals) {
      console.log(`  ${chalk.cyan(recipient.padEnd(20))} ${chalk.green(formatUsd(usd))}`);
    }
    process.exit(0);
  });
}

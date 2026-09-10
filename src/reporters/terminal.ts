import chalk from "chalk";
import { FeeReport, PeriodSummary } from "../types";

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function bar(pct: number, width = 30): string {
  const filled = Math.round(pct * width);
  return chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(width - filled));
}

function divider(width = 72): string {
  return chalk.gray("─".repeat(width));
}

export function printReport(report: FeeReport): void {
  console.log("\n");
  console.log(chalk.bold.white(`  Fee Distribution Report — ${report.protocolName}`));
  console.log(chalk.gray(`  Generated: ${report.generatedAt}`));
  console.log(chalk.gray(`  Period:    ${report.startDate} to ${report.endDate}  (blocks ${report.startBlock.toLocaleString()} – ${report.endBlock.toLocaleString()})`));
  console.log(divider());

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n" + chalk.bold.white("  SUMMARY\n"));
  console.log(`  Total Fees Collected:  ${chalk.bold.green(formatUsd(report.totalFeesUsd))}`);
  console.log(`  Total Fee Events:      ${chalk.white(report.totalEvents.toLocaleString())}`);
  console.log(`  Recipients:            ${chalk.white(report.recipients.length)}`);

  // ── Recipient Breakdown ───────────────────────────────────────────────────
  console.log("\n" + divider());
  console.log(chalk.bold.white("\n  FEE DISTRIBUTION BY RECIPIENT\n"));

  for (const r of report.recipients) {
    console.log(
      `  ${chalk.cyan(r.recipient.padEnd(18))} ` +
      `${bar(r.sharePct)} ` +
      `${chalk.yellow(formatPct(r.sharePct).padStart(6))} ` +
      `${chalk.green(formatUsd(r.totalUsd))}`
    );

    for (const token of r.byToken) {
      console.log(
        chalk.gray(
          `    ${token.symbol.padEnd(8)} ${token.totalAmount.toFixed(4).padStart(16)} tokens   ${formatUsd(token.totalUsd)}`
        )
      );
    }
    console.log();
  }

  // ── Daily History ─────────────────────────────────────────────────────────
  if (report.dailySummaries.length > 0) {
    console.log(divider());
    console.log(chalk.bold.white("\n  DAILY BREAKDOWN (most recent 14 days)\n"));

    const recent = report.dailySummaries.slice(-14);
    const maxDay = Math.max(...recent.map((d) => d.totalUsd));

    for (const day of recent) {
      const dayBar = bar(maxDay > 0 ? day.totalUsd / maxDay : 0, 20);
      const recipientLine = day.recipients
        .map((r) => `${chalk.cyan(r.recipient)}: ${chalk.yellow(formatPct(r.sharePct))}`)
        .join("  ");

      console.log(`  ${chalk.gray(day.period)}  ${dayBar}  ${chalk.green(formatUsd(day.totalUsd))}`);
      console.log(`  ${" ".repeat(10)}${recipientLine}`);
      console.log();
    }
  }

  console.log(divider());
  console.log(chalk.gray("\n  For a full protocol risk assessment, contact Deep Guard."));
  console.log(chalk.gray("  getaudited@deepguard.xyz  |  https://deepguard.xyz\n"));
}

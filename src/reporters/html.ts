import fs from "fs";
import path from "path";
import { FeeReport, RecipientSummary } from "../types";

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const RECIPIENT_COLORS: Record<string, string> = {
  Treasury: "#3b82f6",
  Stakers: "#22c55e",
  LPs: "#a855f7",
  Burn: "#ef4444",
};

function colorFor(recipient: string): string {
  return RECIPIENT_COLORS[recipient] ?? "#f59e0b";
}

function renderDonutSvg(recipients: RecipientSummary[]): string {
  const cx = 80;
  const cy = 80;
  const r = 60;
  const stroke = 28;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const slices = recipients.map((rec) => {
    const dashArray = rec.sharePct * circumference;
    const dashOffset = -offset * circumference;
    offset += rec.sharePct;
    return `
      <circle cx="${cx}" cy="${cy}" r="${r}"
        fill="none"
        stroke="${colorFor(rec.recipient)}"
        stroke-width="${stroke}"
        stroke-dasharray="${dashArray.toFixed(2)} ${circumference.toFixed(2)}"
        stroke-dashoffset="${dashOffset.toFixed(2)}"
        transform="rotate(-90 ${cx} ${cy})"
      />`;
  });

  return `<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" style="width:160px;height:160px">
    ${slices.join("\n")}
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="10" fill="#94a3b8">Total</text>
    <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="9" fill="#e2e8f0">${formatUsd(recipients.reduce((s, r) => s + r.totalUsd, 0))}</text>
  </svg>`;
}

function renderDailyChart(report: FeeReport): string {
  const days = report.dailySummaries.slice(-30);
  if (days.length === 0) return "<p class='sub'>No daily data available.</p>";

  const maxUsd = Math.max(...days.map((d) => d.totalUsd));
  const barW = Math.max(8, Math.floor(560 / days.length) - 2);
  const chartH = 120;

  const bars = days.map((day, i) => {
    const h = maxUsd > 0 ? Math.round((day.totalUsd / maxUsd) * chartH) : 0;
    const x = i * (barW + 2);
    const y = chartH - h;

    // Stack bars by recipient
    let yStack = chartH;
    const rects = day.recipients.map((rec) => {
      const rh = Math.round(rec.sharePct * h);
      yStack -= rh;
      return `<rect x="${x}" y="${yStack}" width="${barW}" height="${rh}" fill="${colorFor(rec.recipient)}" title="${rec.recipient}: ${formatUsd(rec.totalUsd)}"/>`;
    });

    return `${rects.join("")}
      <text x="${x + barW / 2}" y="${chartH + 14}" text-anchor="middle" font-size="7" fill="#475569"
        transform="rotate(-45 ${x + barW / 2} ${chartH + 14})">${day.period.slice(5)}</text>`;
  });

  const totalW = days.length * (barW + 2);
  return `<svg viewBox="0 0 ${totalW} ${chartH + 30}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:640px">
    ${bars.join("\n")}
  </svg>`;
}

export function generateHtmlReport(report: FeeReport): string {
  const recipientCards = report.recipients.map((r) => `
    <div class="recipient-card">
      <div class="rec-header">
        <span class="rec-dot" style="background:${colorFor(r.recipient)}"></span>
        <strong>${r.recipient}</strong>
        <span class="rec-pct">${formatPct(r.sharePct)}</span>
        <span class="rec-usd">${formatUsd(r.totalUsd)}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${formatPct(r.sharePct)};background:${colorFor(r.recipient)}"></div>
      </div>
      <div class="token-rows">
        ${r.byToken.map((t) => `
          <div class="token-row">
            <span>${t.symbol}</span>
            <span>${t.totalAmount.toFixed(4)} tokens</span>
            <span>${formatUsd(t.totalUsd)}</span>
          </div>`).join("")}
      </div>
    </div>`).join("");

  const recentEvents = report.allEvents.slice(-20).reverse().map((e) => `
    <tr>
      <td>${new Date(e.timestamp * 1000).toISOString().slice(0, 16).replace("T", " ")}</td>
      <td><span class="badge" style="background:${colorFor(e.recipient)}20;color:${colorFor(e.recipient)}">${e.recipient}</span></td>
      <td>${e.label}</td>
      <td>${e.formattedAmount.toFixed(4)} ${e.tokenSymbol}</td>
      <td>${formatUsd(e.usdValue ?? 0)}</td>
      <td><a href="https://etherscan.io/tx/${e.transactionHash}" target="_blank" class="tx-link">${e.transactionHash.slice(0, 10)}...</a></td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fee Distribution — ${report.protocolName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           background: #0f172a; color: #e2e8f0; padding: 2rem; line-height: 1.6; }
    .container { max-width: 960px; margin: 0 auto; }
    h1 { font-size: 1.75rem; color: #f1f5f9; }
    .meta { color: #64748b; font-size: 0.875rem; margin-top: 0.25rem; margin-bottom: 2rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
                    gap: 1rem; margin-bottom: 2rem; }
    .stat-card { background: #1e293b; border-radius: 8px; padding: 1rem 1.25rem; }
    .stat-card .label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-card .value { font-size: 1.4rem; font-weight: 700; margin-top: 0.2rem; }
    .section { margin-bottom: 2.5rem; }
    .section h2 { font-size: 0.85rem; font-weight: 600; text-transform: uppercase;
                  letter-spacing: 0.1em; color: #64748b; border-bottom: 1px solid #1e293b;
                  padding-bottom: 0.5rem; margin-bottom: 1.25rem; }
    .distribution-layout { display: grid; grid-template-columns: auto 1fr; gap: 2rem; align-items: start; }
    .recipient-card { background: #1e293b; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 0.75rem; }
    .rec-header { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; }
    .rec-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .rec-pct { margin-left: auto; color: #94a3b8; font-size: 0.875rem; }
    .rec-usd { font-weight: 700; color: #22c55e; }
    .progress-bar { height: 4px; background: #0f172a; border-radius: 2px; margin-bottom: 0.75rem; }
    .progress-fill { height: 100%; border-radius: 2px; }
    .token-rows { font-size: 0.8125rem; color: #64748b; }
    .token-row { display: flex; justify-content: space-between; padding: 0.15rem 0; }
    table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
    th { background: #1e293b; color: #64748b; text-align: left; padding: 0.5rem 0.75rem;
         font-size: 0.7rem; text-transform: uppercase; font-weight: 600; }
    td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #1e293b; }
    .badge { font-size: 0.7rem; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
    .tx-link { color: #3b82f6; text-decoration: none; font-family: monospace; }
    .sub { color: #64748b; font-size: 0.8125rem; }
    .footer { margin-top: 3rem; border-top: 1px solid #1e293b; padding-top: 1.5rem;
              text-align: center; font-size: 0.8125rem; color: #475569; }
    .footer a { color: #3b82f6; text-decoration: none; }
  </style>
</head>
<body>
<div class="container">
  <h1>Fee Distribution Report</h1>
  <div class="meta">${report.protocolName} &nbsp;·&nbsp; ${report.startDate} to ${report.endDate} &nbsp;·&nbsp; Generated ${report.generatedAt.slice(0, 16).replace("T", " ")} UTC</div>

  <div class="summary-grid">
    <div class="stat-card">
      <div class="label">Total Fees</div>
      <div class="value" style="color:#22c55e">${formatUsd(report.totalFeesUsd)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Fee Events</div>
      <div class="value">${report.totalEvents.toLocaleString()}</div>
    </div>
    <div class="stat-card">
      <div class="label">Recipients</div>
      <div class="value">${report.recipients.length}</div>
    </div>
    <div class="stat-card">
      <div class="label">Largest Share</div>
      <div class="value" style="color:${colorFor(report.recipients[0]?.recipient ?? "")}">${report.recipients[0]?.recipient ?? "—"}</div>
    </div>
  </div>

  <div class="section">
    <h2>Distribution</h2>
    <div class="distribution-layout">
      <div>${renderDonutSvg(report.recipients)}</div>
      <div>${recipientCards}</div>
    </div>
  </div>

  <div class="section">
    <h2>Daily Fee Volume (last 30 days)</h2>
    ${renderDailyChart(report)}
  </div>

  <div class="section">
    <h2>Recent Events (last 20)</h2>
    <table>
      <thead><tr><th>Time</th><th>Recipient</th><th>Source</th><th>Amount</th><th>USD Value</th><th>Tx</th></tr></thead>
      <tbody>${recentEvents}</tbody>
    </table>
  </div>

  <div class="footer">
    Generated by <a href="https://github.com/Deep-Guard/fee-distribution-analyzer">Deep Guard Fee Distribution Analyzer</a> &nbsp;·&nbsp;
    For a professional protocol assessment, contact <a href="mailto:getaudited@deepguard.xyz">Deep Guard</a>
  </div>
</div>
</body>
</html>`;
}

export function writeHtmlReport(report: FeeReport, outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `fee-report-${report.generatedAt.slice(0, 10)}.html`;
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, generateHtmlReport(report), "utf-8");
  return filepath;
}

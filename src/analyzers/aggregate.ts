import { FeeEvent, RecipientSummary, FeeReport, PeriodSummary } from "../types";

/**
 * Attach USD values to fee events using a historical price map.
 * Falls back to current price if a historical price is unavailable.
 */
export function attachUsdValues(
  events: FeeEvent[],
  priceMap: Map<string, Map<string, number>>,
  currentPrices: Map<string, number>
): FeeEvent[] {
  return events.map((event) => {
    const date = new Date(event.timestamp * 1000).toISOString().slice(0, 10);
    const price =
      priceMap.get(event.tokenCoingeckoId)?.get(date) ??
      currentPrices.get(event.tokenCoingeckoId) ??
      0;

    return { ...event, usdValue: event.formattedAmount * price };
  });
}

/**
 * Aggregate fee events into per-recipient summaries with share percentages.
 */
export function aggregateByRecipient(events: FeeEvent[]): RecipientSummary[] {
  const totalUsd = events.reduce((s, e) => s + (e.usdValue ?? 0), 0);

  // Group by recipient
  const byRecipient = new Map<string, FeeEvent[]>();
  for (const event of events) {
    const list = byRecipient.get(event.recipient) ?? [];
    list.push(event);
    byRecipient.set(event.recipient, list);
  }

  const summaries: RecipientSummary[] = [];

  for (const [recipient, recipientEvents] of byRecipient) {
    const recipientUsd = recipientEvents.reduce((s, e) => s + (e.usdValue ?? 0), 0);

    // Group by token within this recipient
    const byToken = new Map<string, { totalAmount: number; totalUsd: number }>();
    for (const event of recipientEvents) {
      const existing = byToken.get(event.tokenSymbol) ?? { totalAmount: 0, totalUsd: 0 };
      byToken.set(event.tokenSymbol, {
        totalAmount: existing.totalAmount + event.formattedAmount,
        totalUsd: existing.totalUsd + (event.usdValue ?? 0),
      });
    }

    summaries.push({
      recipient,
      totalUsd: recipientUsd,
      sharePct: totalUsd > 0 ? recipientUsd / totalUsd : 0,
      byToken: Array.from(byToken.entries()).map(([symbol, data]) => ({
        symbol,
        totalAmount: data.totalAmount,
        totalUsd: data.totalUsd,
      })),
    });
  }

  // Sort by total USD descending
  return summaries.sort((a, b) => b.totalUsd - a.totalUsd);
}

/**
 * Group fee events by calendar day and produce per-day recipient summaries.
 */
export function aggregateByDay(events: FeeEvent[]): PeriodSummary[] {
  const byDay = new Map<string, FeeEvent[]>();

  for (const event of events) {
    const day = new Date(event.timestamp * 1000).toISOString().slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(event);
    byDay.set(day, list);
  }

  const summaries: PeriodSummary[] = [];

  for (const [day, dayEvents] of byDay) {
    const totalUsd = dayEvents.reduce((s, e) => s + (e.usdValue ?? 0), 0);
    summaries.push({
      period: day,
      totalUsd,
      recipients: aggregateByRecipient(dayEvents),
    });
  }

  return summaries.sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Build the complete fee report.
 */
export function buildReport(
  protocolName: string,
  events: FeeEvent[],
  startBlock: number,
  endBlock: number
): FeeReport {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const startTs = sorted[0]?.timestamp ?? 0;
  const endTs = sorted[sorted.length - 1]?.timestamp ?? 0;

  const recipients = aggregateByRecipient(sorted);
  const dailySummaries = aggregateByDay(sorted);
  const totalFeesUsd = recipients.reduce((s, r) => s + r.totalUsd, 0);

  return {
    generatedAt: new Date().toISOString(),
    protocolName,
    startBlock,
    endBlock,
    startDate: startTs ? new Date(startTs * 1000).toISOString().slice(0, 10) : "N/A",
    endDate: endTs ? new Date(endTs * 1000).toISOString().slice(0, 10) : "N/A",
    totalFeesUsd,
    totalEvents: events.length,
    recipients,
    dailySummaries,
    allEvents: sorted,
  };
}

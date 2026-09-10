import { ethers } from "ethers";
import { FeeEventMapping, FeeRatioMapping, FeeEvent } from "../types";

/** Maximum block range per getLogs call — most RPC providers cap at 2000 */
const CHUNK_SIZE = 2_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch logs in chunks to avoid RPC provider block range limits.
 */
async function getLogsChunked(
  provider: ethers.JsonRpcProvider,
  filter: ethers.Filter,
  startBlock: number,
  endBlock: number
): Promise<ethers.Log[]> {
  const logs: ethers.Log[] = [];
  let from = startBlock;

  while (from <= endBlock) {
    const to = Math.min(from + CHUNK_SIZE - 1, endBlock);
    process.stdout.write(`\r  Fetching blocks ${from.toLocaleString()} – ${to.toLocaleString()}...`);

    const chunk = await provider.getLogs({ ...filter, fromBlock: from, toBlock: to });
    logs.push(...chunk);
    from = to + 1;

    if (from <= endBlock) await wait(300);
  }

  process.stdout.write("\n");
  return logs;
}

/**
 * Resolve block timestamps in batches.
 * Caches results to avoid redundant RPC calls when multiple events share a block.
 */
async function resolveTimestamps(
  provider: ethers.JsonRpcProvider,
  blockNumbers: number[]
): Promise<Map<number, number>> {
  const unique = [...new Set(blockNumbers)];
  const cache = new Map<number, number>();

  for (let i = 0; i < unique.length; i++) {
    const blockNum = unique[i];
    const block = await provider.getBlock(blockNum);
    if (block) cache.set(blockNum, block.timestamp);
    if (i % 20 === 0 && i > 0) await wait(200);
  }

  return cache;
}

/**
 * Fetch fee events for a direct event-to-recipient mapping.
 */
export async function fetchFeeEvents(
  provider: ethers.JsonRpcProvider,
  mapping: FeeEventMapping,
  startBlock: number,
  endBlock: number
): Promise<FeeEvent[]> {
  const iface = new ethers.Interface([`event ${mapping.eventSignature}`]);
  const eventFragment = iface.fragments[0] as ethers.EventFragment;
  const topic0 = iface.getEvent(eventFragment.name)!.topicHash;

  const filter: ethers.Filter = {
    address: mapping.contractAddress,
    topics: [topic0],
  };

  console.log(`  [${mapping.label}] scanning ${(endBlock - startBlock).toLocaleString()} blocks...`);
  const logs = await getLogsChunked(provider, filter, startBlock, endBlock);
  console.log(`  [${mapping.label}] found ${logs.length} events`);

  if (logs.length === 0) return [];

  const timestamps = await resolveTimestamps(provider, logs.map((l) => l.blockNumber));

  return logs.map((log) => {
    const parsed = iface.parseLog({ topics: [...log.topics], data: log.data })!;
    const rawAmount: bigint = parsed.args[mapping.amountArgName];

    return {
      blockNumber: log.blockNumber,
      timestamp: timestamps.get(log.blockNumber) ?? 0,
      transactionHash: log.transactionHash,
      recipient: mapping.recipient,
      label: mapping.label,
      tokenSymbol: mapping.tokenSymbol,
      tokenCoingeckoId: mapping.tokenCoingeckoId,
      tokenDecimals: mapping.tokenDecimals,
      rawAmount,
      formattedAmount: Number(ethers.formatUnits(rawAmount, mapping.tokenDecimals)),
    };
  });
}

/**
 * Fetch fee events for a ratio-based mapping and expand them into per-recipient events.
 */
export async function fetchRatioFeeEvents(
  provider: ethers.JsonRpcProvider,
  mapping: FeeRatioMapping,
  startBlock: number,
  endBlock: number
): Promise<FeeEvent[]> {
  const iface = new ethers.Interface([`event ${mapping.eventSignature}`]);
  const eventFragment = iface.fragments[0] as ethers.EventFragment;
  const topic0 = iface.getEvent(eventFragment.name)!.topicHash;

  const filter: ethers.Filter = {
    address: mapping.contractAddress,
    topics: [topic0],
  };

  console.log(`  [${mapping.label}] scanning ${(endBlock - startBlock).toLocaleString()} blocks...`);
  const logs = await getLogsChunked(provider, filter, startBlock, endBlock);
  console.log(`  [${mapping.label}] found ${logs.length} events`);

  if (logs.length === 0) return [];

  const timestamps = await resolveTimestamps(provider, logs.map((l) => l.blockNumber));

  const events: FeeEvent[] = [];

  for (const log of logs) {
    const parsed = iface.parseLog({ topics: [...log.topics], data: log.data })!;
    const totalRaw: bigint = parsed.args[mapping.totalAmountArgName];
    const totalFormatted = Number(ethers.formatUnits(totalRaw, mapping.tokenDecimals));
    const ts = timestamps.get(log.blockNumber) ?? 0;

    for (const split of mapping.splits) {
      const splitAmount = totalFormatted * split.share;
      const splitRaw = (totalRaw * BigInt(Math.round(split.share * 1_000_000))) / 1_000_000n;

      events.push({
        blockNumber: log.blockNumber,
        timestamp: ts,
        transactionHash: log.transactionHash,
        recipient: split.recipient,
        label: `${mapping.label} → ${split.recipient}`,
        tokenSymbol: mapping.tokenSymbol,
        tokenCoingeckoId: mapping.tokenCoingeckoId,
        tokenDecimals: mapping.tokenDecimals,
        rawAmount: splitRaw,
        formattedAmount: splitAmount,
      });
    }
  }

  return events;
}

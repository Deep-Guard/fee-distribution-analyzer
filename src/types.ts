// ─── Config Types ────────────────────────────────────────────────────────────

/**
 * A single fee event mapping.
 * Each entry links one on-chain event to one fee recipient.
 * Use multiple entries with the same recipient to aggregate from different sources.
 */
export interface FeeEventMapping {
  /** Human-readable label for this fee stream, e.g. "Swap fees → Treasury" */
  label: string;
  /** The destination of this fee flow */
  recipient: string;
  /** Contract that emits the event */
  contractAddress: string;
  /**
   * Full event signature, e.g.:
   *   "FeesToTreasury(address indexed token, uint256 amount)"
   *   "FeesBurned(uint256 amount)"
   */
  eventSignature: string;
  /** Name of the argument in the event that holds the fee amount */
  amountArgName: string;
  /**
   * Token paid as fee.
   * Use "native" for ETH, or an ERC20 contract address.
   * If the token address is emitted as an event arg, set this to the arg name prefixed with "$",
   * e.g. "$token" — and list all possible tokens in the top-level `tokens` array.
   */
  tokenAddress: string;
  tokenSymbol: string;
  tokenCoingeckoId: string;
  tokenDecimals: number;
}

/**
 * A ratio-based fee mapping.
 * Use this when a single event emits a total fee and you know the split ratios.
 */
export interface FeeRatioMapping {
  label: string;
  contractAddress: string;
  eventSignature: string;
  totalAmountArgName: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenCoingeckoId: string;
  tokenDecimals: number;
  splits: {
    recipient: string;
    /** Share as a decimal, e.g. 0.5 for 50% */
    share: number;
  }[];
}

export interface Config {
  protocolName: string;
  rpc: string;
  /** Block to start fetching events from */
  startBlock: number;
  /** Block to stop at — defaults to latest */
  endBlock?: number;
  /** Direct event-to-recipient mappings */
  feeEvents?: FeeEventMapping[];
  /** Total fee events with known ratio splits */
  feeRatios?: FeeRatioMapping[];
  outputDir?: string;
}

// ─── Runtime Types ────────────────────────────────────────────────────────────

export interface FeeEvent {
  blockNumber: number;
  timestamp: number;
  transactionHash: string;
  recipient: string;
  label: string;
  tokenSymbol: string;
  tokenCoingeckoId: string;
  tokenDecimals: number;
  rawAmount: bigint;
  formattedAmount: number;
  /** Populated after price lookup */
  usdValue?: number;
}

export interface RecipientSummary {
  recipient: string;
  totalUsd: number;
  byToken: {
    symbol: string;
    totalAmount: number;
    totalUsd: number;
  }[];
  sharePct: number;
}

export interface PeriodSummary {
  period: string;
  totalUsd: number;
  recipients: RecipientSummary[];
}

export interface FeeReport {
  generatedAt: string;
  protocolName: string;
  startBlock: number;
  endBlock: number;
  startDate: string;
  endDate: string;
  totalFeesUsd: number;
  totalEvents: number;
  recipients: RecipientSummary[];
  dailySummaries: PeriodSummary[];
  allEvents: FeeEvent[];
}

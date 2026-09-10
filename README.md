# Fee Distribution Analyzer

Built by [Deep Guard](https://deepguard.xyz)

Tracks how protocol fees flow to stakers, LPs, the treasury, and burn mechanisms. Shows real-time and historical split percentages with absolute USD values. Works with any EVM protocol by mapping on-chain fee events to recipients via a JSON config file.

## What It Does

- Fetches historical fee events from any EVM contract using `getLogs` with automatic block-range chunking
- Supports two patterns: separate events per recipient, or a single total-fee event with defined ratio splits
- Prices every fee event in USD using CoinGecko historical prices
- Aggregates totals by recipient with share percentages
- Provides daily breakdowns for trend analysis
- Real-time `--watch` mode that prints fee events as they happen
- Outputs a terminal summary, HTML report with charts, and JSON data file

## Output

**Terminal**
```
  FEE DISTRIBUTION BY RECIPIENT

  Treasury           ████████████░░░░░░░░░░░░░░░░░░   40.0%   $842,000.00
    USDC      1,404,000.0000 tokens   $842,000.00

  Stakers            ██████████████████░░░░░░░░░░░░   50.0%   $1,052,500.00
    USDC      1,754,167.0000 tokens   $1,052,500.00

  Burn               ████████░░░░░░░░░░░░░░░░░░░░░░   10.0%   $210,500.00
    TOKEN     52,625.0000 tokens      $210,500.00
```

**HTML Report**

Self-contained file with a donut chart, stacked bar daily history, recipient cards with token breakdowns, and a recent events table with Etherscan links.

**JSON**

Full structured report including every individual fee event for downstream processing.

## Installation

```bash
git clone https://github.com/Deep-Guard/fee-distribution-analyzer.git
cd fee-distribution-analyzer
npm install
npm run build
```

## Setup

```bash
cp .env.example .env
```

Edit `.env`:
```
RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
COINGECKO_API_KEY=    # optional
```

## Configuration

Create a JSON config file. Two patterns are supported:

**Pattern A — Separate event per recipient**

Use this when your protocol emits a distinct event for each fee destination.

```json
{
  "protocolName": "My Protocol",
  "rpc": "https://mainnet.infura.io/v3/YOUR_KEY",
  "startBlock": 18000000,
  "feeEvents": [
    {
      "label": "Swap fees to Treasury",
      "recipient": "Treasury",
      "contractAddress": "0x...",
      "eventSignature": "FeeToTreasury(address indexed token, uint256 amount)",
      "amountArgName": "amount",
      "tokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "tokenSymbol": "USDC",
      "tokenCoingeckoId": "usd-coin",
      "tokenDecimals": 6
    },
    {
      "label": "Swap fees to Stakers",
      "recipient": "Stakers",
      "contractAddress": "0x...",
      "eventSignature": "FeeToStakers(address indexed token, uint256 amount)",
      "amountArgName": "amount",
      "tokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "tokenSymbol": "USDC",
      "tokenCoingeckoId": "usd-coin",
      "tokenDecimals": 6
    }
  ]
}
```

**Pattern B — Single total fee event with ratio splits**

Use this when your protocol emits one event with the total fee collected and you know the on-chain split ratios.

```json
{
  "protocolName": "My Protocol",
  "rpc": "https://mainnet.infura.io/v3/YOUR_KEY",
  "startBlock": 18000000,
  "feeRatios": [
    {
      "label": "Protocol fee",
      "contractAddress": "0x...",
      "eventSignature": "FeeCollected(address indexed token, uint256 totalAmount)",
      "totalAmountArgName": "totalAmount",
      "tokenAddress": "native",
      "tokenSymbol": "ETH",
      "tokenCoingeckoId": "ethereum",
      "tokenDecimals": 18,
      "splits": [
        { "recipient": "Treasury", "share": 0.30 },
        { "recipient": "Stakers",  "share": 0.50 },
        { "recipient": "Burn",     "share": 0.20 }
      ]
    }
  ]
}
```

Both patterns can be combined in a single config file. See `examples/` for full templates.

## Usage

```bash
# Historical report — terminal only
npm run dev -- examples/config.example.json

# With HTML and JSON output
npm run dev -- examples/config.example.json --html --json

# Specify block range end
npm run dev -- examples/config.example.json --html

# Real-time watch mode (no historical report)
npm run dev -- examples/config.example.json --watch

# Custom output directory
npm run dev -- examples/config.example.json --html --output ./my-reports
```

## How to Find Your Event Signatures

1. Open your contract on Etherscan and go to the **Events** tab
2. Find the fee-related events your contract emits
3. The event signature is the name plus argument types: `FeeCollected(address indexed token, uint256 amount)`
4. The `amountArgName` or `totalAmountArgName` is the argument name that holds the fee value

## Rate Limits

Historical USD pricing calls CoinGecko once per unique date per token. For long time ranges with many tokens, this can take a few minutes. A free CoinGecko API key reduces throttling.

## Need a Professional Assessment?

This tool surfaces how fees flow through your protocol. For a full economic security review — covering fee manipulation vectors, incentive design, and governance attack surfaces — reach out to Deep Guard.

**Email:** getaudited@deepguard.xyz
**Telegram:** [Message us](https://t.me/KingFavourCreates)
**Website:** https://deepguard.xyz

## Support Open-Source Work

**ETH:** `0xc149EEc98885E700C618360C243dB064D7FcDE3e`

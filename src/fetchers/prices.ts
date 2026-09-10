import axios from "axios";

const BASE_URL = "https://api.coingecko.com/api/v3";
const PRO_BASE_URL = "https://pro-api.coingecko.com/api/v3";

function getBaseUrl(): string {
  return process.env.COINGECKO_API_KEY ? PRO_BASE_URL : BASE_URL;
}

function buildHeaders(): Record<string, string> {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { "x-cg-pro-api-key": key } : {};
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch current USD prices for a list of CoinGecko coin IDs.
 */
export async function fetchCurrentPrices(
  coingeckoIds: string[]
): Promise<Map<string, number>> {
  const unique = [...new Set(coingeckoIds)];
  const url = `${getBaseUrl()}/simple/price`;

  const response = await axios.get(url, {
    headers: buildHeaders(),
    params: { ids: unique.join(","), vs_currencies: "usd" },
  });

  const map = new Map<string, number>();
  for (const id of unique) {
    const price = response.data[id]?.usd;
    if (price !== undefined) map.set(id, price);
  }
  return map;
}

/**
 * Fetch the historical USD price for a coin on a specific date (YYYY-MM-DD).
 * CoinGecko /coins/{id}/history endpoint returns OHLC for that date.
 */
export async function fetchPriceOnDate(
  coingeckoId: string,
  dateStr: string,
  retries = 2
): Promise<number | null> {
  const [year, month, day] = dateStr.split("-");
  const cgDate = `${day}-${month}-${year}`; // CoinGecko expects DD-MM-YYYY

  const url = `${getBaseUrl()}/coins/${coingeckoId}/history`;

  try {
    const response = await axios.get(url, {
      headers: buildHeaders(),
      params: { date: cgDate, localization: false },
    });
    return response.data?.market_data?.current_price?.usd ?? null;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 429 && retries > 0) {
      await wait(60_000);
      return fetchPriceOnDate(coingeckoId, dateStr, retries - 1);
    }
    return null;
  }
}

/**
 * Build a price map for all unique (coingeckoId, date) combinations needed.
 * Uses current price as a fallback for today's date.
 */
export async function buildHistoricalPriceMap(
  coingeckoIds: string[],
  dates: string[],
  currentPrices: Map<string, number>
): Promise<Map<string, Map<string, number>>> {
  // coingeckoId → date → price
  const priceMap = new Map<string, Map<string, number>>();

  const today = new Date().toISOString().slice(0, 10);
  const uniqueDates = [...new Set(dates)].sort();
  const uniqueIds = [...new Set(coingeckoIds)];

  for (const id of uniqueIds) {
    const dateMap = new Map<string, number>();
    priceMap.set(id, dateMap);

    for (const date of uniqueDates) {
      if (date >= today) {
        // Use current price for today and future
        const current = currentPrices.get(id);
        if (current !== undefined) dateMap.set(date, current);
      } else {
        const price = await fetchPriceOnDate(id, date);
        if (price !== null) dateMap.set(date, price);
        await wait(500);
      }
    }
  }

  return priceMap;
}

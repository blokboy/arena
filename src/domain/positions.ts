type Decimal = {
  value: bigint;
  scale: number;
};

export type BuyQuoteInput = {
  stake: string;
  bestAsk: string;
};

export type BuyQuote = {
  stake: string;
  price: string;
  shares: string;
};

export type PositionLot = {
  id: string;
  marketId: string;
  marketQuestion: string;
  outcomeIndex: number;
  outcomeLabel: string;
  status: "OPEN" | "WON" | "LOST" | "VOIDED" | "SOLD";
  stake: string;
  shares: string;
  committedShares: string;
  entryPrice: string;
  purchasedAt: string;
  exitedAt?: string;
  exitPrice?: string;
};

export type PositionGroup = {
  marketId: string;
  marketQuestion: string;
  outcomeIndex: number;
  outcomeLabel: string;
  status: PositionLot["status"];
  lots: PositionLot[];
  totalStake: string;
  totalShares: string;
  committedShares: string;
  availableShares: string;
  averageEntryPrice: string;
};

export function calculateBuyQuote(input: BuyQuoteInput): BuyQuote {
  const stake = parsePositiveDecimal(input.stake, "INVALID_STAKE");
  const price = parsePositiveDecimal(input.bestAsk, "INVALID_PRICE");

  return {
    stake: formatDecimal(stake),
    price: formatDecimal(price),
    shares: divideDecimals(stake, price)
  };
}

export function groupPositions(lots: PositionLot[]): PositionGroup[] {
  const groups = new Map<string, PositionGroup>();

  for (const lot of lots) {
    const key = `${lot.marketId}:${lot.outcomeIndex}:${lot.status}`;
    const existing = groups.get(key);

    if (!existing) {
      const totalStake = normalizeDecimal(lot.stake);
      const totalShares = normalizeDecimal(lot.shares);
      groups.set(key, {
        marketId: lot.marketId,
        marketQuestion: lot.marketQuestion,
        outcomeIndex: lot.outcomeIndex,
        outcomeLabel: lot.outcomeLabel,
        status: lot.status,
        lots: [lot],
        totalStake,
        totalShares,
        committedShares: normalizeDecimal(lot.committedShares),
        availableShares: getAvailableShares(lot),
        averageEntryPrice: averageEntryPriceForGroup([lot], totalStake, totalShares)
      });
      continue;
    }

    existing.lots.push(lot);
    existing.totalStake = addDecimalStrings(existing.totalStake, lot.stake);
    existing.totalShares = addDecimalStrings(existing.totalShares, lot.shares);
    existing.committedShares = addDecimalStrings(existing.committedShares, lot.committedShares);
    existing.availableShares = addDecimalStrings(existing.availableShares, getAvailableShares(lot));
    existing.averageEntryPrice = averageEntryPriceForGroup(
      existing.lots,
      existing.totalStake,
      existing.totalShares
    );
  }

  return [...groups.values()];
}

// A fully sold lot has its remaining shares zeroed out (see
// getSellTransition in src/server/positions.ts), so once a group's total
// shares hits zero, blending by stake/shares is a division by zero rather
// than a meaningful "still open" average. Each lot's own entryPrice never
// changes across partial sells, so fall back to a plain mean of the lots'
// recorded entry prices instead of crashing the render.
function averageEntryPriceForGroup(
  lots: PositionLot[],
  totalStake: string,
  totalShares: string
): string {
  if (parseDecimal(totalShares, "INVALID_SHARES").value === 0n) {
    const sum = lots.reduce(
      (total, lot) => addDecimals(total, parseDecimal(lot.entryPrice, "INVALID_PRICE")),
      { value: 0n, scale: 0 }
    );
    return divideDecimals(sum, { value: BigInt(lots.length), scale: 0 });
  }

  return divideDecimals(
    parseDecimal(totalStake, "INVALID_STAKE"),
    parseDecimal(totalShares, "INVALID_SHARES")
  );
}

export function getAvailableShares(input: { shares: string; committedShares: string }): string {
  const shares = parseDecimal(input.shares, "INVALID_SHARES");
  const committedShares = parseDecimal(input.committedShares, "INVALID_COMMITTED_SHARES");

  if (compareDecimals(committedShares, shares) > 0) {
    throw new Error("COMMITTED_SHARES_EXCEED_SHARES");
  }

  return subtractDecimalStrings(input.shares, input.committedShares);
}

export function calculateSellValue(input: { shares: string; bestBid: string }): string {
  const shares = parseDecimal(input.shares, "INVALID_SHARES");
  const bestBid = parsePositiveDecimal(input.bestBid, "INVALID_PRICE");
  return multiplyDecimals(shares, bestBid);
}

export function normalizeDecimal(input: string): string {
  return formatDecimal(parseDecimal(input, "INVALID_DECIMAL"));
}

export function addDecimalStrings(left: string, right: string): string {
  return formatDecimal(addDecimals(parseDecimal(left), parseDecimal(right)));
}

export function subtractDecimalStrings(left: string, right: string): string {
  const result = subtractDecimals(parseDecimal(left), parseDecimal(right));
  if (result.value < 0n) {
    throw new Error("NEGATIVE_DECIMAL");
  }
  return formatDecimal(result);
}

export function multiplyDecimalStrings(left: string, right: string): string {
  return multiplyDecimals(parseDecimal(left), parseDecimal(right));
}

export function divideDecimalStrings(left: string, right: string): string {
  return divideDecimals(parseDecimal(left), parseDecimal(right));
}

export function parseDecimal(input: string, errorCode = "INVALID_DECIMAL"): Decimal {
  if (!/^(?:\d+|\d*\.\d+)$/.test(input.trim())) {
    throw new Error(errorCode);
  }

  const normalized = input.trim().startsWith(".") ? `0${input.trim()}` : input.trim();
  const [integerPart, fractionPart = ""] = normalized.split(".");
  const digits = `${integerPart}${fractionPart}`.replace(/^0+(?=\d)/, "");

  return {
    value: BigInt(digits || "0"),
    scale: fractionPart.length
  };
}

function parsePositiveDecimal(input: string, errorCode: string): Decimal {
  const decimal = parseDecimal(input, errorCode);
  if (decimal.value <= 0n) {
    throw new Error(errorCode);
  }
  return decimal;
}

function addDecimals(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);
  return {
    value:
      left.value * 10n ** BigInt(scale - left.scale) +
      right.value * 10n ** BigInt(scale - right.scale),
    scale
  };
}

function subtractDecimals(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);
  return {
    value:
      left.value * 10n ** BigInt(scale - left.scale) -
      right.value * 10n ** BigInt(scale - right.scale),
    scale
  };
}

function multiplyDecimals(left: Decimal, right: Decimal): string {
  return formatDecimal({
    value: left.value * right.value,
    scale: left.scale + right.scale
  });
}

function divideDecimals(left: Decimal, right: Decimal): string {
  if (right.value === 0n) {
    throw new Error("DIVIDE_BY_ZERO");
  }

  const precision = 16;
  const numerator = left.value * 10n ** BigInt(precision + right.scale);
  const denominator = right.value * 10n ** BigInt(left.scale);
  return formatDecimal({
    value: numerator / denominator,
    scale: precision
  });
}

function compareDecimals(left: Decimal, right: Decimal): number {
  const scale = Math.max(left.scale, right.scale);
  const leftValue = left.value * 10n ** BigInt(scale - left.scale);
  const rightValue = right.value * 10n ** BigInt(scale - right.scale);

  if (leftValue === rightValue) {
    return 0;
  }
  return leftValue > rightValue ? 1 : -1;
}

function formatDecimal(decimal: Decimal): string {
  const negative = decimal.value < 0n;
  const absolute = negative ? -decimal.value : decimal.value;
  const digits = absolute.toString().padStart(decimal.scale + 1, "0");
  const integer = decimal.scale === 0 ? digits : digits.slice(0, digits.length - decimal.scale);
  const fraction = decimal.scale === 0 ? "" : digits.slice(digits.length - decimal.scale);
  const trimmedFraction = fraction.replace(/0+$/, "");
  const sign = negative ? "-" : "";

  return trimmedFraction.length > 0 ? `${sign}${integer}.${trimmedFraction}` : `${sign}${integer}`;
}

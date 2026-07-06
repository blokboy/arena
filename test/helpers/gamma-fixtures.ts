import type { GammaEvent, GammaMarket } from "../../src/domain/markets";

export function binaryGammaEvent(): GammaEvent {
  return {
    id: "event-election-2028",
    title: "2028 Presidential Election",
    slug: "2028-presidential-election",
    volume: "1500000",
    markets: [
      {
        id: "market-democrat-win-2028",
        question: "Will a Democrat win the 2028 US presidential election?",
        slug: "democrat-win-2028",
        outcomes: ["Yes", "No"],
        outcomePrices: ["0.6300", "0.3700"],
        bestBid: "0.6200",
        bestAsk: "0.6400",
        lastTradePrice: "0.6300",
        active: true,
        closed: false,
        endDateIso: "2028-11-08T00:00:00.000Z",
        volume: "900000"
      }
    ]
  };
}

export function multiOutcomeGammaEvent(): GammaEvent {
  return {
    id: "event-world-cup",
    title: "World Cup Winner",
    slug: "world-cup-winner",
    volume: "2200000",
    markets: [
      {
        id: "market-world-cup-winner",
        question: "Who will win the World Cup?",
        slug: "world-cup-winner",
        outcomes: '["France","Brazil","Japan"]',
        outcomePrices: '["0.4500","0.3500","0.2000"]',
        bestBid: "0.3400",
        bestAsk: "0.3600",
        lastTradePrice: "0.3500",
        active: true,
        closed: false,
        endDate: "2026-07-19T20:00:00.000Z",
        volume: "1200000"
      }
    ]
  };
}

export function resolvedBinaryGammaMarket(): GammaMarket {
  return {
    id: "market-democrat-win-2028",
    question: "Will a Democrat win the 2028 US presidential election?",
    outcomes: ["Yes", "No"],
    outcomePrices: ["1", "0"],
    active: false,
    closed: true
  };
}

export function resolvedMultiOutcomeGammaMarket(): GammaMarket {
  return {
    id: "market-world-cup-winner",
    question: "Who will win the World Cup?",
    outcomes: ["France", "Brazil", "Japan"],
    outcomePrices: ["0", "1", "0"],
    active: false,
    closed: true
  };
}

export function voidedGammaMarket(): GammaMarket {
  return {
    id: "market-voided",
    question: "Will this market be voided?",
    outcomes: ["Yes", "No"],
    outcomePrices: ["0.5", "0.5"],
    active: false,
    closed: true
  };
}

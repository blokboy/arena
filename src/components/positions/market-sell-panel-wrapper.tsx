"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { MarketSellPanel, type SellState } from "@/components/positions/sell-panel";
import { calculateSellValue, getAvailableShares, groupPositions } from "@/domain/positions";

type PositionLotView = {
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
  exitPrice?: string;
  exitedAt?: string;
  availableShares?: string;
  currentBestBid?: string | null;
  currentBestAsk?: string | null;
  currentSellValue?: string | null;
  marketActive?: boolean;
  marketClosed?: boolean;
  lastSyncedAt?: string;
};

type PositionGroupView = {
  marketId: string;
  marketQuestion: string;
  outcomeIndex: number;
  outcomeLabel: string;
  status: PositionLotView["status"];
  lots: PositionLotView[];
  totalStake: string;
  totalShares: string;
  committedShares: string;
  availableShares: string;
  averageEntryPrice: string;
  currentSellValue?: string;
  realizedPoints?: string;
  bestBid?: string | null;
  marketClosed?: boolean;
};

type ListedPositionLot = PositionLotView & {
  availableShares: string;
  currentBestBid: string | null;
  currentBestAsk: string | null;
  currentSellValue: string | null;
  marketActive: boolean;
  marketClosed: boolean;
  lastSyncedAt: string;
};

type MarketSellPanelWrapperProps = {
  marketId: string;
  marketQuestion: string;
  bestBid: string | null;
  marketClosed: boolean;
  priceLastSyncedAt?: string;
};

export function MarketSellPanelWrapper({
  marketId,
  marketQuestion,
  bestBid,
  marketClosed,
  priceLastSyncedAt
}: MarketSellPanelWrapperProps) {
  const router = useRouter();
  const [positions, setPositions] = useState<ListedPositionLot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetch(`/api/positions?marketId=${encodeURIComponent(marketId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("POSITIONS_REQUEST_FAILED");
        const body = (await response.json()) as { positions: ListedPositionLot[] };
        return body.positions;
      })
      .then((data) => {
        if (!active) return;
        setPositions(data);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setPositions([]);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [marketId]);

  const openPositions = positions.filter(
    (lot) => lot.status === "OPEN" && lot.currentBestBid !== null
  );
  const openLotData: PositionLotView[] = openPositions.map((lot) => ({
    id: lot.id,
    marketId: lot.marketId,
    marketQuestion: lot.marketQuestion,
    outcomeIndex: lot.outcomeIndex,
    outcomeLabel: lot.outcomeLabel,
    status: lot.status,
    stake: lot.stake,
    shares: lot.shares,
    committedShares: lot.committedShares,
    entryPrice: lot.entryPrice,
    purchasedAt: lot.purchasedAt
  }));

  const groups = groupPositions(openLotData);

  const handleSellLot = useCallback(
    async (lotId: string) => {
      const response = await fetch(`/api/positions/${lotId}/sell`, { method: "POST" });
      const body = (await response.json()) as {
        position?: PositionLotView;
        proceeds?: string;
        balance?: number;
        error?: { code?: string };
      };

      if (!response.ok) {
        throw new Error(body?.error?.code ?? "SELL_FAILED");
      }

      const fresh = await fetch(`/api/positions?marketId=${encodeURIComponent(marketId)}`).then(
        (r) => r.json() as Promise<{ positions: ListedPositionLot[] }>
      );
      setPositions(fresh.positions);
      router.refresh();
    },
    [marketId, router]
  );

  const handleSellAll = useCallback(
    async (groupId: string) => {
      const group = groups.find((g) => `${g.marketId}:${g.outcomeIndex}:${g.status}` === groupId);
      if (!group) throw new Error("GROUP_NOT_FOUND");

      const response = await fetch("/api/positions/sell-all", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          marketId: group.marketId,
          outcomeIndex: group.outcomeIndex
        })
      });
      const body = (await response.json()) as {
        positions?: PositionLotView[];
        proceeds?: string;
        balance?: number;
        error?: { code?: string };
      };

      if (!response.ok) {
        throw new Error(body?.error?.code ?? "SELL_ALL_FAILED");
      }

      const fresh = await fetch(`/api/positions?marketId=${encodeURIComponent(marketId)}`).then(
        (r) => r.json() as Promise<{ positions: ListedPositionLot[] }>
      );
      setPositions(fresh.positions);
      router.refresh();
    },
    [marketId, groups, router]
  );

  function determineSellState(): SellState {
    if (loading) return { kind: "loading" };
    if (marketClosed) return { kind: "market-closed" };
    if (bestBid === null) return { kind: "price-unavailable" };

    const openGroup = groups.find((g) => g.status === "OPEN");
    if (!openGroup) return { kind: "no-position" };

    const hasAvailableShares = openGroup.availableShares !== "0";
    const hasLockedShares = openGroup.committedShares !== "0";

    if (!hasAvailableShares && hasLockedShares) return { kind: "all-locked" };
    if (!hasAvailableShares) return { kind: "no-position" };

    return { kind: "sellable" };
  }

  const groupsWithSellValues = groups.map((g) => {
    let currentSellValue: string | undefined;
    if (bestBid && g.availableShares !== "0") {
      try {
        currentSellValue = calculateSellValue({ shares: g.availableShares, bestBid });
      } catch {
        // leave undefined
      }
    }
    return { ...g, currentSellValue, bestBid, marketClosed };
  });

  const openGroup = groupsWithSellValues.find((g) => g.status === "OPEN") ?? null;
  const sellState = determineSellState();

  return (
    <MarketSellPanel
      marketId={marketId}
      marketQuestion={marketQuestion}
      outcomeIndex={openGroup?.outcomeIndex ?? 0}
      outcomeLabel={openGroup?.outcomeLabel ?? ""}
      bestBid={bestBid}
      marketClosed={marketClosed}
      priceLastSyncedAt={priceLastSyncedAt}
      group={openGroup}
      sellState={sellState}
      onSellLot={handleSellLot}
      onSellAll={handleSellAll}
      onOpenSellAllConfirm={() => {}}
    />
  );
}

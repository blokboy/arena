import { describe, expect, test } from "vitest";

import { normalizeGammaEvent } from "@/domain/markets";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { addFirstParlayLeg, createDraftParlay, getRegularParlayDetail } from "@/server/parlays";
import { runSettlementSweep, settleActiveParlayLeg } from "@/server/settlement";
import { buyPositionLot } from "@/server/positions";
import { userRepository } from "@/server/users";
import { binaryGammaEvent, resolvedBinaryGammaMarket } from "@test/helpers/gamma-fixtures";

async function seedCachedPoliticsEvent() {
  await marketCacheRepository.upsertCategoryEvents({
    category: "Politics",
    events: [
      normalizeGammaEvent(binaryGammaEvent(), {
        category: "Politics",
        lastSyncedAt: "2026-07-06T12:00:00.000Z"
      })
    ]
  });
}

async function seedSecondLaterMarket() {
  const event = binaryGammaEvent();
  event.id = "event-senate-2028";
  event.title = "2028 Senate Control";
  event.slug = "2028-senate-control";
  event.markets = [
    {
      ...event.markets![0]!,
      id: "market-senate-control-2028",
      question: "Will Democrats control the Senate after 2028?",
      slug: "senate-control-2028",
      endDateIso: "2028-12-01T00:00:00.000Z"
    }
  ];
  await marketCacheRepository.upsertCategoryEvents({
    category: "Politics",
    events: [
      normalizeGammaEvent(event, {
        category: "Politics",
        lastSyncedAt: "2026-07-06T12:00:00.000Z"
      })
    ]
  });
}

async function seedSingleLegParlay() {
  const user = await userRepository.createUser({ username: "mira", passwordHash: "hashed" });
  const { lot } = await buyPositionLot({
    user,
    marketId: "market-democrat-win-2028",
    outcomeIndex: 0,
    stake: "250",
    now: new Date("2026-07-06T13:00:00.000Z")
  });
  const draft = await createDraftParlay({
    name: "July ladder",
    creatorId: user.id,
    inviteUserIds: []
  });
  const leg = await addFirstParlayLeg({
    userId: user.id,
    parlayId: draft.id,
    marketId: "market-democrat-win-2028",
    outcomeIndex: 0,
    commitments: [{ positionId: lot.id, shares: lot.shares }],
    now: new Date("2026-07-06T13:00:00.000Z")
  });
  return { user, parlayId: draft.id, legId: leg.legId, positionId: lot.id };
}

describe("parlay leg settlement", () => {
  test("won final leg credits the backer's balance and marks the chain WON", async () => {
    await seedCachedPoliticsEvent();
    const { user, parlayId, legId } = await seedSingleLegParlay();

    const result = await settleActiveParlayLeg({
      legId,
      resolution: {
        status: "RESOLVED",
        winningOutcomeIndex: 0,
        winningOutcomeLabel: "Yes"
      }
    });

    expect(result.settledStakes).toBe(1);
    // 1000 starting - 250 debited at buy time + 390.625 payout (250 / 0.64 shares) credited at settlement.
    expect((await userRepository.findById(user.id))?.balance).toBe(1140.625);

    const leg = await prisma.parlayLeg.findUniqueOrThrow({
      where: { id: legId },
      include: { stakes: true }
    });
    expect(leg.status).toBe("WON");
    expect(leg.stakes[0]!.status).toBe("WON");
    expect(leg.stakes[0]!.payout.toString()).toBe("390.625");

    const parlay = await prisma.parlay.findUniqueOrThrow({ where: { id: parlayId } });
    expect(parlay.status).toBe("WON");
  });

  test("marks only the funding position committedSettled, not every uncommitted position in the table", async () => {
    await seedCachedPoliticsEvent();
    const { legId, positionId } = await seedSingleLegParlay();

    // An unrelated OPEN, never-committed position from a different user —
    // guards against an overly-broad update that flips every position
    // instead of just the ones this settlement actually sourced from.
    const bystander = await userRepository.createUser({ username: "bystander", passwordHash: "x" });
    const { lot: bystanderLot } = await buyPositionLot({
      user: bystander,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "5",
      now: new Date("2026-07-06T13:00:00.000Z")
    });

    const before = await prisma.position.findUniqueOrThrow({ where: { id: positionId } });
    expect(before.committedSettled).toBe(false);

    await settleActiveParlayLeg({
      legId,
      resolution: { status: "RESOLVED", winningOutcomeIndex: 0, winningOutcomeLabel: "Yes" }
    });

    const after = await prisma.position.findUniqueOrThrow({ where: { id: positionId } });
    expect(after.committedSettled).toBe(true);

    const bystanderAfter = await prisma.position.findUniqueOrThrow({
      where: { id: bystanderLot.id }
    });
    expect(bystanderAfter.committedSettled).toBe(false);
  });

  test("won non-final leg rolls value forward into the next leg at its fresh bestAsk instead of crediting balance", async () => {
    await seedCachedPoliticsEvent();
    await seedSecondLaterMarket();
    const { user, legId } = await seedSingleLegParlay();

    // Append is atomic with a stake (ADR-0001) — buy a fresh lot in the
    // second market and append the leg with that as the first commitment.
    const secondLot = await buyPositionLot({
      user,
      marketId: "market-senate-control-2028",
      outcomeIndex: 0,
      stake: "10",
      now: new Date("2026-07-06T13:05:00.000Z")
    });
    const nextLeg = await addFirstParlayLeg({
      userId: user.id,
      parlayId: (await prisma.parlayLeg.findUniqueOrThrow({ where: { id: legId } })).parlayId,
      marketId: "market-senate-control-2028",
      outcomeIndex: 0,
      commitments: [{ positionId: secondLot.lot.id, shares: secondLot.lot.shares }],
      now: new Date("2026-07-06T13:05:00.000Z")
    });

    const balanceBeforeSettlement = (await userRepository.findById(user.id))!.balance;

    const result = await settleActiveParlayLeg({
      legId,
      resolution: {
        status: "RESOLVED",
        winningOutcomeIndex: 0,
        winningOutcomeLabel: "Yes"
      }
    });

    expect(result.settledStakes).toBe(1);
    expect((await userRepository.findById(user.id))?.balance).toBe(balanceBeforeSettlement);

    const wonLeg = await prisma.parlayLeg.findUniqueOrThrow({
      where: { id: legId },
      include: { stakes: true }
    });
    expect(wonLeg.status).toBe("WON");
    expect(wonLeg.stakes[0]!.status).toBe("WON");
    expect(wonLeg.stakes[0]!.payout.toString()).toBe("0");

    const forwardedLeg = await prisma.parlayLeg.findUniqueOrThrow({
      where: { id: nextLeg.legId },
      include: { stakes: true }
    });
    expect(forwardedLeg.status).toBe("ACTIVE");
    const forwardedStake = forwardedLeg.stakes[0]!;
    expect(forwardedStake.userId).toBe(user.id);
    // 10 fresh principal + 390.625 rolled-forward shares-as-principal from
    // leg 1, all redeployed at leg 2's bestAsk of 0.64.
    expect(forwardedStake.amount.toString()).toBe("400.625");
    expect(forwardedStake.rolledForwardFromLegId).toBe(legId);
  });

  test("lost active leg forfeits its stake to HOUSE and cascades trailing pending legs", async () => {
    await seedCachedPoliticsEvent();
    await seedSecondLaterMarket();
    const { user, legId } = await seedSingleLegParlay();
    const parlayId = (await prisma.parlayLeg.findUniqueOrThrow({ where: { id: legId } })).parlayId;

    const secondLot = await buyPositionLot({
      user,
      marketId: "market-senate-control-2028",
      outcomeIndex: 0,
      stake: "10",
      now: new Date("2026-07-06T13:05:00.000Z")
    });
    const pendingLeg = await addFirstParlayLeg({
      userId: user.id,
      parlayId,
      marketId: "market-senate-control-2028",
      outcomeIndex: 0,
      commitments: [{ positionId: secondLot.lot.id, shares: secondLot.lot.shares }],
      now: new Date("2026-07-06T13:05:00.000Z")
    });

    const balanceBeforeSettlement = (await userRepository.findById(user.id))!.balance;

    const result = await settleActiveParlayLeg({
      legId,
      resolution: {
        status: "RESOLVED",
        winningOutcomeIndex: 1,
        winningOutcomeLabel: "No"
      }
    });

    expect(result.settledStakes).toBe(1);
    // Losing forfeits the active leg's stake, but nothing is credited to the
    // user directly — it all goes to HOUSE.
    expect((await userRepository.findById(user.id))?.balance).toBe(balanceBeforeSettlement);

    const lostLeg = await prisma.parlayLeg.findUniqueOrThrow({
      where: { id: legId },
      include: { stakes: true }
    });
    expect(lostLeg.status).toBe("LOST");
    expect(lostLeg.stakes[0]!.status).toBe("LOST");
    expect(lostLeg.stakes[0]!.amount.toString()).toBe("250");

    const cascadedLeg = await prisma.parlayLeg.findUniqueOrThrow({
      where: { id: pendingLeg.legId },
      include: { stakes: true }
    });
    expect(cascadedLeg.status).toBe("LOST");
    expect(cascadedLeg.stakes[0]!.status).toBe("LOST");
    expect(cascadedLeg.stakes[0]!.amount.toString()).toBe("10");

    const parlay = await prisma.parlay.findUniqueOrThrow({ where: { id: parlayId } });
    expect(parlay.status).toBe("LOST");

    const houseTransactions = await prisma.houseTransaction.findMany({
      orderBy: { amount: "desc" }
    });
    expect(houseTransactions).toHaveLength(2);
    expect(houseTransactions.map((t) => t.amount.toString())).toEqual(["250", "10"]);
    expect(houseTransactions.every((t) => t.reason === "PARLAY_LEG_LOSS")).toBe(true);
    expect(houseTransactions.every((t) => t.parlayId === parlayId)).toBe(true);
  });

  test("voided final leg refunds the original at-risk amount and marks the chain VOIDED", async () => {
    await seedCachedPoliticsEvent();
    const { user, parlayId, legId } = await seedSingleLegParlay();

    const result = await settleActiveParlayLeg({
      legId,
      resolution: { status: "VOIDED" }
    });

    expect(result.settledStakes).toBe(1);
    // 1000 starting - 250 debited at buy time + 250 flat refund (not the
    // 390.625 shares — a voided market refunds principal, not shares × 1).
    expect((await userRepository.findById(user.id))?.balance).toBe(1000);

    const leg = await prisma.parlayLeg.findUniqueOrThrow({
      where: { id: legId },
      include: { stakes: true }
    });
    expect(leg.status).toBe("VOIDED");
    expect(leg.stakes[0]!.status).toBe("VOIDED_REFUNDED");
    expect(leg.stakes[0]!.payout.toString()).toBe("250");

    const parlay = await prisma.parlay.findUniqueOrThrow({ where: { id: parlayId } });
    expect(parlay.status).toBe("VOIDED");
    expect(await prisma.houseTransaction.count()).toBe(0);
  });

  test("voided non-final leg passes its amount forward at zero return instead of killing the chain", async () => {
    await seedCachedPoliticsEvent();
    await seedSecondLaterMarket();
    const { user, legId } = await seedSingleLegParlay();

    const secondLot = await buyPositionLot({
      user,
      marketId: "market-senate-control-2028",
      outcomeIndex: 0,
      stake: "10",
      now: new Date("2026-07-06T13:05:00.000Z")
    });
    const nextLeg = await addFirstParlayLeg({
      userId: user.id,
      parlayId: (await prisma.parlayLeg.findUniqueOrThrow({ where: { id: legId } })).parlayId,
      marketId: "market-senate-control-2028",
      outcomeIndex: 0,
      commitments: [{ positionId: secondLot.lot.id, shares: secondLot.lot.shares }],
      now: new Date("2026-07-06T13:05:00.000Z")
    });

    const balanceBeforeSettlement = (await userRepository.findById(user.id))!.balance;

    const result = await settleActiveParlayLeg({
      legId,
      resolution: { status: "VOIDED" }
    });

    expect(result.settledStakes).toBe(1);
    expect((await userRepository.findById(user.id))?.balance).toBe(balanceBeforeSettlement);

    const voidedLeg = await prisma.parlayLeg.findUniqueOrThrow({
      where: { id: legId },
      include: { stakes: true }
    });
    expect(voidedLeg.status).toBe("VOIDED");
    expect(voidedLeg.stakes[0]!.status).toBe("VOIDED_REFUNDED");
    expect(voidedLeg.stakes[0]!.payout.toString()).toBe("0");

    const forwardedLeg = await prisma.parlayLeg.findUniqueOrThrow({
      where: { id: nextLeg.legId },
      include: { stakes: true }
    });
    expect(forwardedLeg.status).toBe("ACTIVE");
    const forwardedStake = forwardedLeg.stakes[0]!;
    // 10 fresh principal + 250 passed-through at zero return (the leg 1
    // stake's untouched `amount`, not its shares — this is a 0%-return
    // forward, unlike a won leg's shares-based rollforward).
    expect(forwardedStake.amount.toString()).toBe("260");
    expect(forwardedStake.rolledForwardFromLegId).toBe(legId);
    expect(await prisma.houseTransaction.count()).toBe(0);
  });
});

describe("parlay leg settlement via the cron sweep", () => {
  test("settles an active leg on a resolved market and is idempotent on a second run", async () => {
    await seedCachedPoliticsEvent();
    const { user, legId } = await seedSingleLegParlay();

    const gammaClient = {
      fetchEventsByTag: async () => [],
      fetchMarketById: async () => resolvedBinaryGammaMarket()
    };

    const first = await runSettlementSweep({
      now: new Date("2026-01-15T12:05:00.000Z"),
      gammaClient
    });

    expect(first.marketIds).toEqual(["market-democrat-win-2028"]);
    expect(first.settledParlayLegStakes).toBe(1);
    const balanceAfterFirstRun = (await userRepository.findById(user.id))!.balance;
    expect(balanceAfterFirstRun).toBe(1140.625);

    const leg = await prisma.parlayLeg.findUniqueOrThrow({ where: { id: legId } });
    expect(leg.status).toBe("WON");

    const second = await runSettlementSweep({
      now: new Date("2026-01-15T12:10:00.000Z"),
      gammaClient
    });

    // The leg is already terminal, so a second sweep must not re-settle it —
    // no double credit, no second HOUSE transfer.
    expect(second.settledParlayLegStakes).toBe(0);
    expect((await userRepository.findById(user.id))?.balance).toBe(balanceAfterFirstRun);
  });
});

describe("GET /api/parlays/:id exposes settlement fields", () => {
  test("stakes[] surfaces payout and both directions of the rollforward link", async () => {
    await seedCachedPoliticsEvent();
    await seedSecondLaterMarket();
    const { user, parlayId, legId } = await seedSingleLegParlay();

    const secondLot = await buyPositionLot({
      user,
      marketId: "market-senate-control-2028",
      outcomeIndex: 0,
      stake: "10",
      now: new Date("2026-07-06T13:05:00.000Z")
    });
    const nextLeg = await addFirstParlayLeg({
      userId: user.id,
      parlayId,
      marketId: "market-senate-control-2028",
      outcomeIndex: 0,
      commitments: [{ positionId: secondLot.lot.id, shares: secondLot.lot.shares }],
      now: new Date("2026-07-06T13:05:00.000Z")
    });

    await settleActiveParlayLeg({
      legId,
      resolution: { status: "RESOLVED", winningOutcomeIndex: 0, winningOutcomeLabel: "Yes" }
    });

    const detail = await getRegularParlayDetail(parlayId);
    const wonLeg = detail.legs.find((leg) => leg.id === legId)!;
    const forwardedLeg = detail.legs.find((leg) => leg.id === nextLeg.legId)!;

    expect(wonLeg.stakes[0]).toMatchObject({
      status: "WON",
      payout: "0",
      rolledForwardToLegId: nextLeg.legId
    });
    expect(forwardedLeg.stakes[0]).toMatchObject({
      status: "ACTIVE",
      payout: "0",
      rolledForwardFromLegId: legId
    });
  });
});

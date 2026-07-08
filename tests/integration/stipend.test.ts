import { describe, expect, test } from "vitest";

import { prisma } from "@/server/db";
import { grantDailyBankruptcyStipends } from "@/server/settlement";
import { userRepository } from "@/server/users";

describe("bankruptcy stipend job", () => {
  test("grants +200 once per UTC day to users at or below zero", async () => {
    const zero = await userRepository.createUser({ username: "zero", passwordHash: "hashed" });
    const negative = await userRepository.createUser({
      username: "negative",
      passwordHash: "hashed"
    });
    const positive = await userRepository.createUser({
      username: "positive",
      passwordHash: "hashed"
    });

    await prisma.user.update({ where: { id: zero.id }, data: { balance: 0 } });
    await prisma.user.update({ where: { id: negative.id }, data: { balance: -10 } });
    await prisma.user.update({ where: { id: positive.id }, data: { balance: 5 } });

    const first = await grantDailyBankruptcyStipends({
      now: new Date("2026-01-15T12:00:00.000Z")
    });
    const second = await grantDailyBankruptcyStipends({
      now: new Date("2026-01-15T18:00:00.000Z")
    });

    expect(first.dayKey).toBe("2026-01-15");
    expect(new Set(first.grantedUserIds)).toEqual(new Set([zero.id, negative.id]));
    expect(second.grantedUserIds).toEqual([]);
    expect((await userRepository.findById(zero.id))?.balance).toBe(200);
    expect((await userRepository.findById(negative.id))?.balance).toBe(190);
    expect((await userRepository.findById(positive.id))?.balance).toBe(5);
    expect(await prisma.bankruptcyStipendGrant.count()).toBe(2);
  });
});

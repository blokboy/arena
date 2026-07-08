import { describe, expect, test } from "vitest";

import { POST as createParlay } from "@/app/api/parlays/route";
import { GET as getRandomParlays } from "@/app/api/parlays/random/route";
import { prisma } from "@/server/db";
import { userRepository } from "@/server/users";
import { jsonRequest } from "@test/helpers/api";

function createRequest(body: unknown, userId?: string) {
  return jsonRequest(
    "http://arena.test/api/parlays",
    body,
    userId ? { "x-test-user-id": userId } : undefined
  );
}

describe("POST /api/parlays", () => {
  test("requires authentication", async () => {
    const response = await createParlay(createRequest({ name: "July ladder", inviteUserIds: [] }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: { code: "UNAUTHENTICATED" } });
  });

  test("creates a DRAFT parlay with a locked roster that always includes the creator", async () => {
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });
    const bob = await userRepository.createUser({ username: "bob", passwordHash: "hashed" });

    const response = await createParlay(
      createRequest({ name: "July ladder", inviteUserIds: [bob.id] }, alice.id)
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      parlay: { id: string; name: string; status: string; memberIds: string[] };
    };
    expect(body.parlay.name).toBe("July ladder");
    expect(body.parlay.status).toBe("DRAFT");
    expect(body.parlay.memberIds.sort()).toEqual([alice.id, bob.id].sort());

    const stored = await prisma.parlay.findUnique({ where: { id: body.parlay.id } });
    expect(stored?.status).toBe("DRAFT");
  });

  test("rejects an unparseable body", async () => {
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });

    const response = await createParlay(
      new Request("http://arena.test/api/parlays", {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user-id": alice.id },
        body: "not json"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: { code: "INVALID_BODY" } });
  });

  test.each(["", "   ", undefined, 42])("rejects a missing or blank name (%j)", async (name) => {
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });

    const response = await createParlay(createRequest({ name, inviteUserIds: [] }, alice.id));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "PARLAY_NAME_REQUIRED" }
    });
    expect(await prisma.parlay.count()).toBe(0);
  });

  test("rejects an invitee id that isn't a real user, persisting nothing", async () => {
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });

    const response = await createParlay(
      createRequest({ name: "Bad invite", inviteUserIds: ["not-a-real-user-id"] }, alice.id)
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: { code: "INVITEE_NOT_FOUND" } });
    expect(await prisma.parlay.count()).toBe(0);
  });

  test("a freshly created DRAFT parlay never appears in random discovery", async () => {
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });

    const createResponse = await createParlay(
      createRequest({ name: "Hidden draft", inviteUserIds: [] }, alice.id)
    );
    const { parlay } = (await createResponse.json()) as { parlay: { id: string } };

    const randomResponse = await getRandomParlays(
      new Request("http://arena.test/api/parlays/random?limit=50", {
        headers: { "x-test-user-id": alice.id }
      })
    );
    const { parlays } = (await randomResponse.json()) as { parlays: Array<{ id: string }> };

    expect(parlays.map((p) => p.id)).not.toContain(parlay.id);
  });
});

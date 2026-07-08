import { PrismaClient } from "@prisma/client";

const globalMemory = globalThis as typeof globalThis & {
  __arenaPrisma?: PrismaClient;
};

export const prisma = (globalMemory.__arenaPrisma ??= new PrismaClient());

// Every vitest project runs under NODE_ENV=test, so that alone can't
// distinguish "unit/components — use fast in-memory doubles" from
// "integration/api — must hit real Postgres numeric semantics, never
// SQLite/memory" (see docker-compose.test.yml). vitest.workspace.mts sets
// USE_TEST_DATABASE=true only for the latter two projects.
export function shouldUseRealDatabase(): boolean {
  return process.env.NODE_ENV !== "test" || process.env.USE_TEST_DATABASE === "true";
}

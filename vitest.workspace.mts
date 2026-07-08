import { defineWorkspace } from "vitest/config";

import { testAlias } from "./vitest.config.mts";

export default defineWorkspace([
  {
    test: {
      name: "unit",
      environment: "node",
      include: ["tests/unit/**/*.test.ts"],
      setupFiles: ["test/setup/unit.ts"],
      alias: testAlias
    }
  },
  {
    test: {
      name: "integration",
      environment: "node",
      include: ["tests/integration/**/*.test.ts"],
      setupFiles: ["test/setup/integration.ts"],
      alias: testAlias,
      // Real Postgres-backed repos (see src/server/db.ts's
      // shouldUseRealDatabase) — concurrent test files sharing one live DB
      // would race on the blanket clear-between-tests pattern, so these
      // tiers run serially rather than in parallel worker threads/processes.
      // fileParallelism alone wasn't sufficient to observably prevent
      // cross-file interleaving here — force a single fork/thread instead.
      fileParallelism: false,
      poolOptions: {
        forks: { singleFork: true },
        threads: { singleThread: true }
      },
      env: {
        USE_TEST_DATABASE: "true",
        // docker-compose.test.yml maps its throwaway Postgres to host port
        // 5433 specifically so it never collides with docker-compose.yml's
        // persistent dev Postgres on 5432 (see that file's header comment).
        // CI sets its own DATABASE_URL (port 5432, no local-dev collision
        // risk on an ephemeral runner) via job-level env, which process.env
        // already carries by the time this config is evaluated — the `??`
        // only supplies the local-dev default.
        DATABASE_URL:
          process.env.DATABASE_URL ?? "postgresql://arena:arena@localhost:5433/arena_test"
      }
    }
  },
  {
    test: {
      name: "api",
      environment: "node",
      include: ["tests/api/**/*.test.ts"],
      setupFiles: ["test/setup/api.ts"],
      alias: testAlias,
      fileParallelism: false,
      poolOptions: {
        forks: { singleFork: true },
        threads: { singleThread: true }
      },
      env: {
        USE_TEST_DATABASE: "true",
        DATABASE_URL:
          process.env.DATABASE_URL ?? "postgresql://arena:arena@localhost:5433/arena_test",
        AUTH_SECRET: "test-auth-secret"
      }
    }
  },
  {
    test: {
      name: "components",
      environment: "jsdom",
      include: ["tests/components/**/*.test.tsx"],
      setupFiles: ["test/setup/components.ts"],
      alias: testAlias
    }
  }
]);

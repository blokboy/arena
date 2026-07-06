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
      alias: testAlias
    }
  },
  {
    test: {
      name: "api",
      environment: "node",
      include: ["tests/api/**/*.test.ts"],
      setupFiles: ["test/setup/api.ts"],
      alias: testAlias
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

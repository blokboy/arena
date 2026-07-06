import path from "node:path";
import { defineConfig } from "vitest/config";

export const testAlias = {
  "@": path.resolve(__dirname, "src"),
  "@test": path.resolve(__dirname, "test")
};

export default defineConfig({
  esbuild: {
    jsx: "automatic"
  },
  test: {
    alias: testAlias
  }
});

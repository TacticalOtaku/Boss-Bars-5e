import { defineConfig } from "vitest/config";

// Node by default, so core/ tests run without a DOM; DOM tests opt in with `// @vitest-environment happy-dom`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
    unstubGlobals: true,
  },
});

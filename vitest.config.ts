import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/**/*.test.ts", "server/**/*.test.ts", "mcp/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});

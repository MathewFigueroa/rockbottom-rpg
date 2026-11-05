import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure", screenshot: "only-on-failure", video: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } } }],
  webServer: [
    { command: "NODE_ENV=development PORT=3000 pnpm --filter @rockbottom/server dev", url: "http://localhost:3000/health", reuseExistingServer: true, timeout: 60_000 },
    { command: "pnpm --filter @rockbottom/client dev", url: "http://localhost:5173", reuseExistingServer: true, timeout: 60_000 },
    { command: "pnpm --filter @rockbottom/admin dev", url: "http://localhost:5174/admin/", reuseExistingServer: true, timeout: 60_000 },
    { command: "MCP_TRANSPORT=sse MCP_PORT=3001 pnpm --filter @rockbottom/mcp dev", url: "http://localhost:3001/health", reuseExistingServer: true, timeout: 60_000 }
  ]
});

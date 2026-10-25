import { defineConfig, devices } from '@playwright/test';

// UI tests run against the Vite dev server with src/firebase.ts and src/session.ts swapped for
// in-memory fakes (tests/fakes), so they never touch the real database.
// tests/e2e-live.spec.ts runs against the deployed site when E2E_URL is set.
export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5179', ...devices['Desktop Chrome'] },
  webServer: { command: 'npx vite --port 5179 --strictPort', url: 'http://localhost:5179', reuseExistingServer: true },
});

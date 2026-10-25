import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4174', ...devices['Desktop Chrome'] },
  webServer: { command: 'npx vite preview --port 4174 --strictPort', url: 'http://localhost:4174', reuseExistingServer: true },
});

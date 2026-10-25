import { defineConfig, devices } from '@playwright/test';

const live = process.env.BASE_URL;
export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  reporter: [['list']],
  use: { baseURL: live ?? 'http://localhost:4174', ...devices['Desktop Chrome'] },
  webServer: live ? undefined : { command: 'npx vite preview --port 4174 --strictPort', url: 'http://localhost:4174', reuseExistingServer: true },
});

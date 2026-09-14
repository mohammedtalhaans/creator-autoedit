import { defineConfig, devices } from '@playwright/test';

const base = process.env.BASE_PATH || '/creator-autoedit/';

export default defineConfig({
  testDir: './e2e',
  testMatch: /prompt-model\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  timeout: 15 * 60_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/prompt-model',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/prompt-model' }]],
  use: { baseURL: `http://127.0.0.1:4310${base}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --config vite.prompt-model.config.ts --port 4310 --strictPort',
    url: `http://127.0.0.1:4310${base}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { BASE_PATH: base, ONNXRUNTIME_NODE_INSTALL: 'skip' },
  },
});

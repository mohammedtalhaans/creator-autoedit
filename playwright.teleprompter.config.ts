import { defineConfig, devices } from '@playwright/test';

const base = process.env.BASE_PATH || '/creator-autoedit/';
const host = process.env.TELEPROMPTER_HOST || '127.0.0.1';
const port = Number(process.env.TELEPROMPTER_PORT || 4300);
const origin = `http://${host}:${port}`;
const built = process.env.TELEPROMPTER_BUILT === '1';

export default defineConfig({
  testDir: './teleprompter-e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/teleprompter',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/teleprompter' }]],
  use: {
    baseURL: `${origin}${base}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    permissions: ['camera', 'microphone'],
    launchOptions: {
      // Controlled media is limited to this test project. The production
      // browser configuration never grants or fakes user hardware.
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: built ? 'node scripts/serve-built.mjs' : `npx vite --host 0.0.0.0 --port ${port} --strictPort`,
    url: `${origin}${base}`,
    reuseExistingServer: !built,
    timeout: 120_000,
    env: { BASE_PATH: base, PORT: String(port) },
  },
});

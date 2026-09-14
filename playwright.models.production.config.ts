import { defineConfig, devices } from '@playwright/test';

const base = process.env.BASE_PATH || '/creator-autoedit/';

export default defineConfig({
    testDir: './model-e2e',
    testMatch: /production\.spec\.ts/,
    workers: 1,
    fullyParallel: false,
    timeout: 15 * 60_000,
    outputDir: 'test-results/models-production',
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/models-production' }]],
    use: { baseURL: `http://127.0.0.1:4174${base}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: { command: 'node scripts/serve-built.mjs', url: `http://127.0.0.1:4174${base}`, reuseExistingServer: false, timeout: 120_000, env: { BASE_PATH: base } },
});


import { defineConfig, devices } from '@playwright/test';
const base = process.env.BASE_PATH || '/creator-autoedit/';
export default defineConfig({
    testDir: './production-e2e', workers: 1, fullyParallel: false, timeout: 180_000,
    expect: { timeout: 20_000 }, outputDir: 'test-results/production',
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/production' }]],
    use: { baseURL: `http://127.0.0.1:4174${base}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }, { name: 'webkit', use: { ...devices['Desktop Safari'] } }],
    webServer: { command: 'node scripts/serve-built.mjs', url: `http://127.0.0.1:4174${base}`, reuseExistingServer: false, env: { BASE_PATH: base } },
});

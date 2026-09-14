import { defineConfig, devices } from '@playwright/test';
const base = process.env.BASE_PATH || '/creator-autoedit/';
export default defineConfig({
    testDir: './model-e2e', workers: 1, fullyParallel: false, timeout: 15 * 60_000,
    outputDir: 'test-results/models', reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/models' }]],
    use: { baseURL: `http://127.0.0.1:4173${base}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }, { name: 'webkit', use: { ...devices['Desktop Safari'] } }],
    webServer: { command: 'npm run dev -- --port 4173 --strictPort', url: `http://127.0.0.1:4173${base}`, reuseExistingServer: false, timeout: 120_000, env: { BASE_PATH: base } },
});

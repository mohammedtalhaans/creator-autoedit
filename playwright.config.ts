import { defineConfig, devices } from '@playwright/test';
const base = process.env.BASE_PATH || '/creator-autoedit/';
export default defineConfig({
    testDir: './e2e', fullyParallel: false, workers: 1, timeout: 180_000,
    expect: { timeout: 15_000 }, reporter: [['list'], ['html', { open: 'never' }]],
    use: { baseURL: `http://127.0.0.1:4173${base}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }, { name: 'webkit', use: { ...devices['Desktop Safari'] } }],
    webServer: { command: 'npm run dev -- --port 4173 --strictPort', url: `http://127.0.0.1:4173${base}`, reuseExistingServer: !process.env.CI, timeout: 120_000, env: { BASE_PATH: base } }
});

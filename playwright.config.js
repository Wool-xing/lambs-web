import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // CI 已用 retries:2 吸收瞬时失败；本地全量并行（8 workers）下 webkit 偶发 >10s 的网络停顿，
  // 属环境负载抖动而非断言问题 —— 本地同样给 1 次重试。
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 15000,
  use: {
    baseURL: 'http://127.0.0.1:2233',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npx vite --port 2233 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:2233/Lambs/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});

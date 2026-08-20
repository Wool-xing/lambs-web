// H-dimension: true 2G against the PRODUCTION bundle (vite preview), not the
// dev server. The dev-server variant ships hundreds of unbundled modules and
// is not a 2G-shaped payload — this closes that gap (QA round 5).
import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { MOCK_TOKEN } from './helpers.js';

let server;
let base;

test.beforeAll(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '2236', '--strictPort', '--host', '127.0.0.1'], { shell: true, stdio: 'ignore' });
  // wait for the preview server
  const wait = async () => {
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch('http://127.0.0.1:2236/Lambs/');
        if (res.ok) return;
      } catch { /* not up yet */ }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('preview server did not start');
  };
  await wait();
  base = 'http://127.0.0.1:2236';
});

test.afterAll(() => {
  if (server) server.kill();
});

test('2G 生产包：应用可用且数据最终到达', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP network emulation is chromium-only');
  test.setTimeout(90000);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 300, downloadThroughput: 250 * 1024 / 8, uploadThroughput: 50 * 1024 / 8,
  });

  await page.route('**/Lambs/api/**', (route) => {
    const url = route.request().url();
    const json = (d) => route.fulfill({ json: { success: true, data: d } });
    if (url.includes('/auth/me')) return json({ id: 'u_test001', name: 'admin', email: 'admin@lambs.local', role: 'super_admin', status: 'active', project_access: ['all'] });
    if (url.includes('/projects')) return json({ projects: [], stats: null, nodes: [] });
    if (url.includes('/notifications')) return json({ notifications: [], unread_count: 0, total: 0, page: 1, page_size: 20 });
    if (url.includes('/system/health')) return json({ hostname: 'test', cpu_percent: 1 });
    if (url.includes('/settings/config')) return json({ jwt_secret: '', admin_email: 'a@b.c', port: 3602, refresh_interval: 30 });
    return json({});
  });

  await page.goto(base + '/Lambs/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate((t) => localStorage.setItem('lambs_token', t), MOCK_TOKEN);
  await page.goto(base + '/Lambs/dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 });

  await expect(page.locator('main')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('所有项目').first()).toBeVisible({ timeout: 60000 });
});

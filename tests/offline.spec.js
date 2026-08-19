// H-dimension (QA round 3): offline detection must surface the banner and
// recover without a reload. First weak-network test in the suite.
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers.js';

test('断网显示横幅，恢复后自动消失', async ({ page, context }) => {
  await loginAsAdmin(page, '/dashboard');

  // Go offline — the app listens for the browser offline event.
  await context.setOffline(true);
  await expect(page.getByText('网络连接已断开')).toBeVisible();

  // Back online — banner clears by itself.
  await context.setOffline(false);
  await expect(page.getByText('网络连接已断开')).toBeHidden();
});

test('断网期间 UI 仍可交互（无白屏崩溃）', async ({ page, context }) => {
  await loginAsAdmin(page, '/dashboard');

  await context.setOffline(true);
  await expect(page.getByText('网络连接已断开')).toBeVisible();

  // Core chrome still renders and responds.
  await expect(page.getByText('所有项目')).toBeVisible();
  await page.getByPlaceholder('搜索项目').first().fill('QA');
});

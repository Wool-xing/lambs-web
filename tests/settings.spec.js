import { test, expect } from '@playwright/test';
import { loginAsAdmin, MOCK_AUDIT_LOGS, MOCK_DATASOURCES } from './helpers.js';

test.describe('系统设置页面', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/settings');
  });

  test('显示全局配置区块', async ({ page }) => {
    await expect(page.locator('.card-title').filter({ hasText: '全局配置' })).toBeVisible();
    // Fields should be editable (not readonly)
    const jwtInput = page.locator('.field').filter({ hasText: 'JWT' }).locator('input');
    await expect(jwtInput).toBeVisible();
    await expect(jwtInput).not.toHaveAttribute('readonly');
    await expect(page.locator('button:has-text("保存配置")')).toBeVisible();
  });

  test('显示数据管理区块 + 导出按钮', async ({ page }) => {
    await expect(page.locator('.card-title').filter({ hasText: '数据管理' })).toBeVisible();
    await expect(page.locator('button:has-text("导出项目列表")')).toBeVisible();
    await expect(page.locator('button:has-text("导出系统用户")')).toBeVisible();
  });

  test('点击导出项目列表 → 下载 CSV', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    await page.click('button:has-text("导出项目列表")');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.csv');
  });

  test('显示操作日志区块', async ({ page }) => {
    await expect(page.locator('.card-title').filter({ hasText: '操作日志' })).toBeVisible();
    // Should show at least one log entry (use exact text to avoid matching sidebar "退出登录")
    await expect(page.getByText('成功登录系统')).toBeVisible();
  });

  test('显示外观与主题区块', async ({ page }) => {
    await expect(page.locator('.card-title').filter({ hasText: '外观与主题' })).toBeVisible();
    // Theme cards should be visible
    await expect(page.locator('.theme-card').first()).toBeVisible();
  });

  test('点击主题卡片 → 切换主题', async ({ page }) => {
    const themeCards = page.locator('.theme-card');
    const count = await themeCards.count();
    if (count > 1) {
      await themeCards.nth(1).click();
      // Body should have theme applied
      await expect(page.locator('body')).not.toHaveAttribute('data-theme', 'dark-default');
    }
  });

  test('显示数据源管理区块', async ({ page }) => {
    await expect(page.locator('.card-title').filter({ hasText: '数据源管理' })).toBeVisible();
    // Table should show data sources
    const rows = page.locator('.tbl-row').filter({ hasNot: page.locator('.head') }).first();
    await expect(rows).toBeVisible();
  });

  test('统一保存栏：SMTP 改动走底部按钮一次 PUT', async ({ page }) => {
    let putBody = null;
    await page.route('**/api/settings/config', async (route) => {
      if (route.request().method() === 'PUT') {
        putBody = route.request().postDataJSON();
        await route.fulfill({ json: { success: true, data: {} } });
      } else {
        await route.fulfill({ json: { success: true, data: { jwt_secret: 'k', admin_email: 'a@b.c', port: 3602, refresh_interval: 30, smtp_host: '', smtp_port: '587', smtp_from: '', smtp_user: '', smtp_password: '' } } });
      }
    });
    const bar = page.locator('.settings-save-bar');
    await expect(bar).toBeVisible();
    await expect(bar.locator('button:has-text("保存配置")')).toBeVisible();
    // Edit an SMTP field — the single bar button must persist it
    const smtpHost = page.locator('.field').filter({ hasText: 'SMTP 服务器' }).locator('input');
    await smtpHost.fill('smtp.example.com');
    await expect(bar.locator('text=有未保存的更改')).toBeVisible();
    await bar.locator('button:has-text("保存配置")').click();
    await expect.poll(() => putBody).not.toBeNull();
    expect(putBody.smtp_host).toBe('smtp.example.com');
    // Saved → dirty hint clears
    await expect(bar.locator('text=有未保存的更改')).not.toBeVisible();
  });
});

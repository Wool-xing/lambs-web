import { test, expect } from '@playwright/test';
import { loginAsAdmin, MOCK_NOTIFICATIONS } from './helpers.js';

test.describe('通知中心页面', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/notifications');
  });

  test('显示通知列表', async ({ page }) => {
    await expect(page.locator('.card-title')).toContainText('通知中心');
    const items = page.locator('.notif-item');
    await expect(items).toHaveCount(MOCK_NOTIFICATIONS.length);
  });

  test('通知显示标题和内容', async ({ page }) => {
    const firstItem = page.locator('.notif-item').first();
    await expect(firstItem.locator('.title')).toContainText('QA通关');
    await expect(firstItem.locator('.content')).toContainText('健康检查');
  });

  test('未读通知有 unread 样式', async ({ page }) => {
    // First notification is unread
    const unreadItems = page.locator('.notif-item.unread');
    expect(await unreadItems.count()).toBeGreaterThan(0);
  });

  test('类型筛选：告警 → 信息 → 成功 → 全部', async ({ page }) => {
    const chips = page.locator('.f-chip');

    await chips.filter({ hasText: '告警' }).click();
    await expect(chips.filter({ hasText: '告警' })).toHaveClass(/active/);

    await chips.filter({ hasText: '信息' }).click();
    await expect(chips.filter({ hasText: '信息' })).toHaveClass(/active/);

    await chips.filter({ hasText: '成功' }).click();
    await expect(chips.filter({ hasText: '成功' })).toHaveClass(/active/);

    await chips.filter({ hasText: '全部' }).click();
    await expect(chips.filter({ hasText: '全部' })).toHaveClass(/active/);
  });

  test('全部已读按钮存在', async ({ page }) => {
    const btn = page.locator('button:has-text("全部已读")');
    await expect(btn).toBeVisible();
    await btn.click();
  });

  test('点击未读通知标记已读按钮', async ({ page }) => {
    // Find unread notification's check button
    const unreadNotif = page.locator('.notif-item.unread').first();
    const markBtn = unreadNotif.locator('button:has-text("")').first();
    if (await markBtn.isVisible()) {
      await markBtn.click();
    }
  });

  test('点击通知 → 跳转关联项目', async ({ page }) => {
    // The first notification has project_id
    await page.locator('.notif-item').first().click();
    await page.waitForURL('**/project/**', { timeout: 5000 });
    expect(page.url()).toMatch(/project\/qa-tools-hub/);
  });

  test('删除通知 → dismiss 按钮点击', async ({ page }) => {
    const dismissBtn = page.locator('.notif-item').first().locator('.notif-actions button').last();
    await dismissBtn.click();
  });
});

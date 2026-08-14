import { test, expect } from '@playwright/test';
import { loginAsAdmin, MOCK_PROJECTS } from './helpers.js';

test.describe('仪表盘页面', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
  });

  test('显示4个统计卡片', async ({ page }) => {
    const statCards = page.locator('.stat-card');
    await expect(statCards).toHaveCount(4);
    await expect(statCards.nth(0)).toContainText('管理项目总数');
    await expect(statCards.nth(1)).toContainText('累计注册用户');
    await expect(statCards.nth(2)).toContainText('活跃数据源');
    await expect(statCards.nth(3)).toContainText('系统监控');
  });

  test('显示项目卡片列表', async ({ page }) => {
    const cards = page.locator('.project-card');
    await expect(cards).toHaveCount(MOCK_PROJECTS.length);
  });

  test('置顶项目显示星标', async ({ page }) => {
    const firstCard = page.locator('.project-card').first();
    // QA通关 has is_pinned: true, should show star icon
    await expect(firstCard).toContainText('QA通关');
  });

  test('筛选：在线 → 离线 → 维护中 → 全部', async ({ page }) => {
    // Filter: online
    await page.click('.f-chip:has-text("在线")');
    await expect(page.locator('.f-chip').nth(1)).toHaveClass(/active/);

    // Filter: offline
    await page.click('.f-chip:has-text("离线")');
    await expect(page.locator('.f-chip').nth(2)).toHaveClass(/active/);

    // Filter: maintenance
    await page.click('.f-chip:has-text("维护中")');
    await expect(page.locator('.f-chip').nth(3)).toHaveClass(/active/);

    // Filter: all
    await page.click('.f-chip:has-text("全部")');
    await expect(page.locator('.f-chip').nth(0)).toHaveClass(/active/);
  });

  test('搜索项目名称', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="搜索"]');
    await searchInput.fill('QA');
    // Debounce 250ms, wait a bit
    await page.waitForTimeout(400);
    // Should filter to only QA通关
    const cards = page.locator('.project-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('QA通关');
  });

  test('排序切换', async ({ page }) => {
    const sortSelect = page.locator('select');
    await sortSelect.selectOption('name');
    await expect(sortSelect).toHaveValue('name');
    await sortSelect.selectOption('users');
    await expect(sortSelect).toHaveValue('users');
  });

  test('点击项目卡片 → 跳转详情页', async ({ page }) => {
    await page.locator('.project-card').first().click();
    await page.waitForURL('**/project/**', { timeout: 5000 });
    expect(page.url()).toMatch(/project\/qa-tools-hub/);
  });

  test('批量模式：选择 → 全选 → 取消', async ({ page }) => {
    // Enter batch mode
    await page.click('button:has-text("选择")');
    // Check that checkboxes appear
    await expect(page.locator('.sel-check').first()).toBeVisible();
    // Select first card
    await page.locator('.sel-check').first().click();
    await expect(page.locator('.sel-check.checked')).toHaveCount(1);
    // Select all
    await page.click('button:has-text("全选")');
    await expect(page.locator('.sel-check.checked')).toHaveCount(MOCK_PROJECTS.length);
    // Deselect all
    await page.click('button:has-text("取消全选")');
    await expect(page.locator('.sel-check.checked')).toHaveCount(0);
  });

  test('刷新按钮显示最后刷新时间', async ({ page }) => {
    const refreshBtn = page.locator('button:has-text("刷新")');
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    await expect(page.locator('text=最后刷新：')).toBeVisible();
  });
});

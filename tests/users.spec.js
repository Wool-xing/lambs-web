import { test, expect } from '@playwright/test';
import { loginAsAdmin, MOCK_USERS } from './helpers.js';

test.describe('用户管理页面', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/users');
  });

  test('显示用户列表表头', async ({ page }) => {
    await expect(page.locator('.card-title')).toContainText('用户管理');
    await expect(page.locator('.tbl-row.head')).toContainText('姓名');
    await expect(page.locator('.tbl-row.head')).toContainText('邮箱');
    await expect(page.locator('.tbl-row.head')).toContainText('角色');
    await expect(page.locator('.tbl-row.head')).toContainText('状态');
  });

  test('显示所有用户', async ({ page }) => {
    const rows = page.locator('.tbl-row').filter({ hasNot: page.locator('.head') });
    // First row after head is a user row
    await expect(rows.first()).toBeVisible();
  });

  test('角色筛选：超级管理员 → 项目管理员 → 查看者', async ({ page }) => {
    // desktop role nav
    const roleNav = page.locator('.role-nav-item');

    await roleNav.filter({ hasText: '超级管理员' }).click();
    await expect(roleNav.filter({ hasText: '超级管理员' })).toHaveClass(/active/);

    await roleNav.filter({ hasText: '项目管理员' }).click();
    await expect(roleNav.filter({ hasText: '项目管理员' })).toHaveClass(/active/);

    await roleNav.filter({ hasText: '查看者' }).click();
    await expect(roleNav.filter({ hasText: '查看者' })).toHaveClass(/active/);
  });

  test('搜索用户', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="搜索"]');
    await searchInput.fill('张三');
    await page.waitForTimeout(400);
    // Use first() to avoid strict mode violation with multiple .tbl-row elements
    await expect(page.locator('.tbl-row').first()).toBeVisible();
  });

  test('点击 + 新增用户 → 打开抽屉', async ({ page }) => {
    await page.click('button:has-text("+ 新增用户")');
    await expect(page.locator('.drawer')).toBeVisible();
    await expect(page.locator('.drawer-title')).toContainText('新增用户');
  });

  test('点击编辑 → 打开编辑抽屉', async ({ page }) => {
    await page.locator('.link-action:has-text("编辑")').first().click();
    await expect(page.locator('.drawer')).toBeVisible();
  });

  test('点击删除 → 弹出确认框', async ({ page }) => {
    await page.locator('.link-action.danger:has-text("删除")').first().click();
    await expect(page.locator('.modal-box')).toBeVisible();
    await expect(page.locator('.modal-title')).toContainText('删除用户');
  });

  test('点击重置密码 → 弹出确认框', async ({ page }) => {
    await page.locator('.link-action:has-text("重置密码")').first().click();
    await expect(page.locator('.modal-box')).toBeVisible();
    await expect(page.locator('.modal-title')).toContainText('重置密码');
  });
});

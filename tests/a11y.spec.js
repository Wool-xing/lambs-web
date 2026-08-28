import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers.js';

// 设计评审 HIGH/WCAG 项回归：
// - 登录页两个链接（忘记密码？/注册新账号）必须可 Tab 聚焦、Enter 触发
// - 项目详情 4 个 tab：role=tablist/tab + 方向键切换 + Enter 激活
// - 通知角标对比度 ≥ 4.5:1（记录实际颜色组合并计算）

const relLum = (rgbStr) => {
  const [r, g, b] = rgbStr.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => v / 255);
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (fg, bg) => {
  const [l1, l2] = [relLum(fg), relLum(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
};

test.describe('登录页键盘可达', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/Lambs/', { waitUntil: 'domcontentloaded' });
  });

  test('Tab 从登录按钮依次聚焦两个链接', async ({ page }) => {
    await page.getByRole('button', { name: /登\s*录/ }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: '忘记密码？' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: '注册新账号' })).toBeFocused();
  });

  test('忘记密码？：Enter 打开重置弹窗', async ({ page }) => {
    await page.getByRole('button', { name: '忘记密码？' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('重置密码', { exact: true })).toBeVisible();
  });

  test('注册新账号：Enter 打开注册弹窗', async ({ page }) => {
    await page.getByRole('button', { name: '注册新账号' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('注册后默认拥有查看者权限')).toBeVisible();
  });
});

test.describe('项目详情 tabs 键盘', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.locator('.project-card').first().click();
    await page.waitForURL('**/project/**');
  });

  test('4 个 tab 可聚焦，方向键切换 + Enter 激活', async ({ page }) => {
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(4);

    // 罗盘 tabindex：选中项 0，其余 -1
    await expect(tabs.nth(0)).toHaveAttribute('tabindex', '0');
    await expect(tabs.nth(1)).toHaveAttribute('tabindex', '-1');

    await tabs.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('已分配成员')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(2)).toBeFocused();
    await expect(page.getByText('数据库备份')).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(tabs.nth(2)).toBeFocused();
    await expect(page.getByText('数据库备份')).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(page.getByText('已分配成员')).toBeVisible();
  });
});

test.describe('侧栏导航键盘', () => {
  test('nav-item 可聚焦且 Enter 跳转', async ({ page }) => {
    await loginAsAdmin(page);
    const nav = page.locator('.nav-item', { hasText: '通知中心' });
    await nav.focus();
    await expect(nav).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/notifications$/);
  });
});

test.describe('通知角标对比度', () => {
  test('白字 on 深红底 ≥ 4.5:1', async ({ page }) => {
    await loginAsAdmin(page);
    const badge = page.locator('.topbar-btn .badge');
    await expect(badge).toBeVisible();
    const fg = await badge.evaluate(el => getComputedStyle(el).color);
    const bg = await badge.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(fg).toBe('rgb(255, 255, 255)');
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    // 记录实际组合供复查
    console.log(`badge: fg=${fg} bg=${bg} ratio=${contrast(fg, bg).toFixed(2)}:1`);
  });
});

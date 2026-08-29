import { test, expect } from '@playwright/test';
import { loginAsAdmin, MOCK_NOTIFICATIONS } from './helpers.js';

// J 组缺口：全局框架 — 修改密码 / 导航 / 铃铛徽标 / 系统日志组件 /
// 错误边界 / 抽屉关闭 / 成功 toast

const expectToast = (page, text) => expect(page.locator('.toast').filter({ hasText: text })).toBeVisible();
const HEX64 = /^[0-9a-f]{64}$/;

test.describe('侧边栏 修改密码', () => {
  test('校验：空表单 / 过短 / 两次不一致', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    await page.locator('.sidebar-footer').getByText('修改密码').click();
    await page.locator('.modal-box button:has-text("确认修改")').click();
    await expectToast(page, '请填写完整');

    await page.getByPlaceholder('输入原密码').fill('old123');
    await page.getByPlaceholder('至少6位新密码').fill('123');
    await page.locator('.modal-box button:has-text("确认修改")').click();
    await expectToast(page, '新密码至少6位');

    await page.getByPlaceholder('至少6位新密码').fill('new123');
    await page.getByPlaceholder('再次输入新密码').fill('different');
    await page.locator('.modal-box button:has-text("确认修改")').click();
    await expectToast(page, '两次密码不一致');
  });

  test('成功修改 → PUT 密码均哈希 + 弹窗关闭', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    let putBody = null;
    await page.route('**/api/auth/me/password', (route) => {
      if (route.request().method() === 'PUT') putBody = route.request().postDataJSON();
      route.fulfill({ json: { success: true } });
    });

    await page.locator('.sidebar-footer').getByText('修改密码').click();
    await page.getByPlaceholder('输入原密码').fill('old123');
    await page.getByPlaceholder('至少6位新密码').fill('new123');
    await page.getByPlaceholder('再次输入新密码').fill('new123');
    await page.locator('.modal-box button:has-text("确认修改")').click();

    await expectToast(page, '密码已修改');
    expect(putBody.old).toMatch(HEX64);
    expect(putBody.new).toMatch(HEX64);
    expect(putBody.old).not.toBe(putBody.new);
    await expect(page.locator('.modal-box')).toBeHidden();
  });
});

test.describe('侧边栏 导航项', () => {
  test('通知中心 / 用户管理 / 系统设置 跳转', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    await page.locator('.sidebar-nav .nav-item:has-text("通知中心")').click();
    await page.waitForURL('**/notifications', { timeout: 5000 });

    await page.locator('.sidebar-nav .nav-item:has-text("用户管理")').click();
    await page.waitForURL('**/users', { timeout: 5000 });

    await page.locator('.sidebar-nav .nav-item:has-text("系统设置")').click();
    await page.waitForURL('**/settings', { timeout: 5000 });
  });
});

test.describe('顶栏 铃铛徽标', () => {
  test('未读数徽标显示 + 点击跳转通知中心', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    await page.route(/\/api\/notifications(\?.*)?$/, (route) =>
      route.fulfill({ json: { success: true, data: { notifications: MOCK_NOTIFICATIONS, unread_count: 5 } } }));
    await page.reload();

    await expect(page.locator('.topbar-btn .badge')).toHaveText('5');
    await page.locator('.topbar-btn[title="通知中心"]').click();
    await page.waitForURL('**/notifications', { timeout: 5000 });
  });
});

test.describe('系统日志组件', () => {
  const LOGS = [
    { time: '2026-08-27T10:00:00', level: 'info', project_name: 'demo-project', message: '服务启动完成' },
    { time: '2026-08-27T10:01:00', level: 'error', project_name: 'tg-cloud-drive', message: '数据库连接失败' },
  ];

  test('展开 → 刷新 → 级别筛选 → 自动滚动开关', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    let calls = 0;
    await page.route('**/api/logs/system*', (route) => {
      calls++;
      route.fulfill({ json: { success: true, data: LOGS } });
    });

    await page.locator('.card-title:has-text("系统日志")').click();
    await expect(page.locator('.card', { hasText: '系统日志' })).toContainText('服务启动完成');
    await expect(page.locator('.card', { hasText: '系统日志' })).toContainText('数据库连接失败');
    expect(calls).toBe(1);

    // 级别筛选：ERROR → 只剩 error 行
    await page.locator('.card', { hasText: '系统日志' }).getByRole('button', { name: 'ERROR', exact: true }).click();
    await expect(page.locator('.card', { hasText: '系统日志' })).toContainText('数据库连接失败');
    await expect(page.locator('.card', { hasText: '系统日志' })).not.toContainText('服务启动完成');

    // 手动刷新
    await page.locator('.card', { hasText: '系统日志' }).locator('button[title="刷新"]').click();
    await expect.poll(() => calls).toBeGreaterThanOrEqual(2);

    // 自动滚动开关
    await page.locator('.card', { hasText: '系统日志' }).getByRole('button', { name: '⇩ 自动滚动' }).click();
    await expect(page.locator('.card', { hasText: '系统日志' }).getByRole('button', { name: '⇩ 自动滚动' })).toBeVisible();
  });

  test('空日志 → 暂无日志占位', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    await page.route('**/api/logs/system*', (route) =>
      route.fulfill({ json: { success: true, data: [] } }));
    await page.locator('.card-title:has-text("系统日志")').click();
    await expect(page.locator('.card', { hasText: '系统日志' })).toContainText('暂无日志');
  });
});

test.describe('错误边界', () => {
  test('统计渲染崩溃 → 错误页 → 返回仪表盘恢复', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    let bad = true;
    await page.route('**/api/projects/stats', (route) => {
      if (bad) {
        bad = false;
        // data:null → stats.total_projects 访问空值抛 TypeError → ErrorBoundary。
        // 缺字段不会崩（NaN 渲染），实测需 data:null。
        route.fulfill({ json: { success: true, data: null } });
        return;
      }
      route.fulfill({ json: { success: true, data: { total_projects: 5, online: 4, offline: 1, total_users: 12 } } });
    });
    await page.reload();

    await expect(page.getByText('页面出错了')).toBeVisible();
    await page.getByRole('button', { name: '返回仪表盘' }).click();
    await expect(page.getByText('页面出错了')).toBeHidden();
    await expect(page.locator('.project-card')).toHaveCount(5);
  });
});

test.describe('抽屉与 toast', () => {
  test('抽屉关闭按钮 → 关闭抽屉', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    await page.locator('button:has-text("+ 新增项目")').click();
    await expect(page.locator('.drawer[role="dialog"]')).toBeVisible();
    await page.getByRole('button', { name: '关闭抽屉' }).click();
    await expect(page.locator('.drawer[role="dialog"]')).toBeHidden();
  });

  test('成功类 toast 渲染（克隆项目）', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    await page.route('**/api/projects/demo-project/clone', (route) =>
      route.fulfill({ json: { success: true, data: { name: '克隆测试' } } }));
    await page.locator('.project-card-more').first().click();
    await page.locator('.dropdown.open .dd-item:has-text("克隆项目")').click();
    await expect(page.locator('.toast.success')).toContainText('已克隆为「克隆测试」');
  });
});

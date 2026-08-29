import { test, expect } from '@playwright/test';
import { loginAsAdmin, MOCK_PROJECTS, MOCK_USERS } from './helpers.js';

// A 组结构性缺口：所有破坏性操作此前只断言"弹窗出现"，从未点击
// 「确认」验证 API 调用与 UI 结果。本文件逐一补齐全链路。

const clickConfirm = (page) => page.locator('.modal-box button:has-text("确认")').click();
const expectToast = (page, text) => expect(page.locator('.toast').filter({ hasText: text })).toBeVisible();

test.describe('确认按钮全链路', () => {
  test('仪表盘卡片菜单删除：确认 → DELETE 请求 + 卡片移除', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    // 有状态项目列表：删除后重取不再包含该卡片
    const deleted = new Set();
    await page.route(/\/api\/projects(\?.*)?$/, (route) => {
      const list = MOCK_PROJECTS.filter(p => !deleted.has(p.id));
      route.fulfill({ json: { success: true, data: { projects: list, total: list.length } } });
    });
    let deleteUrl = null;
    // 不能用 **/api/projects/* 通配 —— 会连 /projects/stats 和列表一起劫持导致渲染崩溃
    await page.route(/\/api\/projects\/(?!stats|reorder)[^/]+$/, (route) => {
      if (route.request().method() === 'DELETE') {
        deleteUrl = route.request().url();
        deleted.add('demo-project');
      }
      route.fulfill({ json: { success: true } });
    });

    await page.locator('.project-card-more').first().click();
    await page.locator('.dropdown.open .dd-item.danger').click();
    await expect(page.locator('.modal-title')).toHaveText('删除项目');
    await clickConfirm(page);

    await expectToast(page, '项目「示例项目」已删除');
    expect(deleteUrl).toContain('/api/projects/demo-project');
    await expect(page.locator('.project-card')).toHaveCount(MOCK_PROJECTS.length - 1);
    await expect(page.locator('.project-card').first()).not.toContainText('示例项目');
  });

  test('仪表盘卡片菜单停用：确认 → PATCH status + 离线提示', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    let patchUrl = null;
    await page.route('**/api/projects/*/status', (route) => {
      if (route.request().method() === 'PATCH') patchUrl = route.request().url();
      route.fulfill({ json: { success: true, data: { status: 'offline' } } });
    });

    await page.locator('.project-card-more').first().click();
    await page.locator('.dropdown.open .dd-item:has-text("停用项目")').click();
    await expect(page.locator('.modal-title')).toHaveText('停用项目');
    await clickConfirm(page);

    await expectToast(page, '已停用');
    expect(patchUrl).toContain('/api/projects/demo-project/status');
  });

  test('项目详情删除：确认 → DELETE + 跳回仪表盘', async ({ page }) => {
    await loginAsAdmin(page, '/project/demo-project');
    let deleteUrl = null;
    await page.route(/\/api\/projects\/(?!stats|reorder)[^/]+$/, (route) => {
      if (route.request().method() === 'DELETE') deleteUrl = route.request().url();
      route.fulfill({ json: { success: true } });
    });

    await page.locator('button:has-text("删除")').click();
    await expect(page.locator('.modal-title')).toHaveText('删除项目');
    await clickConfirm(page);

    await expectToast(page, '项目「示例项目」已删除');
    expect(deleteUrl).toContain('/api/projects/demo-project');
    await page.waitForURL('**/dashboard', { timeout: 5000 });
  });

  test('项目详情停用：确认 → PATCH status → 离线横幅出现', async ({ page }) => {
    await loginAsAdmin(page, '/project/demo-project');
    let patchUrl = null;
    await page.route('**/api/projects/*/status', (route) => {
      if (route.request().method() === 'PATCH') patchUrl = route.request().url();
      route.fulfill({ json: { success: true, data: { status: 'offline' } } });
    });

    await page.locator('button:has-text("停用")').click();
    await expect(page.locator('.modal-title')).toHaveText('停用项目');
    await clickConfirm(page);

    await expectToast(page, '已停用');
    expect(patchUrl).toContain('/api/projects/demo-project/status');
    await expect(page.getByText('该项目已被管理员停用')).toBeVisible();
  });

  test('项目详情恢复（离线 → 启用）：确认 → 横幅消失', async ({ page }) => {
    await loginAsAdmin(page, '/project/demo-project');
    // 覆盖项目为离线状态（mount 时读取 → 需在 reload 前注册）
    await page.route(/\/api\/projects\/demo-project$/, (route) =>
      route.fulfill({ json: { success: true, data: { ...MOCK_PROJECTS[0], status: 'offline' } } }));
    await page.route('**/api/projects/*/status', (route) =>
      route.fulfill({ json: { success: true, data: { status: 'online' } } }));
    await page.reload();
    await expect(page.getByText('该项目已被管理员停用')).toBeVisible();

    await page.locator('button:has-text("启用")').click();
    await expect(page.locator('.modal-title')).toHaveText('启用项目');
    await clickConfirm(page);

    await expectToast(page, '已启用');
    await expect(page.getByText('该项目已被管理员停用')).toBeHidden();
  });

  test('用户管理删除：确认 → DELETE /users/:id + 行移除', async ({ page }) => {
    await loginAsAdmin(page, '/users');
    const deleted = new Set();
    await page.route(/\/api\/users(\?.*)?$/, (route) => {
      const list = MOCK_USERS.filter(u => !deleted.has(u.id));
      route.fulfill({
        json: { success: true, data: { users: list, counts: { all: list.length, super_admin: 1, project_admin: 1, viewer: 1 } } },
      });
    });
    let deleteUrl = null;
    await page.route(/\/api\/users\/[^/]+$/, (route) => {
      if (route.request().method() === 'DELETE') {
        deleteUrl = route.request().url();
        deleted.add('u_001');
      }
      route.fulfill({ json: { success: true } });
    });

    await page.locator('.link-action.danger').first().click();
    await expect(page.locator('.modal-title')).toContainText('删除用户');
    await clickConfirm(page);

    await expectToast(page, '已删除');
    expect(deleteUrl).toContain('/api/users/u_001');
    await expect(page.locator('.tbl-row:not(.head)')).toHaveCount(MOCK_USERS.length - 1);
  });

  test('备份恢复：确认 → POST restore + 恢复提示', async ({ page }) => {
    await loginAsAdmin(page, '/project/demo-project');
    await page.route(/\/api\/projects\/demo-project$/, (route) =>
      route.fulfill({ json: { success: true, data: { ...MOCK_PROJECTS[0], dsn: 'sqlite:///qa.db' } } }));
    await page.route('**/api/backups/demo-project', (route) =>
      route.fulfill({ json: { success: true, data: { backups: [{ filename: 'qa-20260827.db', created: '2026-08-27', size_mb: 1.2 }] } } }));
    let restoreUrl = null;
    await page.route('**/api/backups/demo-project/restore/*', (route) => {
      restoreUrl = route.request().url();
      route.fulfill({ json: { success: true } });
    });
    await page.reload();

    await page.locator('.tab-item:has-text("备份管理")').click();
    await page.locator('button:has-text("恢复")').click();
    await expect(page.locator('.modal-title')).toContainText('恢复备份');
    await clickConfirm(page);

    await expectToast(page, '数据库已恢复');
    expect(restoreUrl).toContain('/api/backups/demo-project/restore/qa-20260827.db');
  });

  test('侧边栏退出登录：确认 → 清空 token 回到登录页', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    await page.locator('.sidebar-footer').getByText('退出登录').click();
    await expect(page.locator('.modal-title')).toContainText('退出登录');
    await clickConfirm(page);

    await expect(page.locator('.login-card')).toBeVisible();
    const token = await page.evaluate(() => localStorage.getItem('lambs_token'));
    expect(token).toBeNull();
  });
});

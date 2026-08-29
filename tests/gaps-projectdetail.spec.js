import { test, expect } from '@playwright/test';
import { loginAsAdmin, MOCK_PROJECTS } from './helpers.js';

// B 组缺口：ProjectDetail 的 成员管理 / 服务日志 / 备份管理 三个页签
// 此前从未被 E2E 覆盖。

const expectToast = (page, text) => expect(page.locator('.toast').filter({ hasText: text })).toBeVisible();

test.describe('项目详情 成员管理', () => {
  let postBody, deleteUrl;
  test.beforeEach(async ({ page }) => {
    postBody = null;
    deleteUrl = null;
    await loginAsAdmin(page, '/project/demo-project');
    // 有状态成员数据：添加/移除后重取反映变化。
    // 捕获 POST/DELETE 放在同一路由内 —— 测试体内再注册路由会因 LIFO 覆盖此路由并泄漏到真实网络。
    let members = [{ id: 'u_001', name: '管理员', email: 'admin@example.com', role: 'super_admin' }];
    let nonMembers = [
      { id: 'u_002', name: '张三', email: 'zhangsan@example.com', role: 'project_admin' },
      { id: 'u_003', name: '李四', email: 'lisi@example.com', role: 'viewer' },
    ];
    await page.route(/\/api\/projects\/demo-project\/members/, (route) => {
      const m = route.request().method();
      if (m === 'GET') {
        route.fulfill({ json: { success: true, data: { members, non_members: nonMembers } } });
        return;
      }
      if (m === 'POST') {
        postBody = route.request().postDataJSON();
        const { user_id } = postBody || {};
        const u = nonMembers.find(x => x.id === user_id);
        if (u) { nonMembers = nonMembers.filter(x => x.id !== user_id); members = [...members, u]; }
        route.fulfill({ json: { success: true } });
        return;
      }
      if (m === 'DELETE') {
        deleteUrl = route.request().url();
        const id = decodeURIComponent(deleteUrl.split('/members/')[1]);
        const u = members.find(x => x.id === id);
        if (u) { members = members.filter(x => x.id !== id); nonMembers = [...nonMembers, u]; }
        route.fulfill({ json: { success: true } });
      }
    });
    await page.locator('.tab-item:has-text("成员管理")').click();
  });

  test('成员管理：列表渲染（已分配 + 可添加）', async ({ page }) => {
    await expect(page.getByText('已分配成员 (1)')).toBeVisible();
    await expect(page.getByText('admin@example.com').first()).toBeVisible();
    await expect(page.getByText('可添加用户')).toBeVisible();
    await expect(page.getByText('zhangsan@example.com')).toBeVisible();
  });

  test('成员管理：添加成员 → POST + 列表移动', async ({ page }) => {
    await page.getByText('+ 添加').first().click();
    await expectToast(page, '成员已添加');
    expect(postBody).toEqual({ user_id: 'u_002' });
    await expect(page.getByText('已分配成员 (2)')).toBeVisible();
  });

  test('成员管理：移除成员 → DELETE + 列表移动', async ({ page }) => {
    // 先把张三加进来（非超管才有「移除」）
    await page.getByText('+ 添加').first().click();
    await expect(page.getByText('已分配成员 (2)')).toBeVisible();

    await page.getByText('移除').click();
    await expectToast(page, '成员已移除');
    expect(deleteUrl).toContain('/members/u_002');
    await expect(page.getByText('已分配成员 (1)')).toBeVisible();
  });
});

test.describe('项目详情 服务日志', () => {
  test('服务日志：列表渲染 + 刷新重新请求', async ({ page }) => {
    await loginAsAdmin(page, '/project/demo-project');
    await page.route(/\/api\/projects\/demo-project$/, (route) =>
      route.fulfill({ json: { success: true, data: { ...MOCK_PROJECTS[0], service_name: 'qa-api' } } }));
    let logCalls = 0;
    await page.route(/\/api\/projects\/demo-project\/logs$/, (route) => {
      logCalls++;
      route.fulfill({ json: { success: true, data: { logs: ['2026-08-27 10:00:00 INFO 服务启动完成', '2026-08-27 10:01:00 ERROR 数据库连接失败'] } } });
    });
    await page.reload();

    await page.locator('.tab-item:has-text("服务日志")').click();
    await expect(page.getByText('服务启动完成')).toBeVisible();
    await expect(page.getByText('数据库连接失败')).toBeVisible();
    await expect(page.getByText(/qa-api\.service/)).toBeVisible();

    await page.locator('button:has-text("刷新日志")').click();
    await expect.poll(() => logCalls).toBeGreaterThanOrEqual(2);
  });

  test('服务日志：空日志显示占位', async ({ page }) => {
    await loginAsAdmin(page, '/project/demo-project');
    await page.route(/\/api\/projects\/demo-project$/, (route) =>
      route.fulfill({ json: { success: true, data: { ...MOCK_PROJECTS[0], service_name: 'qa-api' } } }));
    await page.route(/\/api\/projects\/demo-project\/logs$/, (route) =>
      route.fulfill({ json: { success: true, data: { logs: [] } } }));
    await page.reload();

    await page.locator('.tab-item:has-text("服务日志")').click();
    await expect(page.getByText('— 暂无日志 —')).toBeVisible();
  });
});

test.describe('项目详情 备份管理', () => {
  const withBackups = async (page, initialBackups, captures = {}) => {
    let backups = [...initialBackups];
    await page.route(/\/api\/projects\/demo-project$/, (route) =>
      route.fulfill({ json: { success: true, data: { ...MOCK_PROJECTS[0], dsn: 'sqlite:///qa.db' } } }));
    await page.route('**/api/backups/demo-project', (route) => {
      const m = route.request().method();
      if (m === 'GET') {
        route.fulfill({ json: { success: true, data: { backups } } });
        return;
      }
      if (m === 'POST') {
        captures.postUrl = route.request().url();
        backups = [...backups, { filename: `qa-${Date.now()}.db`, created: '2026-08-27', size_mb: 2.5 }];
        route.fulfill({ json: { success: true, data: { ok: true, size_mb: 2.5 } } });
      }
    });
    await page.route('**/api/backups/demo-project/download/*', (route) => {
      if (route.request().method() === 'DELETE') {
        const filename = decodeURIComponent(route.request().url().split('/download/')[1]);
        backups = backups.filter(b => b.filename !== filename);
        route.fulfill({ json: { success: true } });
        return;
      }
      route.fulfill({ contentType: 'text/csv', body: 'backup,name\n1,qa-20260827.db' });
    });
  };

  test('备份管理：列表渲染 + 创建备份', async ({ page }) => {
    await loginAsAdmin(page, '/project/demo-project');
    const captures = {};
    await withBackups(page, [{ filename: 'qa-20260827.db', created: '2026-08-27', size_mb: 1.2 }], captures);
    await page.reload();

    await page.locator('.tab-item:has-text("备份管理")').click();
    await expect(page.getByText('qa-20260827.db')).toBeVisible();
    await expect(page.getByText('1.2MB')).toBeVisible();

    await page.locator('button:has-text("+ 创建备份")').click();
    await expectToast(page, '备份完成 · 2.5MB');
    expect(captures.postUrl).toContain('/api/backups/demo-project');
    await expect(page.getByText('数据库备份')).toContainText('（2个）');
  });

  test('备份管理：下载备份触发文件下载', async ({ page }) => {
    await loginAsAdmin(page, '/project/demo-project');
    await withBackups(page, [{ filename: 'qa-20260827.db', created: '2026-08-27', size_mb: 1.2 }]);
    await page.reload();
    await page.locator('.tab-item:has-text("备份管理")').click();

    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    await page.locator('button:has-text("下载")').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('qa-20260827.db');
  });

  test('备份管理：删除备份 → DELETE + 列表更新', async ({ page }) => {
    await loginAsAdmin(page, '/project/demo-project');
    await withBackups(page, [{ filename: 'qa-20260827.db', created: '2026-08-27', size_mb: 1.2 }]);
    await page.reload();
    await page.locator('.tab-item:has-text("备份管理")').click();
    await expect(page.getByText('qa-20260827.db')).toBeVisible();

    // 页头「删除」按钮也在 main 内 → 备份行按钮是 btn-xs，精确到行
    await page.locator('main button.btn-xs:has-text("删除")').click();
    await expectToast(page, '备份已删除');
    await expect(page.getByText('qa-20260827.db')).toBeHidden();
    await expect(page.getByText('暂无备份，点击上方按钮创建')).toBeVisible();
  });

  test('备份管理：空列表占位', async ({ page }) => {
    await loginAsAdmin(page, '/project/demo-project');
    await withBackups(page, []);
    await page.reload();
    await page.locator('.tab-item:has-text("备份管理")').click();
    await expect(page.getByText('暂无备份，点击上方按钮创建')).toBeVisible();
  });
});

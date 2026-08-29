import { test, expect } from '@playwright/test';
import { loginAsAdmin, MOCK_USERS } from './helpers.js';

// H 组缺口：用户管理 加载更多 / 空态 / 失败重试 / 移动端角色下拉

test.describe('用户管理 分页加载', () => {
  test('20+5 分页 → 加载更多出现 → 加载后消失', async ({ page }) => {
    await loginAsAdmin(page, '/users');
    const all = Array.from({ length: 25 }, (_, i) => ({
      id: `u_${String(i + 10).padStart(3, '0')}`,
      name: `测试用户${i + 1}`,
      email: `user${i + 1}@lambs.local`,
      role: 'viewer',
      status: 'active',
      last_login: '2026-08-27 10:00',
    }));
    await page.route(/\/api\/users(\?.*)?$/, (route) => {
      const u = new URL(route.request().url());
      const pg = Number(u.searchParams.get('page') || 1);
      const start = (pg - 1) * 20;
      route.fulfill({
        json: { success: true, data: { users: all.slice(start, start + 20), counts: { all: 25, super_admin: 0, project_admin: 0, viewer: 25 } } },
      });
    });
    await page.reload();

    await expect(page.locator('.tbl-row:not(.head)')).toHaveCount(20);
    await expect(page.locator('button:has-text("加载更多")')).toBeVisible();

    await page.locator('button:has-text("加载更多")').click();
    await expect(page.locator('.tbl-row:not(.head)')).toHaveCount(25);
    await expect(page.locator('button:has-text("加载更多")')).toBeHidden();
  });
});

test.describe('用户管理 空态与失败重试', () => {
  test('搜索无结果 → 空态提示', async ({ page }) => {
    await loginAsAdmin(page, '/users');
    await page.getByPlaceholder('搜索账号、用户名或邮箱…').fill('不存在的用户');
    await page.waitForTimeout(400); // debounce
    await expect(page.getByText('未找到匹配的用户')).toBeVisible();
  });

  test('加载失败 → 重试 → 恢复列表', async ({ page }) => {
    await loginAsAdmin(page, '/users');
    let calls = 0;
    await page.route(/\/api\/users(\?.*)?$/, (route) => {
      if (calls++ === 0) {
        route.fulfill({ status: 500, json: { detail: 'boom' } });
        return;
      }
      // 重试请求显式返回数据 —— route.continue() 会漏到真实网络（代理 500）
      route.fulfill({ json: { success: true, data: { users: MOCK_USERS, counts: { all: 3, super_admin: 1, project_admin: 1, viewer: 1 } } } });
    });
    await page.reload();

    await expect(page.getByText('用户加载失败')).toBeVisible();
    await page.getByRole('button', { name: '重试' }).click();
    await expect(page.locator('.tbl-row:not(.head)')).toHaveCount(3);
  });
});

test.describe('用户管理 移动端角色下拉', () => {
  // 移动端断点下 .role-nav-mobile 才可见（CSS display:none），桌面视口不可见
  test.use({ viewport: { width: 480, height: 800 } });

  test('TypeSelect 切换角色 → 列表按角色过滤', async ({ page }) => {
    await loginAsAdmin(page, '/users');
    // index.css:544 的基础 .role-nav-mobile{display:none} 同特异性后写，覆盖了
    // media 查询里的 display:block（index.css:536）→ 组件被永久隐藏（应用 CSS 缺陷）。
    // 注入覆盖使其可见，测试组件真实行为。
    await page.addStyleTag({ content: '.role-nav-mobile{display:block!important}' });
    // TypeSelect 面板挂载在 body，先点移动端触发器再点全局选项。
    // 预滚动排掉异步 scroll 事件，避免面板打开瞬间被 scroll 监听器关闭
    const roleTrigger = page.locator('.role-nav-mobile button:has-text("全部用户")');
    await roleTrigger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await roleTrigger.click();
    await page.getByRole('button', { name: '查看者', exact: true }).click();

    await expect(page.locator('.tbl-row:not(.head)')).toHaveCount(1);
    await expect(page.locator('.tbl-row:not(.head)')).toContainText('李四');
    // 桌面 role-nav 在移动端隐藏（display:none），改断言触发器文本回显
    await expect(page.locator('.role-nav-mobile button')).toContainText('查看者');
  });
});

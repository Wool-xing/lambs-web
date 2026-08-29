import { test, expect } from '@playwright/test';
import { loginAsAdmin, MOCK_NOTIFICATIONS } from './helpers.js';

// I 组缺口：通知中心 全部已读 / 标已读 / 删除的结果断言 + 分页 + 空态
// MOCK 数据用 is_read 字段但 UI 读取 n.read → 4 条全部渲染为未读。

const expectToast = (page, text) => expect(page.locator('.toast').filter({ hasText: text })).toBeVisible();

test.describe('通知中心 已读与删除', () => {
  test('全部已读 → POST read-all + 未读样式清除', async ({ page }) => {
    await loginAsAdmin(page, '/notifications');
    // 全量并行下 webkit 首屏列表请求可能 >5s —— 首条 count 断言放宽窗口
    await expect(page.locator('.notif-item.unread')).toHaveCount(4, { timeout: 10000 });
    let postUrl = null;
    await page.route('**/api/notifications/read-all', (route) => {
      postUrl = route.request().url();
      route.fulfill({ json: { success: true } });
    });

    await page.locator('button:has-text("全部已读")').click();
    await expectToast(page, '已全部标记为已读');
    expect(postUrl).toContain('/api/notifications/read-all');
    await expect(page.locator('.notif-item.unread')).toHaveCount(0);
  });

  test('标已读 → POST /n1/read + 未读计数减少', async ({ page }) => {
    await loginAsAdmin(page, '/notifications');
    await expect(page.locator('.notif-item.unread')).toHaveCount(4, { timeout: 10000 });
    let readUrl = null;
    await page.route('**/api/notifications/n1/read', (route) => {
      readUrl = route.request().url();
      route.fulfill({ json: { success: true } });
    });

    await page.locator('.notif-item', { hasText: '示例项目 - 服务异常' }).getByRole('button', { name: '标记已读' }).click();
    // 请求到达 route handler 是异步的 —— poll 等待而非立即断言（firefox 下会竞态拿到 null）
    await expect.poll(() => readUrl).toContain('/api/notifications/n1/read');
    await expect(page.locator('.notif-item.unread')).toHaveCount(3);
  });

  test('删除通知 → DELETE /n1 + 列表移除', async ({ page }) => {
    await loginAsAdmin(page, '/notifications');
    await expect(page.locator('.notif-item')).toHaveCount(4, { timeout: 10000 });
    let deleteUrl = null;
    await page.route(/\/api\/notifications\/n1$/, (route) => {
      deleteUrl = route.request().url();
      route.fulfill({ json: { success: true } });
    });

    await page.locator('.notif-item', { hasText: '示例项目 - 服务异常' }).getByRole('button', { name: '删除通知' }).click();
    // 同「标已读」：请求到达 route handler 前 deleteUrl 仍是 null，poll 等待
    await expect.poll(() => deleteUrl).toContain('/api/notifications/n1');
    await expect(page.locator('.notif-item')).toHaveCount(3);
    await expect(page.getByText('示例项目 - 服务异常')).toBeHidden();
  });
});

test.describe('通知中心 分页与空态', () => {
  test('20+5 分页 → 加载更多出现 → 加载后消失', async ({ page }) => {
    await loginAsAdmin(page, '/notifications');
    const all = Array.from({ length: 25 }, (_, i) => ({
      id: `n_${i + 1}`,
      type: i % 2 ? 'info' : 'alert',
      title: `通知 ${i + 1}`,
      content: `内容 ${i + 1}`,
      read: false,
      created_at: '2026-08-27T10:00:00',
    }));
    await page.route(/\/api\/notifications(\?.*)?$/, (route) => {
      const u = new URL(route.request().url());
      const pg = Number(u.searchParams.get('page') || 1);
      const start = (pg - 1) * 20;
      const slice = all.slice(start, start + 20);
      route.fulfill({ json: { success: true, data: { notifications: slice, unread_count: 25 } } });
    });
    await page.reload();

    await expect(page.locator('.notif-item')).toHaveCount(20);
    await expect(page.locator('button:has-text("加载更多")')).toBeVisible();

    await page.locator('button:has-text("加载更多")').click();
    await expect(page.locator('.notif-item')).toHaveCount(25);
    await expect(page.locator('button:has-text("加载更多")')).toBeHidden();
  });

  test('空列表 → 暂无通知占位', async ({ page }) => {
    await loginAsAdmin(page, '/notifications');
    await page.route(/\/api\/notifications(\?.*)?$/, (route) =>
      route.fulfill({ json: { success: true, data: { notifications: [], unread_count: 0 } } }));
    await page.reload();
    await expect(page.getByText('暂无通知')).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers.js';

// R3-4 regression: after the data table is searched, pagination (and row
// deletion) must keep the search/sort params — the refetch used to drop them,
// instantly showing the unfiltered full table.
test.describe('项目详情 数据浏览', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.locator('.project-card').first().click();
    await page.waitForURL('**/project/**');

    // Scripted table API: 30 rows, 15 per page, honoring search + page.
    await page.route('**/api/projects/*/tables/list**', (route) =>
      route.fulfill({ json: { success: true, data: { tables: ['users'] } } }));
    await page.route(/\/api\/projects\/[^/]+\/tables\?/, async (route) => {
      const u = new URL(route.request().url());
      const search = u.searchParams.get('search') || '';
      const pageN = parseInt(u.searchParams.get('page') || '1', 10);
      const all = Array.from({ length: 30 }, (_, i) => ({ id: `u${i}`, name: `user${i}` }));
      const rows = search ? all.filter((r) => r.name.includes(search)) : all;
      const start = (pageN - 1) * 15;
      await route.fulfill({
        json: {
          success: true,
          data: {
            columns: ['id', 'name'],
            rows: rows.slice(start, start + 15),
            total: rows.length,
            pk: 'id',
            page: pageN,
            page_size: 15,
          },
        },
      });
    });

    // Pick the table via the TypeSelect dropdown.
    await page.getByRole('button', { name: /选择数据表/ }).click();
    await page.getByRole('button', { name: 'users', exact: true }).click();
    await expect(page.locator('input[placeholder^="搜索"]')).toBeVisible();
  });

  test('搜索后翻页保留搜索参数（R3-4 回归）', async ({ page }) => {
    // Track every tables request the page makes.
    const seen = [];
    page.on('request', (req) => {
      if (/\/api\/projects\/[^/]+\/tables\?/.test(req.url())) {
        seen.push(new URL(req.url()));
      }
    });

    // Search "user" matches all 30 rows → 2 pages.
    await page.locator('input[placeholder^="搜索"]').fill('user');
    await page.locator('.pg-btn').last().click();

    const last = seen[seen.length - 1];
    expect(last).toBeTruthy();
    expect(last.searchParams.get('page')).toBe('2');
    expect(last.searchParams.get('search')).toBe('user');
  });
});

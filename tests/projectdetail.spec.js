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
    await page.waitForTimeout(400); // let the 300ms debounce fire
    await page.locator('.pg-btn').last().click();

    const last = seen[seen.length - 1];
    expect(last).toBeTruthy();
    expect(last.searchParams.get('page')).toBe('2');
    expect(last.searchParams.get('search')).toBe('user');
  });

  test('快速连续搜索：旧慢响应不覆盖新结果（R3-5 回归）', async ({ page }) => {
    // Override the tables route (later routes win): "user1" answers slowly,
    // "user2" answers fast — without the stale-response guard the slow
    // "user1" payload would land last and overwrite the "user2" view.
    await page.route(/\/api\/projects\/[^/]+\/tables\?/, async (route) => {
      const u = new URL(route.request().url());
      const search = u.searchParams.get('search') || '';
      const all = Array.from({ length: 30 }, (_, i) => ({ id: `u${i}`, name: `user${i}` }));
      const rows = search ? all.filter((r) => r.name.includes(search)) : all;
      const payload = {
        success: true,
        data: { columns: ['id', 'name'], rows: rows.slice(0, 15), total: rows.length, pk: 'id', page: 1, page_size: 15 },
      };
      if (search === 'user1') {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      await route.fulfill({ json: payload });
    });

    // Track the search params actually sent — the slow "user1" request must
    // really fire, otherwise this test would vacuously pass.
    const seen = [];
    page.on('request', (req) => {
      if (/\/api\/projects\/[^/]+\/tables\?/.test(req.url())) {
        seen.push(new URL(req.url()).searchParams.get('search') || '');
      }
    });

    const input = page.locator('input[placeholder^="搜索"]');
    await input.fill('user1');
    await page.waitForTimeout(400); // debounce 300ms + margin → slow fetch starts
    await input.fill('user2');
    await page.waitForTimeout(400); // debounce 300ms + margin → fast fetch starts
    // Wait past the slow response's arrival.
    await page.waitForTimeout(1200);

    expect(seen).toContain('user1'); // the slow request really went out
    expect(seen[seen.length - 1]).toBe('user2');
    const rowTexts = await page.locator('.tbl-row:not(.head)').allTextContents();
    const joined = rowTexts.join('|');
    expect(joined).toContain('user2');
    expect(joined).not.toContain('user1');
  });
});

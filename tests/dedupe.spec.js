import { test, expect } from '@playwright/test';

// request 层通用 GET 去重回归（client.js inflightGets）：
// 并发相同 GET 合并为单次请求；dedupe:false 放行；settle 后下次仍重新请求。
test.describe('API GET 去重', () => {
  async function countRequests(page) {
    let hits = 0;
    await page.route('**/lambs/api/test-dedupe', async (route) => {
      hits++;
      await route.fulfill({ json: { success: true, data: { probe: true } } });
    });
    return () => hits;
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/lambs/');
  });

  test('并发相同 GET 只发一次请求，两个调用方拿到同一结果', async ({ page }) => {
    const getHits = await countRequests(page);
    const results = await page.evaluate(async () => {
      const { api } = await import('/lambs/src/api/client.js');
      const [a, b] = await Promise.all([
        api.get('/test-dedupe'),
        api.get('/test-dedupe'),
      ]);
      return { a: a.success, b: b.success };
    });
    expect(getHits()).toBe(1);
    expect(results).toEqual({ a: true, b: true });
  });

  test('dedupe:false 强制并发发两次', async ({ page }) => {
    const getHits = await countRequests(page);
    await page.evaluate(async () => {
      const { api } = await import('/lambs/src/api/client.js');
      await Promise.all([
        api.get('/test-dedupe', { dedupe: false }),
        api.get('/test-dedupe', { dedupe: false }),
      ]);
    });
    expect(getHits()).toBe(2);
  });

  test('请求完成后再次调用重新发请求（轮询不被去重吞掉）', async ({ page }) => {
    const getHits = await countRequests(page);
    await page.evaluate(async () => {
      const { api } = await import('/lambs/src/api/client.js');
      await api.get('/test-dedupe');
      await api.get('/test-dedupe');
    });
    expect(getHits()).toBe(2);
  });
});

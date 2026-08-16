import { test, expect } from '@playwright/test';

// resolveAsset 前缀策略回归（R3-P3）：只给 /api 加 base，其他绝对路径原样。
test.describe('resolveAsset', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/lambs/');
  });

  test('路径前缀与透传规则', async ({ page }) => {
    const results = await page.evaluate(async () => {
      const { resolveAsset } = await import('/lambs/src/api/client.js');
      return {
        api: resolveAsset('/api/health'),
        alreadyBased: resolveAsset('/lambs/api/health'),
        staticAsset: resolveAsset('/static/logo.png'),
        protocolRelative: resolveAsset('//cdn.example.com/x.png'),
        dataUrl: resolveAsset('data:image/png;base64,AAAA'),
        http: resolveAsset('http://example.com/x.png'),
        empty: resolveAsset(''),
        relative: resolveAsset('img/x.png'),
      };
    });
    expect(results).toEqual({
      api: '/lambs/api/health',
      alreadyBased: '/lambs/api/health',
      staticAsset: '/static/logo.png',
      protocolRelative: '//cdn.example.com/x.png',
      dataUrl: 'data:image/png;base64,AAAA',
      http: 'http://example.com/x.png',
      empty: '',
      relative: 'img/x.png',
    });
  });
});

import { test, expect } from '@playwright/test';
import { setupApiMocks, MOCK_TOKEN } from './helpers.js';

test.describe('登录页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/fonts.googleapis.com**', (route) => route.abort());
    // Catch-all first (later routes win): keep unmocked API calls off the
    // real backend — a real 401 would wipe the mock session mid-test.
    await page.route('**/Lambs/api/**', (route) => route.fulfill({ json: { success: true, data: {} } }));
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ status: 401, json: { detail: 'Not authenticated' } });
    });
    await page.goto('/Lambs/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.login-card', { timeout: 10000 });
  });

  test('显示登录表单：标题、用户名、密码、登录按钮', async ({ page }) => {
    await expect(page.locator('.login-title')).toHaveText('Lambs管理系统');
    await expect(page.locator('#login-username')).toBeVisible();
    await expect(page.locator('#login-pass')).toBeVisible();
    await expect(page.locator('.login-card button.btn-primary')).toContainText('登 录');
  });

  test('空用户名提交 → 显示错误 toast', async ({ page }) => {
    await page.locator('.login-card button.btn-primary').click();
    await expect(page.locator('.toast.error')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.toast.error')).toContainText('请输入用户名');
  });

  test('空密码提交 → 显示错误 toast', async ({ page }) => {
    await page.fill('#login-username', 'admin');
    await page.locator('.login-card button.btn-primary').click();
    await expect(page.locator('.toast.error')).toContainText('请输入密码');
  });

  test('有效凭据登录成功 → 跳转到仪表盘', async ({ page }) => {
    await setupApiMocks(page);
    await page.fill('#login-username', 'admin');
    await page.fill('#login-pass', 'password123');
    await page.locator('.login-card button.btn-primary').click();
    await page.waitForURL('**/Lambs/dashboard', { timeout: 10000 });
    await expect(page.locator('.summary-row')).toBeVisible();
  });

  test('密码眼睛切换明文/密文', async ({ page }) => {
    const pwdInput = page.locator('#login-pass');
    await expect(pwdInput).toHaveAttribute('type', 'password');
    await page.click('.pwd-eye');
    await expect(pwdInput).toHaveAttribute('type', 'text');
    await page.click('.pwd-eye');
    await expect(pwdInput).toHaveAttribute('type', 'password');
  });

  test('记住密码勾选 → localStorage 存储凭据', async ({ page }) => {
    await setupApiMocks(page);
    await page.check('#remember-me');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-pass', 'password123');
    await page.locator('.login-card button.btn-primary').click();
    await page.waitForURL('**/Lambs/dashboard', { timeout: 10000 });
    const saved = await page.evaluate(() => localStorage.getItem('lambs-remember'));
    expect(saved).not.toBeNull();
    const parsed = JSON.parse(saved);
    expect(parsed.username).toBe('admin');
  });

  test('忘记密码 → 弹窗显示', async ({ page }) => {
    await page.click('text=忘记密码？');
    await expect(page.locator('.modal-box')).toBeVisible();
    await expect(page.locator('.modal-title')).toContainText('重置密码');
  });

  test('忘记密码表单提交 → API 调用成功', async ({ page }) => {
    await setupApiMocks(page);
    await page.click('text=忘记密码？');
    await page.fill('.modal-box input[placeholder="请输入用户名"]', 'admin');
    await page.locator('.modal-box button.btn-primary').click();
    await expect(page.locator('.toast')).toBeVisible({ timeout: 3000 });
  });

  test('注册 → 弹窗显示', async ({ page }) => {
    await page.click('text=注册新账号');
    await expect(page.locator('.modal-box')).toBeVisible();
    await expect(page.locator('.modal-title')).toContainText('注册新账号');
  });

  test('注册表单提交 → API 调用成功', async ({ page }) => {
    // Dashboard 需要 stats mock（catch-all 的 data:{} 会让 total_users.toLocaleString 崩）
    await setupApiMocks(page);
    // Mock register endpoint (token must be JWT-shaped — client-side exp check)
    await page.route('**/api/auth/register', async (route) => {
      await route.fulfill({ json: { success: true, data: { access_token: MOCK_TOKEN, token_type: 'bearer', user: {} } } });
    });
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ json: { success: true, data: { id: '1', username: 'newuser', name: 'newuser', email: 'new@test.com', role: 'viewer', status: 'active' } } });
    });
    await page.click('text=注册新账号');
    await page.fill('.modal-box input[placeholder="请输入用户名"]', 'newuser');
    await page.fill('.modal-box input[placeholder="请输入邮箱"]', 'new@test.com');
    await page.fill('.modal-box input[placeholder*="密码"]', 'password123');
    await page.locator('.modal-box button.btn-primary').click();
    await page.waitForURL('**/Lambs/dashboard', { timeout: 10000 });
    await expect(page.locator('.stat-card').first()).toBeVisible();
  });
});

test.describe('R7 加盐密码', () => {
  test('登录提交的密码是 sha256(密码+盐)，非明文', async ({ page }) => {
    const salt = '0123456789abcdef0123456789abcdef';
    await page.route('**/fonts.googleapis.com**', (route) => route.abort());
    await page.route('**/Lambs/api/**', (route) => route.fulfill({ json: { success: true, data: {} } }));
    // 后注册更具体 → 覆盖 catch-all；返回非空盐
    await page.route('**/api/auth/salt*', (route) =>
      route.fulfill({ json: { success: true, data: { salt } } }));
    let sentPassword = null;
    await page.route('**/api/auth/login', async (route) => {
      sentPassword = (JSON.parse(route.request().postData() || '{}') || {}).password ?? null;
      await route.fulfill({ json: { success: true, data: { access_token: MOCK_TOKEN, token_type: 'bearer' } } });
    });
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ json: { success: true, data: { id: 'u_test001', username: 'admin', name: '管理员', email: 'a@b.c', role: 'super_admin', status: 'active' } } }));
    await page.goto('/Lambs/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.login-card', { timeout: 10000 });
    await page.fill('#login-username', 'admin');
    await page.fill('#login-pass', 'admin123');
    await page.locator('.login-card button.btn-primary').click();
    await page.waitForURL('**/Lambs/dashboard', { timeout: 10000 });
    const expected = await page.evaluate(async (s) => {
      const { hashPassword } = await import('/Lambs/src/api/client.js');
      return hashPassword('admin123', s);
    }, salt);
    expect(sentPassword).toBe(expected);
    expect(sentPassword).not.toBe('admin123');
    expect(sentPassword).toMatch(/^[0-9a-f]{64}$/);
  });
});

import { test, expect } from '@playwright/test';
import { setupApiMocks } from './helpers.js';

// F 组缺口：忘记密码两步流 / 注册校验 / 登录失败 / 记住我取消勾选
// 忘记密码请求走原生 fetch（非 api 包装），必须显式 mock 两个端点。

const expectToast = (page, text) => expect(page.locator('.toast').filter({ hasText: text })).toBeVisible();

test.describe('登录页', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/Lambs/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.login-card', { timeout: 10000 });
  });

  test('登录失败 → 后端错误 toast', async ({ page }) => {
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ status: 401, json: { detail: '用户名或密码错误' } }));
    await page.fill('#login-username', 'admin');
    await page.fill('#login-pass', 'wrong-password');
    await page.locator('.login-card button.btn-primary').click();
    await expectToast(page, '用户名或密码错误');
  });

  test('记住我取消勾选 → 登录成功后不存储凭据', async ({ page }) => {
    await page.uncheck('#remember-me');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-pass', 'password123');
    await page.locator('.login-card button.btn-primary').click();
    await page.waitForURL('**/Lambs/dashboard', { timeout: 10000 });

    const saved = await page.evaluate(() => localStorage.getItem('lambs-remember'));
    expect(saved).toBeNull();
  });
});

test.describe('忘记密码两步流', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/Lambs/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.login-card', { timeout: 10000 });
  });

  test('step1 校验：用户名与邮箱必填', async ({ page }) => {
    await page.getByText('忘记密码？').click();
    await page.locator('.modal-box button:has-text("发送验证码")').click();
    await expectToast(page, '请输入用户名');

    await page.locator('#forgot-username').fill('admin');
    await page.locator('.modal-box button:has-text("发送验证码")').click();
    await expectToast(page, '请输入正确的邮箱');
  });

  test('step1 发送 → 请求 body 正确 + 进入 step2 + 60s 冷却', async ({ page }) => {
    let requestBody = null;
    await page.route('**/api/auth/forgot-password/request', (route) => {
      requestBody = route.request().postDataJSON();
      route.fulfill({ json: { success: true, data: { message: '验证码已发送至您的邮箱' } } });
    });
    await page.getByText('忘记密码？').click();
    await page.locator('#forgot-username').fill('admin');
    await page.locator('#forgot-email').fill('admin@lambs.local');
    await page.locator('.modal-box button:has-text("发送验证码")').click();

    await expectToast(page, '验证码已发送至您的邮箱');
    expect(requestBody).toEqual({ username: 'admin', email: 'admin@lambs.local' });
    await expect(page.locator('.modal-box', { hasText: '重置密码' })).toContainText('admin@lambs.local');
    await expect(page.locator('.modal-box', { hasText: '重置密码' })).toContainText('秒后可重发');
  });

  test('step2 校验：验证码格式 / 密码长度 / 两次一致', async ({ page }) => {
    await page.route('**/api/auth/forgot-password/request', (route) =>
      route.fulfill({ json: { success: true, data: { message: 'ok' } } }));
    await page.getByText('忘记密码？').click();
    await page.locator('#forgot-username').fill('admin');
    await page.locator('#forgot-email').fill('admin@lambs.local');
    await page.locator('.modal-box button:has-text("发送验证码")').click();
    await expect(page.locator('.modal-box', { hasText: '验证码已发送至' })).toBeVisible();

    await page.getByPlaceholder('请输入6位数字验证码').fill('12a');
    await page.getByPlaceholder('至少6位新密码').fill('newpass123');
    await page.locator('.modal-box button:has-text("重置密码")').click();
    await expectToast(page, '请输入6位数字验证码');

    await page.getByPlaceholder('请输入6位数字验证码').fill('123456');
    await page.getByPlaceholder('至少6位新密码').fill('short');
    await page.locator('.modal-box button:has-text("重置密码")').click();
    await expectToast(page, '新密码至少6位');

    await page.getByPlaceholder('至少6位新密码').fill('newpass123');
    await page.getByPlaceholder('再次输入新密码').fill('different');
    await page.locator('.modal-box button:has-text("重置密码")').click();
    await expectToast(page, '两次输入的密码不一致');
  });

  test('step2 提交 → 密码本地哈希 + 验证成功关闭弹窗', async ({ page }) => {
    await page.route('**/api/auth/forgot-password/request', (route) =>
      route.fulfill({ json: { success: true, data: { message: 'ok' } } }));
    let verifyBody = null;
    await page.route('**/api/auth/forgot-password/verify', (route) => {
      verifyBody = route.request().postDataJSON();
      route.fulfill({ json: { success: true } });
    });

    await page.getByText('忘记密码？').click();
    await page.locator('#forgot-username').fill('admin');
    await page.locator('#forgot-email').fill('admin@lambs.local');
    await page.locator('.modal-box button:has-text("发送验证码")').click();
    await page.getByPlaceholder('请输入6位数字验证码').fill('123456');
    await page.getByPlaceholder('至少6位新密码').fill('newpass123');
    await page.getByPlaceholder('再次输入新密码').fill('newpass123');
    await page.locator('.modal-box button:has-text("重置密码")').click();

    await expectToast(page, '密码已重置，请使用新密码登录');
    expect(verifyBody.username).toBe('admin');
    expect(verifyBody.email).toBe('admin@lambs.local');
    expect(verifyBody.code).toBe('123456');
    expect(verifyBody.new_password).toMatch(/^[0-9a-f]{64}$/);
    await expect(page.locator('.modal-overlay.open')).toBeHidden();
  });

  test('step2 上一步 → 重新发送 → 冷却重新计时', async ({ page }) => {
    let requestCount = 0;
    await page.route('**/api/auth/forgot-password/request', (route) => {
      requestCount++;
      route.fulfill({ json: { success: true, data: { message: 'ok' } } });
    });
    await page.getByText('忘记密码？').click();
    await page.locator('#forgot-username').fill('admin');
    await page.locator('#forgot-email').fill('admin@lambs.local');
    await page.locator('.modal-box button:has-text("发送验证码")').click();
    await expect(page.locator('.modal-box', { hasText: '验证码已发送至' })).toBeVisible();

    // 冷却期间「重新发送」链接隐藏，只能走「上一步」
    await expect(page.locator('.modal-box', { hasText: '重置密码' }).getByText('重新发送')).toBeHidden();
    await page.locator('.modal-box button:has-text("上一步")').click();
    await expect(page.locator('.modal-box button:has-text("发送验证码")')).toBeVisible();

    await page.locator('.modal-box button:has-text("发送验证码")').click();
    await expect(page.locator('.modal-box', { hasText: '验证码已发送至' })).toBeVisible();
    expect(requestCount).toBe(2);
  });
});

test.describe('注册弹窗', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/Lambs/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.login-card', { timeout: 10000 });
    await page.getByText('注册新账号').click();
  });

  test('字段校验：用户名/邮箱/邮箱格式/密码长度', async ({ page }) => {
    await page.locator('.modal-box button:has-text("注册")').click();
    await expectToast(page, '请输入用户名');

    // #login-username 也是同占位符 → 限定在注册弹窗内
    await page.locator('.modal-box').getByPlaceholder('请输入用户名').fill('newuser');
    await page.locator('.modal-box button:has-text("注册")').click();
    await expectToast(page, '请输入邮箱');

    // 'a@b' 通过浏览器原生 email 校验、不满足应用正则（要求点号）→ 应用 toast 才触发；
    // 'not-an-email' 会被原生校验拦截，onSubmit 不执行
    await page.getByPlaceholder('请输入邮箱').fill('a@b');
    await page.getByPlaceholder('至少6位密码').fill('pass123');
    await page.locator('.modal-box button:has-text("注册")').click();
    await expectToast(page, '邮箱格式不正确');

    await page.getByPlaceholder('请输入邮箱').fill('newuser@lambs.local');
    await page.getByPlaceholder('至少6位密码').fill('123');
    await page.locator('.modal-box button:has-text("注册")').click();
    await expectToast(page, '密码至少6位');
  });

  test('合法表单 → 注册成功提示', async ({ page }) => {
    // #login-username 也是同占位符 → 限定在注册弹窗内
    await page.locator('.modal-box').getByPlaceholder('请输入用户名').fill('newuser');
    await page.getByPlaceholder('请输入邮箱').fill('newuser@lambs.local');
    await page.getByPlaceholder('至少6位密码').fill('pass123');
    await page.locator('.modal-box button:has-text("注册")').click();
    await expectToast(page, '注册成功！已自动登录');
  });
});

import { test, expect } from '@playwright/test';
import { loginAsAdmin, MOCK_AUDIT_LOGS } from './helpers.js';

// G 组缺口：设置页 密钥眼睛 / Logo 上传 / 导出 / 日志搜索筛选 / 加载失败禁保存

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('设置页 密钥可见性', () => {
  test('JWT 字段已移除 + SMTP 密钥眼睛切换明文/密文', async ({ page }) => {
    await loginAsAdmin(page, '/settings');
    // JWT 在 .env 配置，页面不再展示该字段 (QA 2026-08-29)
    await expect(page.locator('#cfg-jwt')).toHaveCount(0);

    const smtpInput = page.locator('#cfg-smtp-pass');
    await expect(smtpInput).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: '显示或隐藏 SMTP 授权码' }).click();
    await expect(smtpInput).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: '显示或隐藏 SMTP 授权码' }).click();
    await expect(smtpInput).toHaveAttribute('type', 'password');
  });
});

test.describe('设置页 品牌 Logo', () => {
  test('上传 Logo → localStorage 持久化 → 移除清空', async ({ page }) => {
    await loginAsAdmin(page, '/settings');
    await page.locator('input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1PX });

    // FileReader → dataURL → localStorage 是异步链路，webkit 下 setInputFiles 返回时可能未写完 —— poll 等待
    await expect.poll(() => page.evaluate(() => localStorage.getItem('lambs_brand_logo_img')))
      .toMatch(/^data:image\/png;base64,/);
    await expect(page.locator('.upload-zone img')).toBeVisible();
    await expect(page.getByText('移除')).toBeVisible();

    await page.getByText('移除').click();
    const after = await page.evaluate(() => localStorage.getItem('lambs_brand_logo_img'));
    expect(after).toBeNull();
    await expect(page.locator('.upload-zone img')).toHaveCount(0);
  });
});

test.describe('设置页 数据导出', () => {
  test('导出系统用户 → 下载 lambs-users.csv', async ({ page }) => {
    await loginAsAdmin(page, '/settings');
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    await page.locator('button:has-text("导出系统用户")').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('lambs-users.csv');
    await expect(page.locator('.toast').filter({ hasText: '导出完成' })).toBeVisible();
  });

  test('按项目导出用户 → 下载带项目名的 csv', async ({ page }) => {
    await loginAsAdmin(page, '/settings');
    let exportReq = '';
    await page.route('**/api/settings/export/project-users/**', (route) => {
      exportReq = route.request().url();
      route.fulfill({ contentType: 'text/csv', body: 'name,email\n张三,zhangsan@lambs.local' });
    });

    // 预滚动排掉异步 scroll 事件，否则面板打开瞬间被 scroll 监听器关闭（选项 detached）
    const exportTrigger = page.getByRole('button', { name: '按项目导出用户', exact: true });
    await exportTrigger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await exportTrigger.click();
    // 侧边栏「QA通关」nav 也是 role=button → 用 .last() 命中下拉面板选项（面板 portal 到 body 末尾）
    await page.getByRole('button', { name: 'QA通关', exact: true }).last().click();

    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    // has-text("导出") 会命中「按项目导出用户/导出系统用户」→ 用精确名称
    await page.getByRole('button', { name: '导出', exact: true }).click();
    const download = await downloadPromise;
    // 契约断言：请求打对端点 + 下载事件触发。文件名来自 blob 的 a[download]
    // 属性，webkit 对 blob 下载不暴露 suggestedFilename（恒空）——不做
    // 文件名断言（chromium/firefox 下 a.download=lambs-project-users/qa-tools-hub.csv）。
    expect(exportReq).toContain('project-users/qa-tools-hub');
    const fn = download.suggestedFilename();
    if (fn) {
      expect(fn).toContain('qa-tools-hub');
    }
  });
});

test.describe('设置页 操作日志', () => {
  test('搜索 + 类型筛选 → 计数变化 → 无匹配占位', async ({ page }) => {
    await loginAsAdmin(page, '/settings');
    await expect(page.getByText(`共 ${MOCK_AUDIT_LOGS.length} 条`)).toBeVisible();

    // 搜索关键词命中 target
    await page.getByLabel('搜索日志').fill('张三');
    await page.waitForTimeout(400); // debounce
    await expect(page.getByText('共 1 条')).toBeVisible();

    // 先清空搜索词 —— 筛选与搜索是 AND 关系，保留「张三」会把新增项目筛空
    await page.getByLabel('搜索日志').fill('');
    await page.waitForTimeout(400);

    // 类型筛选：新增项目 → 1 条（预滚动排掉异步 scroll 事件，同导出测试）
    const filterTrigger = page.getByRole('button', { name: '全部操作', exact: true });
    await filterTrigger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await filterTrigger.click();
    await page.getByRole('button', { name: '新增项目', exact: true }).click();
    await expect(page.getByText('共 1 条')).toBeVisible();
    await expect(page.locator('.card', { hasText: '操作日志' })).toContainText('PetTrust');

    // 组合筛选无匹配
    await page.getByLabel('搜索日志').fill('不存在的关键词');
    await page.waitForTimeout(400);
    await expect(page.getByText('— 暂无匹配的操作记录 —')).toBeVisible();
  });
});

test.describe('设置页 配置加载失败', () => {
  test('配置加载失败 → 保存禁用 → 重试恢复', async ({ page }) => {
    await loginAsAdmin(page, '/settings');
    let fail = true;
    await page.route('**/api/settings/config', (route) => {
      if (route.request().method() === 'PUT') { route.continue(); return; }
      if (fail) {
        fail = false;
        route.fulfill({ status: 500, json: { detail: 'boom' } });
        return;
      }
      route.fulfill({ json: { success: true, data: { jwt_secret: 'lambs-jwt-secret-key', admin_email: 'admin@lambs.local', port: 3602, refresh_interval: 30 } } });
    });
    await page.reload();

    await expect(page.locator('.settings-save-bar')).toContainText('配置加载失败 — 保存已禁用');
    await expect(page.locator('.settings-save-bar button:has-text("保存配置")')).toBeDisabled();

    await page.locator('.settings-save-bar button:has-text("重试")').click();
    await expect(page.locator('.settings-save-bar')).not.toContainText('配置加载失败');
    await expect(page.locator('.settings-save-bar button:has-text("保存配置")')).toBeEnabled();
  });
});

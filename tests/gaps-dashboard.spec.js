import { test, expect } from '@playwright/test';
import { loginAsAdmin, MOCK_PROJECTS } from './helpers.js';

// E 组缺口：仪表盘 更多菜单 / 批量栏 / 拖拽排序 / 最近动态 / 加载失败重试 / 空态
// 注意：第一张卡 QA通关 is_pinned:true，更多菜单第 4 项是「取消置顶」。

const expectToast = (page, text) => expect(page.locator('.toast').filter({ hasText: text })).toBeVisible();

test.describe('仪表盘 卡片更多菜单', () => {
  test('更多菜单 5 项齐全 → 编辑项目打开抽屉', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    await page.locator('.project-card-more').first().click();
    const items = page.locator('.dropdown.open .dd-item');
    await expect(items).toHaveCount(5);
    await expect(items).toContainText(['编辑项目', '克隆项目', '停用项目', '取消置顶', '删除项目']);

    await items.filter({ hasText: '编辑项目' }).click();
    await expect(page.locator('.drawer[role="dialog"]')).toContainText('编辑项目·QA通关');
  });

  test('更多菜单 克隆项目 → POST /clone + 成功提示', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    let cloneUrl = null;
    await page.route('**/api/projects/qa-tools-hub/clone', (route) => {
      cloneUrl = route.request().url();
      route.fulfill({ json: { success: true, data: { name: '克隆测试' } } });
    });

    await page.locator('.project-card-more').first().click();
    await page.locator('.dropdown.open .dd-item:has-text("克隆项目")').click();
    await expectToast(page, '已克隆为「克隆测试」');
    expect(cloneUrl).toContain('/api/projects/qa-tools-hub/clone');
  });

  test('更多菜单 停用项目 → 弹窗确认 → 取消不调接口', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    let patchCount = 0;
    await page.route('**/api/projects/*/status', (route) => {
      patchCount++;
      route.fulfill({ json: { success: true } });
    });

    await page.locator('.project-card-more').first().click();
    await page.locator('.dropdown.open .dd-item:has-text("停用项目")').click();
    await expect(page.locator('.modal-title')).toHaveText('停用项目');
    await page.locator('.modal-box button:has-text("取消")').click();
    await expect(page.locator('.modal-box')).toBeHidden();
    expect(patchCount).toBe(0);
  });

  test('更多菜单 取消置顶 → PATCH pin + 提示', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    let pinUrl = null;
    await page.route('**/api/projects/*/pin', (route) => {
      pinUrl = route.request().url();
      route.fulfill({ json: { success: true, data: { is_pinned: false } } });
    });

    await page.locator('.project-card-more').first().click();
    await page.locator('.dropdown.open .dd-item:has-text("取消置顶")').click();
    await expectToast(page, '已取消置顶');
    expect(pinUrl).toContain('/api/projects/qa-tools-hub/pin');
  });
});

test.describe('仪表盘 批量栏', () => {
  test('选择 2 项 → 批量停用 → PATCH×2 + 批量栏收起', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    const patches = [];
    await page.route('**/api/projects/*/status', (route) => {
      if (route.request().method() === 'PATCH') {
        patches.push({ url: route.request().url(), body: route.request().postDataJSON() });
      }
      route.fulfill({ json: { success: true, data: { status: 'offline' } } });
    });

    await page.locator('.card-header button:has-text("选择")').click();
    await expect(page.locator('.batch-bar')).toBeVisible();
    await page.locator('.project-card').nth(0).click();
    await page.locator('.project-card').nth(1).click();
    await expect(page.locator('.batch-bar')).toContainText('已选 2 / 5 项');

    await page.locator('.batch-bar button:has-text("批量停用")').click();
    await expectToast(page, '已停用');
    expect(patches).toHaveLength(2);
    expect(patches.every(p => p.body.status === 'offline')).toBe(true);
    await expect(page.locator('.batch-bar')).toBeHidden();
  });

  test('选择 2 项 → 批量删除 → 确认 → DELETE×2', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    const deleted = [];
    await page.route('**/api/projects/*', (route) => {
      if (route.request().method() === 'DELETE') deleted.push(route.request().url());
      route.fulfill({ json: { success: true } });
    });

    await page.locator('.card-header button:has-text("选择")').click();
    await page.locator('.project-card').nth(0).click();
    await page.locator('.project-card').nth(1).click();
    await page.locator('.batch-bar button:has-text("批量删除")').click();
    await expect(page.locator('.modal-title')).toContainText('批量删除');
    await page.locator('.modal-box button:has-text("确认")').click();

    await expectToast(page, '已删除');
    expect(deleted).toHaveLength(2);
    expect(deleted[0]).toContain('/api/projects/qa-tools-hub');
    expect(deleted[1]).toContain('/api/projects/tg-cloud-drive');
    await expect(page.locator('.batch-bar')).toBeHidden();
  });
});

test.describe('仪表盘 拖拽排序', () => {
  test('拖拽卡片 → localStorage 持久化 → 刷新后顺序生效', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    await expect(page.locator('.project-card')).toHaveCount(5);

    // HTML5 DnD 在无头模式下不可靠，直接派发 drop 事件模拟 (R23 同款 DataTransfer)
    await page.evaluate(() => {
      const cards = document.querySelectorAll('.project-card');
      const dt = new DataTransfer();
      dt.setData('text/plain', 'qa-tools-hub');
      cards[2].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lambs-project-order')));
    expect(saved).toEqual(['tg-cloud-drive', 'subsai', 'qa-tools-hub', 'smb-ai-os', 'silver-guardian']);
    await expect(page.locator('.project-card').first()).toContainText('TG云盘');

    await page.reload();
    await expect(page.locator('.project-card').first()).toContainText('TG云盘');
  });
});

test.describe('仪表盘 最近动态', () => {
  test('展开动态列表 → 点击目标跳转项目详情', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    // 覆盖为项目型动态（切换状态 → 跳转 /project/:id），reload 后生效
    await page.route('**/api/settings/audit-logs', (route) =>
      route.fulfill({ json: { success: true, data: { logs: [{ id: 'x1', created_at: '2026-08-27T10:00:00', action: '切换状态', target: 'qa-tools-hub', detail: '项目已上线' }] } } }));
    await page.reload();

    const header = page.locator('.card-header', { hasText: '最近动态' });
    await expect(header).toContainText('(1条)');
    await expect(header).toContainText('展开');

    await header.click();
    await expect(header).toContainText('收起');
    const row = page.locator('.card', { hasText: '最近动态' }).getByText('qa-tools-hub');
    await expect(row).toBeVisible();
    await expect(page.locator('.card', { hasText: '最近动态' })).toContainText('切换状态');

    await row.click();
    await page.waitForURL('**/project/qa-tools-hub', { timeout: 5000 });
  });

  test('无动态时不渲染最近动态卡片', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    await page.route('**/api/settings/audit-logs', (route) =>
      route.fulfill({ json: { success: true, data: { logs: [] } } }));
    await page.reload();
    await expect(page.locator('.card', { hasText: '最近动态' })).toHaveCount(0);
  });
});

test.describe('仪表盘 加载失败与空态', () => {
  test('项目列表加载失败 → 重试 → 恢复渲染', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    let calls = 0;
    await page.route(/\/api\/projects(\?.*)?$/, (route) => {
      // StrictMode 下挂载 effect 触发两次请求 → 前两次都失败，错误态才稳定
      if (calls++ < 2) {
        route.fulfill({ status: 500, json: { detail: 'boom' } });
        return;
      }
      route.fulfill({ json: { success: true, data: { projects: MOCK_PROJECTS, total: MOCK_PROJECTS.length } } });
    });
    await page.reload();

    await expect(page.getByText('项目加载失败')).toBeVisible();
    await page.getByRole('button', { name: '重试' }).click();
    await expect(page.locator('.project-card')).toHaveCount(MOCK_PROJECTS.length);
    await expect(page.getByText('项目加载失败')).toBeHidden();
  });

  test('搜索无结果 → 空态提示', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    await page.getByPlaceholder('搜索项目名称或仓库…').fill('zzz不存在的项目');
    await page.waitForTimeout(400); // debounce
    await expect(page.getByText('未找到匹配的项目')).toBeVisible();
    await expect(page.locator('.project-card')).toHaveCount(0);
  });
});

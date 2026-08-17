import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers.js';

const MOCK_TASKS = [
  { id: 't1', project_id: 'qa-tools-hub', name: '每日扫描', cron: '0 2 * * *', command: 'python main.py --target 127.0.0.1', host: 'windows', enabled: true, last_run_at: '2026-08-18 02:00:00', last_status: 'success', last_log: 'scan done\n2 modules finished' },
  { id: 't2', project_id: 'qa-tools-hub', name: '健康检查', cron: '*/5 * * * *', command: 'echo ok', host: 'app1', enabled: false, last_run_at: '', last_status: '', last_log: '' },
];

test.describe('计划任务面板', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/project/qa-tools-hub');
    await page.route('**/api/projects/qa-tools-hub/tasks', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { success: true, data: { tasks: MOCK_TASKS } } });
      } else {
        await route.fulfill({ json: { success: true, data: { id: 't3' } } });
      }
    });
    await page.route('**/api/tasks/*/run', async (route) => {
      await route.fulfill({ json: { success: true, data: { started: 't1' } } });
    });
  });

  test('打开计划任务 tab → 显示任务列表', async ({ page }) => {
    await page.locator('.tab-item:has-text("计划任务")').click();
    await expect(page.locator('text=每日扫描')).toBeVisible();
    await expect(page.locator('text=健康检查')).toBeVisible();
    await expect(page.locator('.task-item').first()).toContainText('windows');
    await expect(page.locator('.task-item').first()).toContainText('成功');
  });

  test('新建任务 → 表单提交正确 body', async ({ page }) => {
    let postBody = null;
    await page.route('**/api/projects/qa-tools-hub/tasks', async (route) => {
      if (route.request().method() === 'POST') {
        postBody = route.request().postDataJSON();
        await route.fulfill({ json: { success: true, data: { id: 't3' } } });
      } else {
        await route.fulfill({ json: { success: true, data: { tasks: MOCK_TASKS } } });
      }
    });
    await page.locator('.tab-item:has-text("计划任务")').click();
    await page.locator('button:has-text("新建任务")').click();
    await page.locator('.field:has-text("任务名") input').fill('新任务');
    await page.locator('.field:has-text("cron") input').fill('*/10 * * * *');
    await page.locator('.field:has-text("命令") textarea, .field:has-text("命令") input').fill('echo new');
    await page.locator('button:has-text("保存")').click();
    await expect.poll(() => postBody).not.toBeNull();
    expect(postBody.name).toBe('新任务');
    expect(postBody.cron).toBe('*/10 * * * *');
    expect(postBody.command).toBe('echo new');
  });

  test('立即运行 → 调 run 接口并展示日志', async ({ page }) => {
    await page.locator('.tab-item:has-text("计划任务")').click();
    await page.locator('.task-item').first().locator('button:has-text("运行")').click();
    await page.locator('.task-item').first().locator('button:has-text("日志")').click();
    await expect(page.locator('text=scan done')).toBeVisible();
  });
});

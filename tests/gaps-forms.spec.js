import { test, expect } from '@playwright/test';
import { loginAsAdmin, MOCK_USERS } from './helpers.js';

// D 组缺口：ProjectForm / UserForm 全字段提交链路
// 此前从未断言提交 body 形状。哈希密码仅断言十六进制形状，不校验算法。

const expectToast = (page, text) => expect(page.locator('.toast').filter({ hasText: text })).toBeVisible();
const clickConfirm = (page) => page.locator('.modal-box button:has-text("确认")').click();
const HEX = /^[0-9a-f]+$/;

test.describe('ProjectForm 新增项目', () => {
  test('全字段填写 → POST /projects 完整 body 断言', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    let postBody = null;
    await page.route(/\/api\/projects(\?.*)?$/, (route) => {
      if (route.request().method() === 'POST') postBody = route.request().postDataJSON();
      route.fulfill({ json: { success: true } });
    });

    await page.locator('button:has-text("+ 新增项目")').click();
    await expect(page.locator('.drawer[role="dialog"]')).toContainText('新增项目');

    // 基本信息
    await page.getByPlaceholder('请输入项目名称').fill('测试新项目');
    await page.locator('input[name="gh-repo"]').fill('test-new-proj');
    await page.getByPlaceholder('请输入项目描述').fill('E2E 表单测试项目');
    await page.getByPlaceholder('请输入技术栈').fill('Node.js');
    await page.getByPlaceholder('如：AI, 后端, 内部工具').fill('AI, 测试');

    // 数据源：先填连接串触发类型自动识别，再显式切换类型
    await page.locator('input[placeholder*="postgres://"]').fill('redis://127.0.0.1:6379/0');
    const typeTrigger = page.getByRole('button', { name: 'Redis', exact: true });
    await expect(typeTrigger).toBeVisible(); // 自动识别为 Redis
    await typeTrigger.click();
    await page.getByRole('button', { name: 'Redis（KV型）', exact: true }).click();

    // 访问与进程
    await page.getByPlaceholder('留空自动分配').fill('8080');
    await page.getByPlaceholder('如 /my-project').fill('/test');
    await page.getByPlaceholder('如 my-api').fill('test-api');
    await page.getByPlaceholder('如 http://localhost:3000/health').fill('http://localhost:3000/health');
    await page.getByPlaceholder(/cd \/home\/ubuntu\/apps\/myapp/).fill('cd /home/ubuntu/apps/test && ./start');
    await page.getByPlaceholder('该项目已被管理员暂时关闭，请稍后再试。').fill('维护中');

    // 备份
    await page.getByPlaceholder('如：24').fill('24');
    await page.getByPlaceholder('如：30').fill('30');

    await page.locator('.form-actions-sticky button:has-text("确认接入")').click();
    await expectToast(page, '测试新项目 已成功接入');

    expect(postBody).toEqual({
      name: '测试新项目',
      repo: 'test-new-proj',
      description: 'E2E 表单测试项目',
      stack: 'Node.js',
      port: '8080',
      db_type: 'Redis（KV型）',
      dsn: 'redis://127.0.0.1:6379/0',
      datasources: [{ id: 'ds1', name: '主数据源', type: 'Redis（KV型）', dsn: 'redis://127.0.0.1:6379/0', is_primary: true }],
      services: [],
      base_path: '/test',
      service_name: 'test-api',
      startup_command: 'cd /home/ubuntu/apps/test && ./start',
      health_url: 'http://localhost:3000/health',
      offline_msg: '维护中',
      icon_url: null,
      tags: ['AI', '测试'],
      backup_interval_hours: 24,
      backup_retention_days: 30,
    });
  });

  test('提交校验：名称必填 → 数据源必填 → 端口范围', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    await page.locator('button:has-text("+ 新增项目")').click();

    await page.locator('.form-actions-sticky button:has-text("确认接入")').click();
    await expect(page.locator('.field-error-msg')).toContainText('项目名称为必填');

    await page.getByPlaceholder('请输入项目名称').fill('空壳项目');
    await page.locator('input[name="gh-repo"]').fill('test-project'); // 中文名无法自动生成仓库名，先手动填才能走到数据源校验
    await page.locator('.form-actions-sticky button:has-text("确认接入")').click();
    await expect(page.locator('.field-error-msg')).toContainText('需填写数据源连接串');

    await page.locator('input[placeholder*="postgres://"]').fill('sqlite:///x.db');
    await page.getByPlaceholder('留空自动分配').fill('99999');
    await page.locator('.form-actions-sticky button:has-text("确认接入")').click();
    await expect(page.locator('.field-error-msg')).toContainText('端口号需在 1-65535 之间');
  });

  test('已填内容点取消 → 确认弹窗 → 抽屉关闭', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard');
    await page.locator('button:has-text("+ 新增项目")').click();
    await page.getByPlaceholder('请输入项目名称').fill('将被放弃');

    await page.locator('.form-actions-sticky button:has-text("取消")').click();
    await expect(page.locator('.modal-title')).toContainText('放弃修改');
    await clickConfirm(page);

    await expect(page.locator('.drawer[role="dialog"]')).toBeHidden();
  });
});

test.describe('UserForm 新增用户', () => {
  test('全字段填写 → POST /users body 断言（密码本地哈希）', async ({ page }) => {
    await loginAsAdmin(page, '/users');
    let postBody = null;
    await page.route(/\/api\/users(\?.*)?$/, (route) => {
      if (route.request().method() === 'POST') postBody = route.request().postDataJSON();
      route.fulfill({ json: { success: true, data: { password: 'auto1234' } } });
    });

    await page.locator('button:has-text("+ 新增用户")').click();
    await expect(page.locator('.drawer[role="dialog"]')).toContainText('新增用户');

    await page.getByPlaceholder('请输入用户名').fill('wangwu');
    await page.getByPlaceholder('请输入姓名').fill('王五');
    await page.getByPlaceholder('请输入邮箱').fill('wangwu@lambs.local');
    await page.getByPlaceholder('至少6位，留空自动生成').fill('123456');
    await page.getByPlaceholder('再次输入密码').fill('123456');

    // 角色切到项目管理员
    await page.getByRole('button', { name: '查看者', exact: true }).click();
    await page.getByRole('button', { name: '项目管理员', exact: true }).click();

    // 勾选一个项目访问权限
    await page.locator('input#pa-qa-tools-hub').check();

    await page.locator('.drawer-actions button:has-text("保存")').click();
    // 接口返回 password → 走 newPassword 分支 → 只提示「用户已创建」
    await expectToast(page, '用户已创建');

    expect(postBody.username).toBe('wangwu');
    expect(postBody.name).toBe('王五');
    expect(postBody.email).toBe('wangwu@lambs.local');
    expect(postBody.role).toBe('project_admin');
    expect(postBody.project_access).toBe('["qa-tools-hub"]');
    expect(postBody.avatar_url).toBeNull();
    expect(postBody.password).toMatch(HEX);
    expect(postBody.salt).toMatch(HEX);
  });

  test('密码校验：过短与不一致 → error toast，不发请求', async ({ page }) => {
    await loginAsAdmin(page, '/users');
    let postCount = 0;
    await page.route(/\/api\/users(\?.*)?$/, (route) => {
      if (route.request().method() === 'POST') postCount++;
      route.fulfill({ json: { success: true } });
    });

    await page.locator('button:has-text("+ 新增用户")').click();
    await page.getByPlaceholder('请输入用户名').fill('wangwu');
    await page.getByPlaceholder('请输入姓名').fill('王五');
    await page.getByPlaceholder('请输入邮箱').fill('wangwu@lambs.local');
    await page.getByPlaceholder('至少6位，留空自动生成').fill('123');
    await page.getByPlaceholder('再次输入密码').fill('123');
    await page.locator('.drawer-actions button:has-text("保存")').click();
    await expectToast(page, '密码至少6位');

    await page.getByPlaceholder('至少6位，留空自动生成').fill('123456');
    await page.getByPlaceholder('再次输入密码').fill('654321');
    await page.locator('.drawer-actions button:has-text("保存")').click();
    await expectToast(page, '两次密码不一致');

    expect(postCount).toBe(0);
  });
});

test.describe('UserForm 编辑用户', () => {
  const mockUsersWithUsername = async (page) => {
    await page.route(/\/api\/users(\?.*)?$/, (route) => {
      if (route.request().method() !== 'GET') { route.continue(); return; }
      const list = MOCK_USERS.map(u => (u.id === 'u_002' ? { ...u, username: 'zhangsan', status: 'active' } : u));
      route.fulfill({ json: { success: true, data: { users: list, counts: { all: 3, super_admin: 1, project_admin: 1, viewer: 1 } } } });
    });
  };

  test('编辑用户 → PUT /users/:id body 断言', async ({ page }) => {
    await loginAsAdmin(page, '/users');
    await mockUsersWithUsername(page);
    await page.reload(); // 挂载请求在 mock 注册前已发出 → reload 让列表带 username
    let putBody = null;
    await page.route(/\/api\/users\/u_002$/, (route) => {
      if (route.request().method() === 'PUT') putBody = route.request().postDataJSON();
      route.fulfill({ json: { success: true } });
    });

    await page.locator('.tbl-row', { hasText: '张三' }).getByText('编辑').click();
    await expect(page.locator('.drawer[role="dialog"]')).toContainText('编辑用户·张三');
    await expect(page.getByPlaceholder('请输入用户名')).toHaveValue('zhangsan');

    await page.getByPlaceholder('请输入姓名').fill('张三丰');
    await page.getByRole('button', { name: '正常', exact: true }).click();
    await page.getByRole('button', { name: '禁用', exact: true }).click();

    await page.locator('.drawer-actions button:has-text("保存")').click();
    await expectToast(page, '张三丰 已更新');

    expect(putBody.username).toBe('zhangsan');
    expect(putBody.name).toBe('张三丰');
    expect(putBody.role).toBe('project_admin');
    expect(putBody.status).toBe('disabled');
    expect(putBody.avatar_url).toBeNull();
  });

  test('编辑含修改密码 → 原/新密码均本地哈希后提交', async ({ page }) => {
    await loginAsAdmin(page, '/users');
    await mockUsersWithUsername(page);
    await page.reload(); // 挂载请求在 mock 注册前已发出 → reload 让列表带 username
    await page.route(/\/api\/auth\/salt\?username=/, (route) =>
      route.fulfill({ json: { success: true, data: { salt: 'a'.repeat(64) } } }));
    let putBody = null;
    await page.route(/\/api\/users\/u_002$/, (route) => {
      if (route.request().method() === 'PUT') putBody = route.request().postDataJSON();
      route.fulfill({ json: { success: true } });
    });

    await page.locator('.tbl-row', { hasText: '张三' }).getByText('编辑').click();
    await page.getByText('+ 修改密码').click();
    await page.getByPlaceholder('输入当前密码以验证').fill('old123');
    await page.getByPlaceholder('输入新密码，至少6位').fill('new123');
    await page.getByPlaceholder('再次输入新密码').fill('new123');

    await page.locator('.drawer-actions button:has-text("保存")').click();
    await expectToast(page, '张三 已更新（含密码）');

    expect(putBody.password).toMatch(HEX);
    expect(putBody.old_password).toMatch(HEX);
    expect(putBody.password).not.toBe(putBody.old_password);
  });
});

import { test, expect } from '@playwright/test';
import { loginAsAdmin, MOCK_PROJECTS } from './helpers.js';

// C 组缺口：DocView (MongoDB) / KVView (Redis) / VectorView (Qdrant)
// 三个数据浏览视图此前零覆盖。均通过覆盖项目 db_type 驱动视图切换。

const expectToast = (page, text) => expect(page.locator('.toast').filter({ hasText: text })).toBeVisible();
const clickConfirm = (page) => page.locator('.modal-box button:has-text("确认")').click();

// 覆盖项目详情为指定 db_type，并脚本化 tables/list + tables 端点
async function openView(page, dbType, tablesRoute, tablesDataRoute) {
  await loginAsAdmin(page, '/project/qa-tools-hub');
  await page.route(/\/api\/projects\/qa-tools-hub$/, (route) =>
    route.fulfill({ json: { success: true, data: { ...MOCK_PROJECTS[0], db_type: dbType, dsn: 'mock:///db' } } }));
  await page.route(/\/api\/projects\/qa-tools-hub\/tables\/list/, (route) =>
    route.fulfill({ json: { success: true, data: { tables: tablesRoute } } }));
  await page.route(/\/api\/projects\/qa-tools-hub\/tables\?/, (route) => tablesDataRoute(route));
  await page.reload();
}

const DOCS = {
  users: [{ _id: '1', name: 'Alice', age: 30 }, { _id: '2', name: 'Bob', age: 25 }],
  orders: [{ _id: 'o1', total: 99.5 }],
};

test.describe('DocView MongoDB 文档浏览', () => {
  test('选择集合 → 文档 JSON 树渲染 + 分页信息', async ({ page }) => {
    await openView(page, 'MongoDB', ['users', 'orders'], (route) => {
      const u = new URL(route.request().url());
      const table = u.searchParams.get('table') || '';
      const search = u.searchParams.get('search') || '';
      const docs = DOCS[table] || [];
      const rows = search ? docs.filter(d => JSON.stringify(d).toLowerCase().includes(search.toLowerCase())) : docs;
      route.fulfill({ json: { success: true, data: { rows, total: rows.length, pk: '_id' } } });
    });

    await page.getByRole('button', { name: '选择集合…' }).click();
    await page.getByRole('button', { name: 'users', exact: true }).click();
    await expect(page.getByText('_id: 1')).toBeVisible();
    await expect(page.getByText('Alice')).toBeVisible();
    await expect(page.getByText('_id: 2')).toBeVisible();
    await expect(page.getByText('共 2 行')).toBeVisible();
  });

  test('搜索文档走服务端参数 + 结果过滤', async ({ page }) => {
    let lastSearch = null;
    await openView(page, 'MongoDB', ['users'], (route) => {
      const u = new URL(route.request().url());
      lastSearch = u.searchParams.get('search') || '';
      const search = lastSearch;
      const docs = DOCS.users;
      const rows = search ? docs.filter(d => JSON.stringify(d).toLowerCase().includes(search.toLowerCase())) : docs;
      route.fulfill({ json: { success: true, data: { rows, total: rows.length, pk: '_id' } } });
    });
    await page.getByRole('button', { name: '选择集合…' }).click();
    await page.getByRole('button', { name: 'users', exact: true }).click();
    await expect(page.getByText('Bob')).toBeVisible();

    await page.locator('input[placeholder^="搜索 users"]').fill('Bob');
    await page.waitForTimeout(400); // debounce
    expect(lastSearch).toBe('Bob');
    await expect(page.getByText('Alice')).toBeHidden();
    await expect(page.getByText('Bob')).toBeVisible();
  });

  test('新增文档 → POST JSON 体 + 成功提示', async ({ page }) => {
    let postBody = null;
    await openView(page, 'MongoDB', ['users'], (route) => {
      const u = new URL(route.request().url());
      const search = u.searchParams.get('search') || '';
      const rows = search ? [] : DOCS.users;
      route.fulfill({ json: { success: true, data: { rows, total: rows.length, pk: '_id' } } });
    });
    await page.route(/\/api\/projects\/qa-tools-hub\/data\/row\?table=users/, (route) => {
      if (route.request().method() === 'POST') postBody = route.request().postDataJSON();
      route.fulfill({ json: { success: true } });
    });
    await page.getByRole('button', { name: '选择集合…' }).click();
    await page.getByRole('button', { name: 'users', exact: true }).click();

    await page.locator('button:has-text("+ 新增文档")').click();
    await expect(page.locator('.modal-title')).toContainText('新增文档 · users');
    await page.locator('.modal-box textarea').fill('{"_id":"3","name":"Carol"}');
    await page.locator('.modal-box button:has-text("新增")').click();

    await expectToast(page, '文档已新增');
    expect(postBody).toEqual({ _id: '3', name: 'Carol' });
  });

  test('编辑文档 → PUT（去掉 _id 主键）+ 成功提示', async ({ page }) => {
    let putUrl = null;
    let putBody = null;
    await openView(page, 'MongoDB', ['users'], (route) =>
      route.fulfill({ json: { success: true, data: { rows: DOCS.users, total: 2, pk: '_id' } } }));
    await page.route(/\/api\/projects\/qa-tools-hub\/data\/row\?table=users/, (route) => {
      if (route.request().method() === 'PUT') {
        putUrl = route.request().url();
        putBody = route.request().postDataJSON();
      }
      route.fulfill({ json: { success: true } });
    });
    await page.getByRole('button', { name: '选择集合…' }).click();
    await page.getByRole('button', { name: 'users', exact: true }).click();

    // 行内 编辑/删除 是 span，外层 flex span（gap:10px）包装；项目页头按钮同在 main 内 →
    // 用包装 span 精确定位（首个文档 _id=1）
    await page.locator('main span[style*="gap: 10px"]').first().getByText('编辑', { exact: true }).click();
    await expect(page.locator('.modal-title')).toContainText('编辑文档 · users');
    await page.locator('.modal-box textarea').fill('{"_id":"1","name":"Alice2","age":31}');
    await page.locator('.modal-box button:has-text("保存")').click();

    await expectToast(page, '文档已更新');
    expect(putUrl).toContain('pkval=1');
    expect(putBody).toEqual({ name: 'Alice2', age: 31 });
  });

  test('删除文档 → 确认 → DELETE + 成功提示', async ({ page }) => {
    let deleteUrl = null;
    await openView(page, 'MongoDB', ['users'], (route) =>
      route.fulfill({ json: { success: true, data: { rows: DOCS.users, total: 2, pk: '_id' } } }));
    await page.route(/\/api\/projects\/qa-tools-hub\/data\/row\?table=users/, (route) => {
      if (route.request().method() === 'DELETE') deleteUrl = route.request().url();
      route.fulfill({ json: { success: true } });
    });
    await page.getByRole('button', { name: '选择集合…' }).click();
    await page.getByRole('button', { name: 'users', exact: true }).click();

    await page.locator('main span[style*="gap: 10px"]').first().getByText('删除', { exact: true }).click();
    await expect(page.locator('.modal-title')).toContainText('删除文档');
    await clickConfirm(page);

    await expectToast(page, '文档已删除');
    expect(deleteUrl).toContain('pk=_id&pkval=1');
  });
});

const KV_DATA = {
  config: [{ key: 'config', type: 'string', value: 'hello world' }],
  hash1: [{ key: 'hash1', type: 'hash', field: 'f1', value: 'v1' }],
};

test.describe('KVView Redis 键值浏览', () => {
  test('选择键 → 类型徽标 + 值渲染', async ({ page }) => {
    await openView(page, 'Redis', ['config', 'hash1'], (route) => {
      const u = new URL(route.request().url());
      const table = u.searchParams.get('table') || '';
      route.fulfill({ json: { success: true, data: { rows: KV_DATA[table] || [], total: (KV_DATA[table] || []).length } } });
    });
    await page.getByRole('button', { name: '选择键…' }).click();
    await page.getByRole('button', { name: 'config', exact: true }).click();
    await expect(page.getByText('类型:')).toBeVisible();
    await expect(page.getByText('String', { exact: true })).toBeVisible();
    await expect(page.getByText('hello world')).toBeVisible();
  });

  test('编辑 string 值 → PUT + 成功提示', async ({ page }) => {
    let putUrl = null;
    let putBody = null;
    await openView(page, 'Redis', ['config'], (route) =>
      route.fulfill({ json: { success: true, data: { rows: KV_DATA.config, total: 1 } } }));
    await page.route(/\/api\/projects\/qa-tools-hub\/data\/row\?table=config/, (route) => {
      if (route.request().method() === 'PUT') {
        putUrl = route.request().url();
        putBody = route.request().postDataJSON();
      }
      route.fulfill({ json: { success: true } });
    });
    await page.getByRole('button', { name: '选择键…' }).click();
    await page.getByRole('button', { name: 'config', exact: true }).click();

    // 页头「编辑」按钮也在 main 内 → 用 string 值卡的 margin-top:8px 容器精确定位
    await page.locator('main div[style*="margin-top: 8px"]').getByRole('button', { name: '编辑' }).click();
    await page.locator('textarea').fill('updated value');
    await page.locator('main').getByRole('button', { name: '保存' }).click();

    await expectToast(page, '已保存');
    expect(putUrl).toContain('pk=key&pkval=config');
    expect(putBody).toEqual({ type: 'string', value: 'updated value' });
  });

  test('Hash 键渲染字段表 + 添加字段 → POST', async ({ page }) => {
    let postBody = null;
    await openView(page, 'Redis', ['hash1'], (route) =>
      route.fulfill({ json: { success: true, data: { rows: KV_DATA.hash1, total: 1 } } }));
    await page.route(/\/api\/projects\/qa-tools-hub\/data\/row\?table=hash1/, (route) => {
      if (route.request().method() === 'POST') postBody = route.request().postDataJSON();
      route.fulfill({ json: { success: true } });
    });
    await page.getByRole('button', { name: '选择键…' }).click();
    await page.getByRole('button', { name: 'hash1', exact: true }).click();
    await expect(page.getByText('f1')).toBeVisible();
    await expect(page.getByText('v1')).toBeVisible();

    await page.locator('button:has-text("+ 添加字段")').click();
    await page.locator('input[name="field"]').fill('f2');
    await page.locator('input[name="value"]').fill('v2');
    await page.locator('button:has-text("添加")').click();

    await expectToast(page, '已添加');
    expect(postBody.type).toBe('hash');
    expect(postBody.field).toBe('f2');
  });

  test('新增键 → POST（键名作 table）+ 空结果占位', async ({ page }) => {
    let postUrl = null;
    let postBody = null;
    // 新增键后组件会按新键名重新拉取 → 路由必须按 table 参数区分返回
    await openView(page, 'Redis', ['config'], (route) => {
      const u = new URL(route.request().url());
      const table = u.searchParams.get('table') || '';
      route.fulfill({ json: { success: true, data: { rows: KV_DATA[table] || [], total: (KV_DATA[table] || []).length } } });
    });
    await page.route(/\/api\/projects\/qa-tools-hub\/data\/row\?table=/, (route) => {
      if (route.request().method() === 'POST') {
        postUrl = route.request().url();
        postBody = route.request().postDataJSON();
      }
      route.fulfill({ json: { success: true } });
    });
    await page.getByRole('button', { name: '选择键…' }).click();
    await page.getByRole('button', { name: 'config', exact: true }).click();

    await page.locator('button:has-text("+ 新增键")').click();
    await expect(page.locator('.modal-title')).toContainText('新增键');
    await page.locator('input[name="key"]').fill('newkey');
    await page.locator('input[name="value"]').fill('abc');
    await page.locator('.modal-box button:has-text("创建")').click();

    await expectToast(page, '键已创建');
    expect(postUrl).toContain('table=newkey');
    expect(postBody).toEqual({ type: 'string', value: 'abc' });
    await expect(page.getByText('键不存在或已过期')).toBeVisible();
  });

  test('删除键 → 确认 → DELETE + 回到空提示', async ({ page }) => {
    let deleteUrl = null;
    await openView(page, 'Redis', ['config'], (route) =>
      route.fulfill({ json: { success: true, data: { rows: KV_DATA.config, total: 1 } } }));
    await page.route(/\/api\/projects\/qa-tools-hub\/data\/row\?table=config/, (route) => {
      if (route.request().method() === 'DELETE') deleteUrl = route.request().url();
      route.fulfill({ json: { success: true } });
    });
    await page.getByRole('button', { name: '选择键…' }).click();
    await page.getByRole('button', { name: 'config', exact: true }).click();

    await page.locator('button:has-text("删除键")').click();
    await expect(page.locator('.modal-title')).toContainText('删除键');
    await clickConfirm(page);

    await expectToast(page, '键已删除');
    expect(deleteUrl).toContain('pk=key&pkval=config');
    await expect(page.getByText('从上方下拉选择键开始浏览')).toBeVisible();
  });
});

const VECTOR_ROWS = [{ id: 'p1', payload: { name: 'a' }, vector: [0.1, 0.2] }];

test.describe('VectorView Qdrant 向量浏览', () => {
  test('选择集合 → 向量点表格渲染', async ({ page }) => {
    await openView(page, '向量数据库（Qdrant）', ['items'], (route) =>
      route.fulfill({ json: { success: true, data: { columns: ['id', 'payload'], rows: VECTOR_ROWS, total: 1 } } }));
    await page.getByRole('button', { name: '选择集合…' }).click();
    await page.getByRole('button', { name: 'items', exact: true }).click();
    await expect(page.getByText('1 个向量点')).toBeVisible();
    await expect(page.getByText('p1')).toBeVisible();
  });

  test('相似度检索 → POST vector-search → 命中表格', async ({ page }) => {
    let searchBody = null;
    await openView(page, '向量数据库（Qdrant）', ['items'], (route) =>
      route.fulfill({ json: { success: true, data: { columns: ['id', 'payload'], rows: VECTOR_ROWS, total: 1 } } }));
    await page.route(/\/api\/projects\/qa-tools-hub\/vector-search$/, (route) => {
      searchBody = route.request().postDataJSON();
      route.fulfill({ json: { success: true, data: { hits: [{ id: 'p2', score: 0.85 }] } } });
    });
    await page.getByRole('button', { name: '选择集合…' }).click();
    await page.getByRole('button', { name: 'items', exact: true }).click();

    await page.locator('textarea[placeholder*="[0.1"]').fill('[0.1, 0.2]');
    await page.locator('button:has-text("检索")').click();

    await expect(page.getByText('检索结果 · 1 条')).toBeVisible();
    await expect(page.getByText('p2')).toBeVisible();
    expect(searchBody).toEqual({ collection: 'items', vector: [0.1, 0.2], top_k: 5 });
  });

  test('新增向量点 → JSON 弹窗 → PUT 请求', async ({ page }) => {
    let putBody = null;
    await openView(page, '向量数据库（Qdrant）', ['items'], (route) =>
      route.fulfill({ json: { success: true, data: { columns: ['id', 'payload'], rows: VECTOR_ROWS, total: 1 } } }));
    await page.route(/\/api\/projects\/qa-tools-hub\/data\/row\?table=items/, (route) => {
      if (route.request().method() === 'PUT') putBody = route.request().postDataJSON();
      route.fulfill({ json: { success: true } });
    });
    await page.getByRole('button', { name: '选择集合…' }).click();
    await page.getByRole('button', { name: 'items', exact: true }).click();

    await page.locator('button:has-text("+ 新增向量点")').click();
    await expect(page.locator('.modal-title')).toContainText('新增向量点');
    await page.locator('.modal-box textarea').fill('{"payload":{"name":"new"}}');
    await page.locator('.modal-box button:has-text("新增")').click();

    await expectToast(page, '已更新');
    expect(putBody).toEqual({ payload: { name: 'new' } });
  });

  test('编辑向量点 → PUT + 删除向量点 → 确认 → DELETE', async ({ page }) => {
    let putUrl = null;
    let deleteUrl = null;
    await openView(page, '向量数据库（Qdrant）', ['items'], (route) =>
      route.fulfill({ json: { success: true, data: { columns: ['id', 'payload'], rows: VECTOR_ROWS, total: 1 } } }));
    await page.route(/\/api\/projects\/qa-tools-hub\/data\/row\?table=items/, (route) => {
      if (route.request().method() === 'PUT') putUrl = route.request().url();
      if (route.request().method() === 'DELETE') deleteUrl = route.request().url();
      route.fulfill({ json: { success: true } });
    });
    await page.getByRole('button', { name: '选择集合…' }).click();
    await page.getByRole('button', { name: 'items', exact: true }).click();

    // 编辑
    await page.locator('table tbody button:has-text("编辑")').click();
    await expect(page.locator('.modal-title')).toContainText('编辑向量点 · p1');
    await page.locator('.modal-box textarea').fill('{"payload":{"name":"b"}}');
    await page.locator('.modal-box button:has-text("保存")').click();
    await expectToast(page, '已更新');
    expect(putUrl).toContain('pk=id&pkval=p1');

    // 删除
    await page.locator('table tbody button:has-text("删除")').click();
    await expect(page.locator('.modal-title')).toContainText('删除向量点');
    await clickConfirm(page);
    await expectToast(page, '已删除');
    expect(deleteUrl).toContain('pk=id&pkval=p1');
  });
});

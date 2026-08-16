// Shared mock data and API route handlers for Lambs管理系统 E2E tests

// client.js runs a client-side exp check (atob of the JWT payload) — the
// token must be JWT-shaped with a far-future exp or auth is cleared on load.
export const MOCK_TOKEN = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(
  JSON.stringify({ exp: 4102444800, user_id: 'u_test001', username: 'admin', role: 'super_admin' })
).toString('base64')}.mock-sig`;

export const MOCK_USER = {
  id: 'u_test001',
  name: '管理员',
  email: 'admin@lambs.local',
  role: 'super_admin',
  status: 'active',
  last_login: '2026-07-26 10:00:00',
};

export const MOCK_PROJECTS = [
  { id: 'qa-tools-hub', name: 'QA通关', description: 'QA自动化工具集', port: '8001', db_type: 'SQLite', users_count: 12, status: 'online', is_pinned: true, order: 0, repo: 'qa-tools-hub', stack: 'FastAPI+Vue3', icon_cls: 'green', icon_url: null, features: [{ label: '测试用例', value: '156' }, { label: '通过率', value: '98.5%' }], tabs: [{ name: '测试概览', cols: ['模块', '用例数', '通过', '失败'], style: '1fr 1fr 1fr 1fr', rows: [['登录模块', '45', '45', '0'], ['API测试', '67', '66', '1'], ['E2E', '44', '43', '1']] }] },
  { id: 'tg-cloud-drive', name: 'TG云盘', description: 'E2E加密Telegram云盘', port: '3000', db_type: 'PostgreSQL', users_count: 256, status: 'online', is_pinned: false, order: 1, repo: 'TG_Cloud-Drive', stack: 'NestJS+React', icon_cls: 'blue', icon_url: null, features: [{ label: '文件数', value: '1,280' }, { label: '存储', value: '46.2 GB' }], tabs: [{ name: '文件列表', cols: ['文件名', '大小', '上传时间'], style: '2fr 1fr 1fr', rows: [['report.pdf', '2.3 MB', '2026-07-20'], ['backup.zip', '15.6 MB', '2026-07-19']] }] },
  { id: 'subsai', name: '订阅管家', description: '智能订阅管理平台', port: '8002', db_type: 'PostgreSQL', users_count: 89, status: 'online', is_pinned: false, order: 2, repo: 'subsai', stack: 'FastAPI+React19', icon_cls: 'purple', icon_url: null, features: [{ label: '订阅数', value: '45' }, { label: '月支出', value: '¥328' }], tabs: [] },
  { id: 'smb-ai-os', name: 'SMB经营OS', description: '中小企业AI经营系统', port: '8003', db_type: 'PostgreSQL', users_count: 34, status: 'offline', is_pinned: false, order: 3, repo: 'smb-ai-os', stack: 'FastAPI+React19', icon_cls: 'amber', icon_url: null, features: [], tabs: [] },
  { id: 'silver-guardian', name: '银发守护', description: '老人健康监测平台', port: '8004', db_type: 'PostgreSQL', users_count: 128, status: 'maintenance', is_pinned: false, order: 4, repo: 'silver-guardian', stack: 'FastAPI+React19', icon_cls: 'teal', icon_url: null, features: [], tabs: [] },
];

export const MOCK_USERS = [
  { id: 'u_001', name: '管理员', email: 'admin@lambs.local', role: 'super_admin', project_access: ['all'], status: 'active', last_login: '2026-07-26 10:00' },
  { id: 'u_002', name: '张三', email: 'zhangsan@lambs.local', role: 'project_admin', project_access: ['qa-tools-hub', 'tg-cloud-drive'], status: 'active', last_login: '2026-07-25 18:30' },
  { id: 'u_003', name: '李四', email: 'lisi@lambs.local', role: 'viewer', project_access: ['qa-tools-hub'], status: 'disabled', last_login: '2026-07-20 09:15' },
];

export const MOCK_NOTIFICATIONS = [
  { id: 'n1', project_id: 'qa-tools-hub', type: 'alert', title: 'QA通关 - 服务异常', content: '健康检查连续3次失败', is_read: false, created_at: '2026-07-26T09:30:00' },
  { id: 'n2', project_id: 'tg-cloud-drive', type: 'info', title: 'TG云盘 - 存储告警', content: '磁盘使用率达到85%', is_read: false, created_at: '2026-07-26T08:00:00' },
  { id: 'n3', project_id: null, type: 'success', title: '系统更新完成', content: 'Lambs管理系统已更新至V1.0', is_read: true, created_at: '2026-07-25T12:00:00' },
  { id: 'n4', project_id: 'smb-ai-os', type: 'alert', title: 'SMB经营OS - 离线', content: '服务已离线超过30分钟', is_read: false, created_at: '2026-07-26T09:00:00' },
];

export const MOCK_AUDIT_LOGS = [
  { id: 'a1', created_at: '2026-07-26T10:00:00', action: '登录', target: '管理员', detail: '成功登录系统' },
  { id: 'a2', created_at: '2026-07-26T09:30:00', action: '新增项目', target: 'PetTrust', detail: '创建新项目' },
  { id: 'a3', created_at: '2026-07-26T09:00:00', action: '编辑用户', target: '张三', detail: '修改角色为项目管理员' },
];

export const MOCK_DATASOURCES = [
  { id: 'ds1', name: 'QA通关', repo: 'qa-tools-hub', stack: 'FastAPI+Vue3+SQLite', db_type: 'SQLite', dsn: 'sqlite:///qa.db', status: 'online' },
  { id: 'ds2', name: 'TG云盘', repo: 'TG_Cloud-Drive', stack: 'NestJS+React+PostgreSQL', db_type: 'PostgreSQL', dsn: 'postgresql://...', status: 'online' },
];

/**
 * Register all API mock routes on a page.
 * Call this before navigating to set up authenticated state.
 * @param {import('@playwright/test').Page} page
 * @param {object} [overrides] - optional overrides for any mock data
 */
export async function setupApiMocks(page, overrides = {}) {
  const userData = overrides.user || MOCK_USER;
  const projectsData = overrides.projects || MOCK_PROJECTS;
  const usersData = overrides.users || MOCK_USERS;

  // Block external font requests for speed
  await page.route('**/fonts.googleapis.com**', (route) => route.abort());

  // Catch-all (registered FIRST — later specific mocks take precedence):
  // unmocked API calls must not leak to the real backend. The dev proxy now
  // forwards them, and a real 401 would wipe the mock session mid-test.
  // Narrow to the API base path — a bare '**/api/**' would also swallow
  // '/Lambs/src/api/client.js' and break module loading.
  // Unmocked calls are logged (audit trail): a test silently served by the
  // catch-all is a mock gap, not a pass (R3-P3).
  await page.route('**/Lambs/api/**', (route) => {
    console.warn('[helpers] catch-all served unmocked call:', route.request().method(), route.request().url());
    // success:false — 只断言 success 的测试不再被兜底假绿（R5 F3）。
    route.fulfill({ json: { success: false, data: {} } });
  });

  // Auth endpoints
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ json: { success: true, data: userData } });
  });
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      json: { success: true, data: { access_token: MOCK_TOKEN, token_type: 'bearer' } },
    });
  });
  await page.route('**/api/auth/register', async (route) => {
    await route.fulfill({
      json: { success: true, data: { access_token: 'mock-jwt-token', token_type: 'bearer', user: { id: '1', username: 'test', email: 't@t.com', role: 'viewer' } } },
    });
  });
  await page.route('**/api/auth/forgot-password', async (route) => {
    await route.fulfill({ json: { success: true, data: { new_password: 'Abc12345' } } });
  });

  // Project endpoints
  await page.route('**/api/projects/stats', async (route) => {
    const online = projectsData.filter(p => p.status === 'online').length;
    const offline = projectsData.filter(p => p.status === 'offline' || p.status === 'maintenance').length;
    const totalUsers = projectsData.reduce((sum, p) => sum + p.users_count, 0);
    await route.fulfill({
      json: { success: true, data: { total_projects: projectsData.length, online, offline, total_users: totalUsers } },
    });
  });
  // NOTE: regex, not glob — glob '**/api/projects?*' treats ? as a single
  // character and never matches the query-less '/api/projects' list call.
  await page.route(/\/api\/projects(\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const search = (url.searchParams.get('search') || '').toLowerCase();
    const statusFilter = url.searchParams.get('status_filter') || 'all';
    let filtered = projectsData;
    if (search) {
      filtered = filtered.filter(p => p.name.toLowerCase().includes(search) || p.repo.toLowerCase().includes(search));
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(p => p.status === statusFilter);
    }
    await route.fulfill({ json: { success: true, data: { projects: filtered, total: filtered.length } } });
  });
  await page.route('**/api/projects/reorder', async (route) => {
    await route.fulfill({ json: { success: true } });
  });

  // Individual project detail
  await page.route('**/api/projects/*/status', async (route) => {
    await route.fulfill({ json: { success: true, data: { status: 'online' } } });
  });
  await page.route('**/api/projects/*/pin', async (route) => {
    await route.fulfill({ json: { success: true, data: { is_pinned: true } } });
  });
  await page.route(/\/api\/projects\/(?!stats|reorder)[^/]+$/, async (route) => {
    const url = route.request().url();
    const id = url.split('/').pop().split('?')[0];
    const project = projectsData.find(p => p.id === id) || projectsData[0];
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ json: { success: true } });
    } else {
      await route.fulfill({ json: { success: true, data: project } });
    }
  });

  // User endpoints
  await page.route(/\/api\/users(\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const search = (url.searchParams.get('search') || '').toLowerCase();
    const role = url.searchParams.get('role') || 'all';
    let filtered = usersData;
    if (search) {
      filtered = filtered.filter(u => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search));
    }
    if (role !== 'all') {
      filtered = filtered.filter(u => u.role === role);
    }
    const counts = { all: usersData.length, super_admin: usersData.filter(u => u.role === 'super_admin').length, project_admin: usersData.filter(u => u.role === 'project_admin').length, viewer: usersData.filter(u => u.role === 'viewer').length };
    await route.fulfill({ json: { success: true, data: { users: filtered, counts } } });
  });
  await page.route('**/api/users/*/reset-password', async (route) => {
    await route.fulfill({ json: { success: true, data: { new_password: 'NewPass123' } } });
  });
  await page.route(/\/api\/users\/[^/]+$/, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ json: { success: true } });
    } else {
      await route.fulfill({ json: { success: true, data: usersData[0] } });
    }
  });

  // Notification endpoints
  await page.route(/\/api\/notifications(\?.*)?$/, async (route) => {
    const notifs = overrides.notifications || MOCK_NOTIFICATIONS;
    await route.fulfill({
      json: { success: true, data: { notifications: notifs, unread_count: notifs.filter(n => !n.is_read).length } },
    });
  });
  await page.route('**/api/notifications/*/read', async (route) => {
    await route.fulfill({ json: { success: true } });
  });
  await page.route('**/api/notifications/read-all', async (route) => {
    await route.fulfill({ json: { success: true } });
  });
  await page.route(/\/api\/notifications\/[^/]+$/, async (route) => {
    await route.fulfill({ json: { success: true } });
  });

  // System health (dashboard stat cards)
  await page.route('**/api/system/health', async (route) => {
    await route.fulfill({
      json: { success: true, data: { cpu_percent: 12.5, memory_used_mb: 512, memory_total_mb: 2048, disk_used_gb: 20, disk_total_gb: 100, uptime_seconds: 86400 } },
    });
  });

  // Settings config endpoint
  await page.route('**/api/settings/config', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ json: { success: true, data: { jwt_secret: 'test-secret', admin_email: 'a@b.com', port: 3602, refresh_interval: 30 } } });
    } else {
      await route.fulfill({ json: { success: true, data: { jwt_secret: 'lambs-jwt-secret-key', admin_email: 'admin@lambs.local', port: 3602, refresh_interval: 30 } } });
    }
  });

  // Settings endpoints
  await page.route('**/api/settings/audit-logs', async (route) => {
    await route.fulfill({ json: { success: true, data: { logs: overrides.auditLogs || MOCK_AUDIT_LOGS } } });
  });
  await page.route('**/api/settings/datasources', async (route) => {
    await route.fulfill({ json: { success: true, data: { datasources: overrides.datasources || MOCK_DATASOURCES } } });
  });
  await page.route('**/api/settings/export/*', async (route) => {
    await route.fulfill({
      contentType: 'text/csv',
      body: 'name,status\nQA通关,online\nTG云盘,online',
    });
  });
}

/**
 * Set up authenticated state (token in localStorage) and navigate to a page.
 * @param {import('@playwright/test').Page} page
 * @param {string} path - page path without base, e.g. '/dashboard'
 */
export async function loginAsAdmin(page, path = '/dashboard') {
  await setupApiMocks(page);
  await page.goto('/Lambs/');
  await page.evaluate((t) => localStorage.setItem('lambs_token', t), MOCK_TOKEN);
  await page.goto('/Lambs/' + path.replace(/^\//, ''));
  await page.waitForLoadState('networkidle');
}

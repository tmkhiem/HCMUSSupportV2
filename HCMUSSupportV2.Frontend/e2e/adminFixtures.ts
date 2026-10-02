import type { Page, Route } from '@playwright/test'

/** Synthetic API for the D14b admin pages (no backend). All names and codes are made up. */

const audit = (id: number, action: string, actor = 'T0001', actorName = 'Nguyễn Thử Nghiệm', target?: string) => ({
  id,
  at: `2026-10-0${1 + (id % 2)}T0${id % 9}:15:00Z`,
  actorCode: actor,
  actorName,
  action,
  targetType: target ? 'employee' : undefined,
  targetId: target,
  details: target ? { role: 'editor' } : undefined,
})

const employees = [
  { code: 'T0001', fullName: 'Nguyễn Thử Nghiệm', unit: 'Khoa Công nghệ thông tin', status: 'active', primaryEmail: 't0001@example.test', roles: ['editor', 'admin'] },
  { code: 'T0002', fullName: 'Trần Mẫu Thử', unit: 'Khoa Toán - Tin học', status: 'active', primaryEmail: 't0002@example.test', roles: ['editor'] },
  { code: 'T0003', fullName: 'Lê Nhân Viên', unit: 'Khoa Vật lý', status: 'active', primaryEmail: 't0003@example.test', roles: [] },
  { code: 'T0004', fullName: 'Phạm Giảng Viên', unit: 'Khoa Hóa học', status: 'retired', primaryEmail: undefined, roles: [] },
]

const groups = [
  { id: 1, name: 'Giảng viên có email', description: 'Tất cả giảng viên', kind: 'rule', includeDescendants: false, memberCount: 128, rule: { all: [{ field: 'position_title', op: 'contains', value: 'Giảng viên' }, { field: 'has_email', value: true }] }, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z' },
  { id: 2, name: 'Ban chủ nhiệm khoa', description: 'Danh sách thủ công', kind: 'static', includeDescendants: false, memberCount: 3, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z' },
  { id: 3, name: 'Khoa Công nghệ thông tin', kind: 'org_unit', orgUnitId: 12, orgUnitName: 'Khoa Công nghệ thông tin', includeDescendants: true, memberCount: 54, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z' },
]

export interface Calls {
  rolePuts: { code: string; body: { roles: string[] } }[]
  viewAs: { employeeCode: string }[]
  groupPuts: unknown[]
  resolved: string[]
  applied: string[]
}

export interface StubOptions {
  /** `PUT admin/roles/{code}` answers 409 (last admin). */
  lastAdmin?: boolean
}

export async function stubAdminApi(page: Page, opts: StubOptions = {}): Promise<Calls> {
  const calls: Calls = { rolePuts: [], viewAs: [], groupPuts: [], resolved: [], applied: [] }
  const roleOf = (code: string) => employees.find((e) => e.code === code) ?? employees[2]
  const detail = (code: string, roles?: string[]) => {
    const e = roleOf(code)
    return {
      code: e.code, fullName: e.fullName, unit: e.unit, status: e.status,
      emails: e.primaryEmail ? [e.primaryEmail] : [], roles: roles ?? e.roles,
      grants: (roles ?? e.roles).map((r) => ({ role: r, grantedBy: 'T0001', grantedByName: 'Nguyễn Thử Nghiệm', grantedAt: '2026-09-10T03:00:00Z' })),
    }
  }

  await page.route('**/api/**', async (route: Route) => {
    const req = route.request()
    const url = new URL(req.url())
    const p = url.pathname
    const m = req.method()
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: status >= 400 ? 'application/problem+json' : 'application/json', body: JSON.stringify(body) })

    if (p === '/api/system/info') return json({ version: '0.0.0-test', environment: 'Test' })
    if (p === '/api/admin/dashboard')
      return json({
        tiles: [
          { key: 'identity.employees.active', label: 'Cán bộ đang hoạt động', value: 1284, hint: 'Trạng thái active', severity: 'info' },
          { key: 'identity.employees.email', label: 'Cán bộ có email', value: 1190, hint: 'Nhận được thông báo', severity: 'success' },
          { key: 'identity.editors', label: 'Biên tập viên', value: 6, severity: 'info' },
          { key: 'identity.admins', label: 'Quản trị viên', value: 2, severity: 'info' },
          { key: 'identity.logins7d', label: 'Đăng nhập 7 ngày', value: 412, hint: 'Số người khác nhau', severity: 'info' },
          { key: 'hrm.sync.failed', label: 'Vấn đề đồng bộ chưa xử lý', value: 3, hint: 'Xem trang Đồng bộ', severity: 'warning' },
        ],
        recentActivity: [audit(1, 'roles.granted', 'T0001', 'Nguyễn Thử Nghiệm', 'T0002'), audit(2, 'auth.login'), audit(3, 'group.created')],
      })
    if (p === '/api/admin/roles' && m === 'GET') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      const cursor = url.searchParams.get('cursor')
      const items = employees.filter((e) => !q || `${e.code} ${e.fullName}`.toLowerCase().includes(q))
      if (!q && !url.searchParams.get('role') && !cursor && url.searchParams.get('limit') === '50')
        return json({ items: items.slice(0, 3), nextCursor: 'c1' })
      return json({ items: cursor ? items.slice(3) : items, nextCursor: undefined })
    }
    const roleMatch = /^\/api\/admin\/roles\/(\w+)$/.exec(p)
    if (roleMatch && m === 'GET') return json(detail(roleMatch[1]))
    if (roleMatch && m === 'PUT') {
      const body = req.postDataJSON() as { roles: string[] }
      calls.rolePuts.push({ code: roleMatch[1], body })
      if (opts.lastAdmin) return json({ title: 'Conflict', status: 409, detail: 'Không thể gỡ quản trị viên cuối cùng của hệ thống.' }, 409)
      return json(detail(roleMatch[1], body.roles))
    }
    if (p === '/api/admin/view-as' && m === 'POST') {
      calls.viewAs.push(req.postDataJSON() as { employeeCode: string })
      return json({ code: 'T0002', fullName: 'Trần Mẫu Thử', expiresAt: '2026-10-02T10:00:00Z' })
    }
    if (p === '/api/admin/audit/actions') return json(['auth.login', 'group.created', 'roles.granted', 'viewas.started'])
    if (p === '/api/admin/audit') {
      const cursor = url.searchParams.get('cursor')
      const action = url.searchParams.get('action')
      const rows = cursor
        ? [audit(10, 'viewas.started', 'T0001', 'Nguyễn Thử Nghiệm', 'T0003')]
        : [audit(5, 'roles.granted', 'T0001', 'Nguyễn Thử Nghiệm', 'T0002'), audit(4, 'auth.login', 'T0002', 'Trần Mẫu Thử'), audit(3, 'group.created')]
      return json({ items: action ? rows.filter((r) => r.action === action) : rows, nextCursor: cursor || action ? undefined : 'a1' })
    }
    if (p === '/api/admin/sync-runs')
      return json({
        items: [
          { id: 2, source: 'hrm-etl', dataset: 'employees', startedAt: '2026-10-02T01:00:00Z', finishedAt: '2026-10-02T01:02:00Z', status: 'ok', received: 1290, inserted: 4, updated: 31, deleted: 1, issueCount: 3, openIssueCount: 2 },
          { id: 1, source: 'hrm-etl', dataset: 'commendations', startedAt: '2026-10-01T01:00:00Z', status: 'failed', received: 0, inserted: 0, updated: 0, deleted: 0, error: 'Số dòng giảm quá ngưỡng cho phép.', issueCount: 0, openIssueCount: 0 },
        ],
      })
    if (p === '/api/admin/sync-issues')
      return json({
        items: [
          { id: 11, syncRunId: 2, dataset: 'employees', kind: 'duplicate_mscb', sourceKey: 'T0099', detailsJson: '{"count":2}', createdAt: '2026-10-02T01:02:00Z' },
          { id: 12, syncRunId: 2, dataset: 'employees', kind: 'unknown_unit', sourceKey: 'T0100', createdAt: '2026-10-02T01:02:00Z' },
        ],
      })
    const resolve = /^\/api\/admin\/sync-issues\/(\d+)\/resolve$/.exec(p)
    if (resolve) {
      calls.resolved.push(resolve[1])
      return json({ id: Number(resolve[1]), syncRunId: 2, dataset: 'employees', kind: 'x', sourceKey: 'x', createdAt: '2026-10-02T01:02:00Z', resolvedAt: '2026-10-02T02:00:00Z' })
    }
    const report = (status: string) => ({
      id: '5c1f0c6e-0000-4000-8000-000000000001', dataset: 'teaching', status, fileName: 'giang-day-2025.xlsx',
      totalRows: 240, newRows: 200, updatedRows: 35, removedRows: 5, unknownMscbs: ['X9999'], academicYears: ['2024-2025'],
      badValues: [{ row: 12, column: 'Số tiết', message: 'Giá trị phải là số.' }],
    })
    if (/^\/api\/admin\/datasets\/\w+\/import$/.test(p)) return json(report('validated'))
    const apply = /^\/api\/admin\/datasets\/imports\/([\w-]+)\/apply$/.exec(p)
    if (apply) {
      calls.applied.push(apply[1])
      return json(report('applied'))
    }
    if (/^\/api\/admin\/datasets\/\w+\/template$/.test(p)) return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: 'x' })

    // Groups
    if (p === '/api/manage/groups' && m === 'GET') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      const kind = url.searchParams.get('kind')
      return json({ items: groups.filter((g) => (!kind || g.kind === kind) && (!q || g.name.toLowerCase().includes(q))) })
    }
    if (p === '/api/manage/groups/preview-rule')
      return json({ count: 128, sample: [{ code: 'T0002', fullName: 'Trần Mẫu Thử', unit: 'Khoa Toán - Tin học' }, { code: 'T0003', fullName: 'Lê Nhân Viên', unit: 'Khoa Vật lý' }] })
    const group = /^\/api\/manage\/groups\/(\d+)$/.exec(p)
    if (group && m === 'GET') return json(groups.find((g) => g.id === Number(group[1])))
    if (group && m === 'PUT') {
      calls.groupPuts.push(req.postDataJSON())
      return json({ ...groups.find((g) => g.id === Number(group[1])), ...(req.postDataJSON() as object), updatedAt: '2026-10-02T03:00:00Z' })
    }
    if (/^\/api\/manage\/groups\/\d+\/members$/.test(p) && m === 'GET')
      return json({ items: employees.slice(0, 3).map((e) => ({ code: e.code, fullName: e.fullName, unit: e.unit, source: 'manual', addedAt: '2026-09-05T02:00:00Z' })) })

    return route.fulfill({ status: 404, contentType: 'application/problem+json', body: JSON.stringify({ title: 'Not stubbed', status: 404, detail: `Chưa giả lập ${m} ${p}` }) })
  })
  return calls
}

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

const baseGroups = () => [
  { id: 1, name: 'Giảng viên có email', description: 'Tất cả giảng viên', kind: 'rule', includeDescendants: false, memberCount: 128, rule: { all: [{ field: 'position_title', op: 'contains', value: 'Giảng viên' }, { field: 'has_email', value: true }] }, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z' },
  { id: 2, name: 'Ban chủ nhiệm khoa', description: 'Danh sách thủ công', kind: 'static', includeDescendants: false, memberCount: 3, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z' },
  { id: 3, name: 'Khoa Công nghệ thông tin', kind: 'org_unit', orgUnitId: 12, orgUnitName: 'Khoa Công nghệ thông tin', includeDescendants: true, memberCount: 54, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z' },
  { id: 4, name: 'Khoa Toán - Tin học', kind: 'org_unit', orgUnitId: 13, orgUnitName: 'Khoa Toán - Tin học', includeDescendants: false, memberCount: 40, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z' },
  { id: 6, name: 'Quy tắc lồng nhau', kind: 'rule', includeDescendants: false, memberCount: 7, rule: { all: [{ any: [{ field: 'has_email', value: true }, { field: 'degree', op: 'in', value: ['Tiến sĩ'] }] }] }, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z' },
  { id: 5, name: 'Nhóm cũ 2024', description: 'Đã lưu trữ', kind: 'static', includeDescendants: false, memberCount: 2, archivedAt: '2026-08-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' },
]
type Group = ReturnType<typeof baseGroups>[number] & { archivedAt?: string }

export interface Calls {
  rolePuts: { code: string; body: { roles: string[] } }[]
  viewAs: { employeeCode: string }[]
  groupPuts: unknown[]
  groupPosts: unknown[]
  previews: unknown[]
  archived: string[]
  restored: string[]
  memberAdds: string[][]
  memberRemoves: string[][]
  memberImports: boolean[]
  resolved: string[]
  applied: string[]
  /** Raw query strings of audit calls. */
  auditQueries: string[]
  syncIssueQueries: string[]
  clientCreates: { name: string; scopes: string[] }[]
  clientRevokes: string[]
}

export interface StubOptions {
  /** `PUT admin/roles/{code}` answers 409 (last admin). */
  lastAdmin?: boolean
}

export async function stubAdminApi(page: Page, opts: StubOptions = {}): Promise<Calls> {
  const calls: Calls = { rolePuts: [], viewAs: [], groupPuts: [], groupPosts: [], previews: [], archived: [], restored: [], memberAdds: [], memberRemoves: [], memberImports: [], resolved: [], applied: [], auditQueries: [], syncIssueQueries: [], clientCreates: [], clientRevokes: [] }
  const groups: Group[] = baseGroups()
  const apiClients: { id: number; name: string; scopes: string[]; createdAt: string; lastUsedAt?: string; revokedAt?: string }[] = [
    { id: 2, name: 'sync-hrm', scopes: ['hrm.ingest'], createdAt: '2026-09-20T02:00:00Z', lastUsedAt: '2026-10-03T01:00:00Z' },
    { id: 1, name: 'legacy-migration', scopes: ['legacy.import'], createdAt: '2026-09-10T02:00:00Z', revokedAt: '2026-09-11T02:00:00Z' },
  ]
  const roleOf = (code: string) => employees.find((e) => e.code === code) ?? employees[2]
  const detail = (code: string, roles?: string[]) => {
    const e = roleOf(code)
    return {
      code: e.code, fullName: e.fullName, unit: e.unit, status: e.status,
      emails: e.primaryEmail ? [e.primaryEmail] : [], roles: roles ?? e.roles,
      grants: (roles ?? e.roles).map((r) => ({ role: r, grantedBy: 'T0001', grantedByName: 'Nguyễn Thử Nghiệm', grantedAt: '2026-09-10T03:00:00Z' })),
    }
  }

  // Match only real API paths: a '**/api/**' glob would also catch vite's /src/api/*.ts modules.
  await page.route((u) => u.pathname.startsWith('/api/'), async (route: Route) => {
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
      calls.auditQueries.push(url.search)
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
    if (p === '/api/admin/sync-issues') {
      calls.syncIssueQueries.push(url.search)
      return json({
        items: [
          { id: 11, syncRunId: 2, dataset: 'employees', kind: 'duplicate_mscb', sourceKey: 'T0099', detailsJson: '{"count":2}', createdAt: '2026-10-02T01:02:00Z' },
          { id: 12, syncRunId: 2, dataset: 'employees', kind: 'unknown_unit', sourceKey: 'T0100', createdAt: '2026-10-02T01:02:00Z' },
        ],
      })
    }
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


    // API clients
    if (p === '/api/admin/api-clients/scopes')
      return json([
        { scope: 'hrm.ingest', description: 'Đẩy dữ liệu HRM vào hệ thống (công cụ Sync)' },
        { scope: 'legacy.import', description: 'Nhập dữ liệu từ hệ thống cũ (một lần)' },
      ])
    if (p === '/api/admin/api-clients' && m === 'GET') return json(apiClients)
    if (p === '/api/admin/api-clients' && m === 'POST') {
      const body = req.postDataJSON() as { name: string; scopes: string[] }
      calls.clientCreates.push(body)
      const client = { id: 10 + apiClients.length, name: body.name, scopes: body.scopes, createdAt: '2026-10-03T02:00:00Z' }
      apiClients.unshift(client)
      return json({ client, token: 'tok_SYNTHETIC-not-a-real-token-0123456789abcdef' }, 201)
    }
    const revokeClient = /^\/api\/admin\/api-clients\/(\d+)\/revoke$/.exec(p)
    if (revokeClient && m === 'POST') {
      calls.clientRevokes.push(revokeClient[1])
      const c = apiClients.find((x) => String(x.id) === revokeClient[1])!
      Object.assign(c, { revokedAt: '2026-10-03T03:00:00Z' })
      return json(c)
    }

    // Groups
    if (p === '/api/manage/groups' && m === 'GET') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      const kind = url.searchParams.get('kind')
      const archived = url.searchParams.get('includeArchived') === 'true'
      return json({ items: groups.filter((g) => (archived || !g.archivedAt) && (!kind || g.kind === kind) && (!q || g.name.toLowerCase().includes(q))) })
    }
    if (p === '/api/manage/groups' && m === 'POST') {
      const body = req.postDataJSON() as { name: string; description?: string; kind: string; rule?: unknown }
      calls.groupPosts.push(body)
      const created = { id: 100 + groups.length, name: body.name, description: body.description, kind: body.kind, includeDescendants: false, memberCount: 0, rule: body.rule, createdAt: '2026-10-02T03:00:00Z', updatedAt: '2026-10-02T03:00:00Z' } as Group
      groups.push(created)
      return json(created, 201)
    }
    if (p === '/api/manage/groups/preview-rule') {
      const body = req.postDataJSON() as { rule: unknown }
      calls.previews.push(body.rule)
      return json({ count: 128, sample: [{ code: 'T0002', fullName: 'Trần Mẫu Thử', unit: 'Khoa Toán - Tin học' }, { code: 'T0003', fullName: 'Lê Nhân Viên', unit: 'Khoa Vật lý' }] })
    }
    const group = /^\/api\/manage\/groups\/(\d+)$/.exec(p)
    const find = (id: string) => groups.find((g) => g.id === Number(id))
    if (group && m === 'GET') return json(find(group[1]))
    if (group && m === 'PUT') {
      calls.groupPuts.push(req.postDataJSON())
      const updated = { ...find(group[1]), ...(req.postDataJSON() as object), updatedAt: '2026-10-02T03:00:00Z' } as Group
      groups.splice(groups.findIndex((g) => g.id === updated.id), 1, updated)
      return json(updated)
    }
    if (group && m === 'DELETE') {
      calls.archived.push(group[1])
      find(group[1])!.archivedAt = '2026-10-02T03:00:00Z'
      return route.fulfill({ status: 204 })
    }
    const restore = /^\/api\/manage\/groups\/(\d+)\/restore$/.exec(p)
    if (restore) {
      calls.restored.push(restore[1])
      const g = find(restore[1])!
      delete g.archivedAt
      return json({ ...g, updatedAt: '2026-10-02T04:00:00Z' })
    }
    if (/^\/api\/manage\/groups\/\d+\/members$/.test(p) && m === 'GET')
      return json({ items: employees.slice(0, 3).map((e) => ({ code: e.code, fullName: e.fullName, unit: e.unit, source: 'manual', addedAt: '2026-09-05T02:00:00Z' })) })
    if (/^\/api\/manage\/groups\/\d+\/members$/.test(p) && m === 'PUT') {
      const codes = (req.postDataJSON() as { codes: string[] }).codes
      calls.memberAdds.push(codes)
      return json({ added: codes.filter((c) => c !== 'X9999'), alreadyMember: [], unknown: codes.filter((c) => c === 'X9999'), inactive: [], memberCount: 4 })
    }
    if (/^\/api\/manage\/groups\/\d+\/members$/.test(p) && m === 'DELETE') {
      const codes = (req.postDataJSON() as { codes: string[] }).codes
      calls.memberRemoves.push(codes)
      return json({ removed: codes, notMember: [], memberCount: 2 })
    }
    if (/^\/api\/manage\/groups\/\d+\/members\/import$/.test(p)) {
      const dryRun = url.searchParams.get('dryRun') !== 'false'
      calls.memberImports.push(dryRun)
      return json({ dryRun, rows: 5, added: ['T0003', 'T0004'], alreadyMember: ['T0001'], duplicate: [], unknown: ['X9999'], inactive: [], memberCount: dryRun ? 3 : 5 })
    }

    return route.fulfill({ status: 404, contentType: 'application/problem+json', body: JSON.stringify({ title: 'Not stubbed', status: 404, detail: `Chưa giả lập ${m} ${p}` }) })
  })
  return calls
}

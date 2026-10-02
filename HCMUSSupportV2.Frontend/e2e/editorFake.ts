import type { Page, Route } from '@playwright/test'

/**
 * A stateful stand-in for `/api/manage/*` (D09) for the mock-auth project `editor`: no backend. It keeps the answers in
 * the shape of the real DTOs (docs/NOTIFICATIONS.md) and implements just enough behaviour for the page flows:
 * list filters, create / update with versions, lifecycle, clone, revisions, stats, preview-vars, recipient import,
 * audience estimate, employee and group lookup, tags and series. Synthetic data only.
 */

interface Variable { key: string; label: string; type: string }
interface Tag { id: number; name: string; color: string | null; sort: number }
interface Series { id: number; name: string; description: string | null }
interface Attachment { id: string; fileId: string; fileName: string; contentType: string; sizeBytes: number }

export interface FakeNotification {
  id: string
  title: string
  summary: string
  summaryIsCustom: boolean
  bodyMd: string
  variables: Variable[]
  status: 'draft' | 'scheduled' | 'published' | 'archived'
  seriesId: number | null
  tagIds: number[]
  publishAt: string | null
  publishedAt: string | null
  expiresAt: string | null
  pinnedUntil: string | null
  requiresAck: boolean
  audienceAll: boolean
  groupIds: number[]
  employeeCodes: string[]
  importRows: Record<string, Array<Record<string, string>>> | null
  importId: string | null
  attachments: Attachment[]
  recipientCount: number
  readCount: number
  ackCount: number
  version: number
  updatedAt: string
}

export const EMPLOYEES = [
  { code: 'T0001', fullName: 'Nguyễn Thử Nghiệm', unit: 'Khoa Công nghệ thông tin', status: 'active' },
  { code: 'T0002', fullName: 'Trần Mẫu Thử', unit: 'Khoa Công nghệ thông tin', status: 'active' },
  { code: 'T0003', fullName: 'Lê Nhân Viên', unit: 'Khoa Vật lý', status: 'active' },
  { code: 'T0004', fullName: 'Phạm Đào Tạo', unit: 'Phòng Đào tạo', status: 'active' },
  { code: 'T0005', fullName: 'Võ Đã Nghỉ', unit: 'Khoa Hóa học', status: 'inactive' },
]
const GROUPS = [
  { id: 1, name: 'Giảng viên Khoa CNTT', description: null, kind: 'rule', memberCount: 42 },
  { id: 2, name: 'Viên chức Phòng Đào tạo', description: null, kind: 'static', memberCount: 12 },
]
const ALL_ACTIVE = 380

const SALARY_BODY =
  '# Nâng lương thường xuyên năm 2025\n\nKính gửi :var[Ten_Day_Du], hệ số lương mới của bạn là **:var[HeSoLuong]**, hiệu lực từ :var[NgayHieuLuc].\n\n| Hạng mục | Giá trị |\n| --- | --- |\n| Hệ số | :var[HeSoLuong] |\n| Mức lương | :var[MucLuong] |\n'
const SALARY_VARS: Variable[] = [
  { key: 'Ten_Day_Du', label: 'Họ và tên', type: 'text' },
  { key: 'HeSoLuong', label: 'Hệ số lương', type: 'number' },
  { key: 'NgayHieuLuc', label: 'Ngày hiệu lực', type: 'date' },
  { key: 'MucLuong', label: 'Mức lương', type: 'money' },
]

const day = (offsetDays: number) => new Date(Date.UTC(2026, 5, 15) + offsetDays * 86_400_000).toISOString()

function note(id: number, patch: Partial<FakeNotification>): FakeNotification {
  return {
    id: `0198b000-0000-7000-8000-${String(id).padStart(12, '0')}`,
    title: 'Thông báo',
    summary: '',
    summaryIsCustom: false,
    bodyMd: 'Nội dung thông báo.',
    variables: [],
    status: 'published',
    seriesId: null,
    tagIds: [],
    publishAt: null,
    publishedAt: day(-id),
    expiresAt: null,
    pinnedUntil: null,
    requiresAck: false,
    audienceAll: false,
    groupIds: [],
    employeeCodes: [],
    importRows: null,
    importId: null,
    attachments: [],
    recipientCount: 0,
    readCount: 0,
    ackCount: 0,
    version: 1,
    updatedAt: day(-id),
    ...patch,
  }
}

export function seed() {
  const tags: Tag[] = [
    { id: 1, name: 'Lương', color: '#303F9F', sort: 0 },
    { id: 2, name: 'Thâm niên', color: '#00796B', sort: 1 },
    { id: 3, name: 'Khen thưởng', color: '#F9A825', sort: 2 },
    { id: 4, name: 'Chung', color: null, sort: 3 },
  ]
  const series: Series[] = [
    { id: 1, name: 'Nâng lương thường xuyên', description: 'Mỗi năm một kỳ' },
    { id: 2, name: 'Khảo sát hằng quý', description: null },
  ]
  const notifications: FakeNotification[] = [
    note(1, {
      title: 'Thông báo nâng lương thường xuyên năm 2025',
      summary: 'Kính gửi , hệ số lương mới của bạn là .',
      bodyMd: SALARY_BODY,
      variables: SALARY_VARS,
      seriesId: 1,
      tagIds: [1],
      requiresAck: true,
      importId: '0198c000-0000-7000-8000-000000000001',
      importRows: {
        T0003: [{ Ten_Day_Du: 'Lê Nhân Viên', HeSoLuong: '3,66', NgayHieuLuc: '01/07/2025', MucLuong: '8.500.000 đ' }],
        T0004: [{ Ten_Day_Du: 'Phạm Đào Tạo', HeSoLuong: '4,06', NgayHieuLuc: '01/07/2025', MucLuong: '9.800.000 đ' }],
      },
      recipientCount: 284,
      readCount: 241,
      ackCount: 190,
      version: 3,
    }),
    note(2, { title: 'Mở lớp bồi dưỡng nghiệp vụ sư phạm đợt 3', summary: 'Đăng ký trước ngày 30/06.', tagIds: [4], audienceAll: true, recipientCount: 380, readCount: 120, ackCount: 0 }),
    note(3, { title: 'Khảo sát mức độ hài lòng quý II', status: 'scheduled', publishedAt: null, publishAt: day(5), seriesId: 2, tagIds: [4], groupIds: [1], recipientCount: 0, updatedAt: day(-1) }),
    note(4, { title: 'Nâng lương thường xuyên năm 2026 (nháp)', status: 'draft', publishedAt: null, seriesId: 1, tagIds: [1], bodyMd: SALARY_BODY.replace('2025', '2026'), variables: SALARY_VARS, updatedAt: day(0) }),
    note(5, { title: 'Lịch nghỉ hè 2026', status: 'archived', tagIds: [4], audienceAll: true, recipientCount: 380, readCount: 380, publishedAt: day(-40) }),
    note(6, { title: 'Khen thưởng sáng kiến cấp trường 2025', tagIds: [3], employeeCodes: ['T0003'], recipientCount: 1, readCount: 1 }),
  ]
  return { tags, series, notifications, nextId: 100 }
}

type State = ReturnType<typeof seed>

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: status >= 400 ? 'application/problem+json' : 'application/json', body: JSON.stringify(body) })
const problem = (route: Route, status: number, detail: string, extra: Record<string, unknown> = {}) =>
  json(route, { type: 'about:blank', title: detail, status, detail, ...extra }, status)

function toDetail(s: State, n: FakeNotification) {
  const tags = s.tags.filter((t) => n.tagIds.includes(t.id))
  const series = s.series.find((x) => x.id === n.seriesId)
  const imp = n.importId
    ? { importId: n.importId, status: 'applied', rows: Object.values(n.importRows ?? {}).flat().length, distinctEmployees: Object.keys(n.importRows ?? {}).length, appliedAt: day(-1) }
    : null
  return {
    id: n.id,
    title: n.title,
    summary: n.summary,
    summaryIsCustom: n.summaryIsCustom,
    bodyMd: n.bodyMd,
    contentText: n.bodyMd,
    variables: n.variables,
    status: n.status,
    seriesId: n.seriesId,
    seriesName: series?.name ?? null,
    tags,
    publishAt: n.publishAt,
    publishedAt: n.publishedAt,
    expiresAt: n.expiresAt,
    pinnedUntil: n.pinnedUntil,
    requiresAck: n.requiresAck,
    audience: {
      all: n.audienceAll,
      groups: GROUPS.filter((g) => n.groupIds.includes(g.id)).map((g) => ({ id: g.id, name: g.name, memberCount: g.memberCount })),
      employees: EMPLOYEES.filter((e) => n.employeeCodes.includes(e.code)).map((e) => ({ code: e.code, fullName: e.fullName, status: e.status })),
      import: imp,
    },
    attachments: n.attachments,
    recipientCount: n.recipientCount,
    readCount: n.readCount,
    ackCount: n.ackCount,
    version: n.version,
    createdBy: { code: 'T0001', fullName: 'Nguyễn Thử Nghiệm' },
    updatedBy: { code: 'T0001', fullName: 'Nguyễn Thử Nghiệm' },
    createdAt: n.updatedAt,
    updatedAt: n.updatedAt,
  }
}

function toListItem(s: State, n: FakeNotification) {
  const d = toDetail(s, n)
  return {
    id: n.id, title: n.title, status: n.status, seriesId: n.seriesId, seriesName: d.seriesName, tags: d.tags,
    publishAt: n.publishAt, publishedAt: n.publishedAt, expiresAt: n.expiresAt, requiresAck: n.requiresAck, audienceAll: n.audienceAll,
    recipientCount: n.recipientCount, readCount: n.readCount, ackCount: n.ackCount,
    readPercent: n.recipientCount ? Math.round((n.readCount * 1000) / n.recipientCount) / 10 : 0,
    version: n.version, updatedAt: n.updatedAt,
  }
}

function estimate(s: State, n: { audienceAll?: boolean; groupIds?: number[]; employeeCodes?: string[]; importId?: string | null }) {
  const codes = new Set<string>()
  for (const c of n.employeeCodes ?? []) if (EMPLOYEES.find((e) => e.code === c)?.status === 'active') codes.add(c)
  let count = 0
  if (n.audienceAll) return ALL_ACTIVE
  for (const g of n.groupIds ?? []) count += GROUPS.find((x) => x.id === g)?.memberCount ?? 0
  if (n.importId) {
    const owner = s.notifications.find((x) => x.importId === n.importId)
    for (const c of Object.keys(owner?.importRows ?? {})) codes.add(c)
  }
  return count + codes.size
}

function applyWrite(n: FakeNotification, body: Record<string, unknown>) {
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  n.title = str(body.title).trim()
  n.bodyMd = str(body.bodyMd)
  n.variables = ((body.variables as Variable[] | undefined) ?? []).map((v) => ({ key: v.key, label: v.label || v.key, type: v.type || 'text' }))
  n.seriesId = (body.seriesId as number | null) ?? null
  n.tagIds = (body.tagIds as number[] | undefined) ?? []
  n.expiresAt = (body.expiresAt as string | null) ?? null
  n.pinnedUntil = (body.pinnedUntil as string | null) ?? null
  n.requiresAck = Boolean(body.requiresAck)
  n.audienceAll = Boolean(body.audienceAll)
  n.groupIds = (body.groupIds as number[] | undefined) ?? []
  n.employeeCodes = (body.employeeCodes as string[] | undefined) ?? []
  const summary = str(body.summary).trim()
  n.summaryIsCustom = summary !== ''
  n.summary = summary || n.bodyMd.replace(/[#*|:[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

function validate(body: Record<string, unknown>) {
  const errors: Record<string, string[]> = {}
  if (!String(body.title ?? '').trim()) errors.title = ['Tiêu đề không được để trống.']
  const declared = ((body.variables as Variable[] | undefined) ?? []).map((v) => v.key)
  for (const m of String(body.bodyMd ?? '').matchAll(/:var\[([^\]]*)\]/g)) {
    if (!declared.includes(m[1])) (errors.bodyMd ??= []).push(`[UNKNOWN_VAR] Dòng 1, cột ${(m.index ?? 0) + 1}: Biến “${m[1]}” chưa được khai báo.`)
  }
  return errors
}

export interface FakeApi {
  state: State
  /** Every request made to the fake, as `METHOD path`. */
  calls: string[]
}

/** Installs the fake on a page (call before the first navigation). */
export async function installFake(page: Page, customize?: (s: State) => void): Promise<FakeApi> {
  const state = seed()
  customize?.(state)
  const calls: string[] = []

  await page.route('**/api/manage/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.replace(/^\/api\/manage\//, '')
    const method = req.method()
    calls.push(`${method} ${path}`)
    const body = (() => {
      try {
        return (req.postDataJSON() ?? {}) as Record<string, unknown>
      } catch {
        return {} as Record<string, unknown>
      }
    })()

    // ---- tags and series
    if (path === 'tags' || path.startsWith('tags/')) {
      const id = Number(path.split('/')[1])
      if (method === 'GET') return json(route, state.tags)
      if (method === 'POST') {
        if (state.tags.some((t) => t.name.toLowerCase() === String(body.name).toLowerCase())) return problem(route, 409, 'Tên thẻ đã tồn tại.')
        const tag = { id: state.nextId++, name: String(body.name), color: (body.color as string | null) ?? null, sort: state.tags.length }
        state.tags.push(tag)
        return json(route, tag, 201)
      }
      const tag = state.tags.find((t) => t.id === id)
      if (!tag) return problem(route, 404, 'Không tìm thấy thẻ.')
      if (method === 'PUT') {
        tag.name = String(body.name)
        tag.color = (body.color as string | null) ?? null
        return json(route, tag)
      }
      state.tags = state.tags.filter((t) => t.id !== id)
      for (const n of state.notifications) n.tagIds = n.tagIds.filter((t) => t !== id)
      return route.fulfill({ status: 204 })
    }
    if (path === 'series' || path.startsWith('series/')) {
      const id = Number(path.split('/')[1])
      if (method === 'GET') return json(route, state.series)
      if (method === 'POST') {
        if (state.series.some((t) => t.name.toLowerCase() === String(body.name).toLowerCase())) return problem(route, 409, 'Tên chuỗi đã tồn tại.')
        const s = { id: state.nextId++, name: String(body.name), description: (body.description as string | null) ?? null }
        state.series.push(s)
        return json(route, s, 201)
      }
      const s = state.series.find((t) => t.id === id)
      if (!s) return problem(route, 404, 'Không tìm thấy chuỗi.')
      if (method === 'PUT') {
        s.name = String(body.name)
        s.description = (body.description as string | null) ?? null
        return json(route, s)
      }
      state.series = state.series.filter((t) => t.id !== id)
      for (const n of state.notifications) if (n.seriesId === id) n.seriesId = null
      return route.fulfill({ status: 204 })
    }

    // ---- groups
    if (path === 'groups') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      return json(route, { items: GROUPS.filter((g) => g.name.toLowerCase().includes(q)), nextCursor: null })
    }

    // ---- notification helpers
    if (path === 'notifications/employees') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase()
      return json(route, EMPLOYEES.filter((e) => !q || e.code.toLowerCase().startsWith(q) || norm(e.fullName).includes(norm(q))))
    }
    if (path === 'notifications/audience-estimate') return json(route, { count: estimate(state, body as never) })
    if (path === 'notifications/images') return json(route, { url: `/api/files/0198d000-0000-7000-8000-000000000001`, fileId: '0198d000-0000-7000-8000-000000000001' })

    // ---- notifications collection
    if (path === 'notifications') {
      if (method === 'GET') {
        const status = url.searchParams.get('status')
        const tag = Number(url.searchParams.get('tag') ?? 0)
        const series = Number(url.searchParams.get('series') ?? 0)
        const q = (url.searchParams.get('q') ?? '').toLowerCase()
        const items = state.notifications
          .filter((n) => (!status || n.status === status) && (!tag || n.tagIds.includes(tag)) && (!series || n.seriesId === series) && (!q || n.title.toLowerCase().includes(q)))
          .sort((a, b) => b.id.localeCompare(a.id))
        return json(route, { items: items.map((n) => toListItem(state, n)), nextCursor: null })
      }
      const errors = validate(body)
      if (Object.keys(errors).length) return json(route, { type: 'about:blank', title: 'Validation failed', status: 400, detail: 'Dữ liệu không hợp lệ.', errors }, 400)
      const n = note(state.nextId++, { status: 'draft', publishedAt: null, updatedAt: new Date().toISOString() })
      applyWrite(n, body)
      state.notifications.push(n)
      return json(route, toDetail(state, n), 201)
    }

    const m = /^notifications\/([^/]+)(?:\/(.+))?$/.exec(path)
    const n = m ? state.notifications.find((x) => x.id === m[1]) : undefined
    if (!m || !n) return problem(route, 404, 'Không tìm thấy thông báo.')
    const action = m[2] ?? ''

    if (action === '' && method === 'GET') return json(route, toDetail(state, n))
    if (action === '' && method === 'PUT') {
      if (body.version !== n.version) return problem(route, 409, 'Thông báo đã được người khác cập nhật. Hãy tải lại trước khi sửa.', { currentVersion: n.version })
      const errors = validate(body)
      if (Object.keys(errors).length) return json(route, { type: 'about:blank', title: 'Validation failed', status: 400, detail: 'Dữ liệu không hợp lệ.', errors }, 400)
      applyWrite(n, body)
      n.version += 1
      n.updatedAt = new Date().toISOString()
      return json(route, toDetail(state, n))
    }
    if (action === '' && method === 'DELETE') {
      if (n.status !== 'draft') return problem(route, 409, 'Chỉ xóa được bản nháp. Hãy lưu trữ thông báo đã đăng.')
      state.notifications = state.notifications.filter((x) => x !== n)
      return route.fulfill({ status: 204 })
    }
    if (action === 'publish' || action === 'schedule') {
      const errors: Record<string, string[]> = {}
      if (!n.audienceAll && !n.groupIds.length && !n.employeeCodes.length && !n.importId) errors.audience = ['Chưa chọn người nhận.']
      if (Object.keys(errors).length) return json(route, { type: 'about:blank', title: 'Validation failed', status: 400, detail: 'Thông báo chưa sẵn sàng để đăng.', errors }, 400)
      if (action === 'schedule') {
        n.status = 'scheduled'
        n.publishAt = String(body.publishAt)
      } else {
        n.status = 'published'
        n.publishedAt = new Date().toISOString()
        n.recipientCount = estimate(state, n)
      }
      n.updatedAt = new Date().toISOString()
      return json(route, toDetail(state, n))
    }
    if (action === 'archive') {
      n.status = 'archived'
      return json(route, toDetail(state, n))
    }
    if (action === 'clone') {
      const copy = note(state.nextId++, { ...structuredClone(n), id: undefined as never, status: 'draft', publishedAt: null, publishAt: null, version: 1, attachments: [], importId: null, importRows: null, recipientCount: 0, readCount: 0, ackCount: 0 })
      copy.id = `0198b000-0000-7000-8000-${String(state.nextId++).padStart(12, '0')}`
      copy.updatedAt = new Date().toISOString()
      state.notifications.push(copy)
      return json(route, toDetail(state, copy), 201)
    }
    if (action === 'revisions') {
      if (n.status === 'draft') return json(route, [])
      return json(route, [
        { version: n.version, title: n.title, summary: n.summary, bodyMd: n.bodyMd, variables: n.variables, editedBy: { code: 'T0001', fullName: 'Nguyễn Thử Nghiệm' }, editedAt: day(-2) },
        { version: 2, title: n.title, summary: n.summary, bodyMd: n.bodyMd.replace('mới', 'cũ'), variables: n.variables, editedBy: { code: 'T0002', fullName: 'Trần Mẫu Thử' }, editedAt: day(-5) },
        { version: 1, title: n.title, summary: n.summary, bodyMd: '# Bản đầu\n\nNội dung khi đăng.', variables: n.variables, editedBy: { code: 'T0001', fullName: 'Nguyễn Thử Nghiệm' }, editedAt: day(-9) },
      ])
    }
    if (action === 'stats') {
      const total = n.recipientCount
      return json(route, {
        recipientCount: total, readCount: n.readCount, ackCount: n.ackCount,
        readPercent: total ? Math.round((n.readCount * 1000) / total) / 10 : 0, ackPercent: total ? Math.round((n.ackCount * 1000) / total) / 10 : 0,
        requiresAck: n.requiresAck,
        readsByDay: [
          { date: '2025-07-01', reads: 120, cumulativeReads: 120, cumulativePercent: 42.3 },
          { date: '2025-07-02', reads: 80, cumulativeReads: 200, cumulativePercent: 70.4 },
          { date: '2025-07-03', reads: 41, cumulativeReads: 241, cumulativePercent: 84.9 },
        ],
      })
    }
    if (action === 'preview-vars') {
      const code = url.searchParams.get('employee') ?? ''
      const emp = EMPLOYEES.find((e) => e.code === code)
      const rows = n.importRows?.[code]
      const reasons = [...(n.audienceAll ? ['all'] : []), ...(n.employeeCodes.includes(code) ? ['employee'] : []), ...(rows && n.importId ? ['import'] : [])]
      return json(route, {
        employeeCode: code, fullName: emp?.fullName ?? null, employeeExists: Boolean(emp), source: n.importId ? 'applied' : 'none', importId: n.importId,
        rows: rows ?? null, inAudience: reasons.length > 0, audienceReasons: reasons, inPendingImport: false,
      })
    }
    if (action === 'recipients/import') {
      return json(route, {
        importId: '0198c000-0000-7000-8000-0000000000aa',
        status: 'validated',
        report: {
          fileName: 'nang-luong-2026.xlsx', mscbColumn: 'MSCB', rows: 4, distinctEmployees: 3, employeesWithMultipleRows: 1,
          columns: [
            { key: 'HeSoLuong', label: 'Hệ số lương', header: 'Hệ số lương' },
            { key: 'NgayHieuLuc', label: 'Ngày hiệu lực', header: 'Ngày hiệu lực' },
            { key: 'GhiChu', label: 'Ghi chú', header: 'Ghi chú' },
          ],
          unknownCodes: ['ZZ9999'], unknownCodeCount: 1, inactiveCodes: ['T0005'], inactiveCodeCount: 1,
          duplicateRowCodes: [], duplicateRows: 0, rowsWithoutCode: 0, missingInFile: ['MucLuong'], unusedColumns: ['GhiChu'], errors: [], canApply: true,
        },
      })
    }
    if (action.startsWith('imports/') && action.endsWith('/apply')) {
      n.importId = '0198c000-0000-7000-8000-0000000000aa'
      n.importRows = {
        T0003: [{ HeSoLuong: '4,06', NgayHieuLuc: '01/07/2026', GhiChu: 'x' }],
        T0004: [{ HeSoLuong: '3,66', NgayHieuLuc: '01/07/2026', GhiChu: 'y' }],
        T0001: [{ HeSoLuong: '4,98', NgayHieuLuc: '01/07/2026', GhiChu: 'z' }],
      }
      if (!n.variables.some((v) => v.key === 'GhiChu')) n.variables.push({ key: 'GhiChu', label: 'Ghi chú', type: 'text' })
      n.version += 0
      return json(route, toDetail(state, n))
    }
    if (action === 'attachments' && method === 'POST') {
      const a = { id: `0198e000-0000-7000-8000-${String(state.nextId++).padStart(12, '0')}`, fileId: `0198f000-0000-7000-8000-${String(state.nextId++).padStart(12, '0')}`, fileName: 'quyet-dinh-nang-luong.pdf', contentType: 'application/pdf', sizeBytes: 482_113 }
      n.attachments.push(a)
      return json(route, a)
    }
    if (action.startsWith('attachments/') && method === 'DELETE') {
      n.attachments = n.attachments.filter((a) => a.id !== action.split('/')[1])
      return route.fulfill({ status: 204 })
    }
    return problem(route, 404, `Chưa hỗ trợ trong dữ liệu giả: ${method} ${path}`)
  })

  return { state, calls }
}

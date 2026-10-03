import { ApiError } from '../../../api/http'
import type { VarsRow } from '../body/remarkVars'
import type { InboxQuery } from './inboxFilters'
import type { InboxAttachment, InboxDetail, InboxItem, InboxPage, InboxTag, InboxVariable } from './inboxTypes'

/**
 * Synthetic inbox for `VITE_MOCK_AUTH=1` (dev only: only `inboxApi.ts` imports this, behind the build-time `MOCK_AUTH`
 * constant). Fixed dates and ids so Playwright can assert on them. `window.__inboxMock.publish(title)` simulates a new delivery (there is no live stream: it appears on the next fetch).
 * MSCB and names are synthetic.
 */

const uuid = (n: number) => `0198a000-0000-7000-8000-${String(n).padStart(12, '0')}`
const day = (iso: string) => new Date(`${iso}T09:00:00+07:00`)
const delay = (ms = 60) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const TAGS: InboxTag[] = [
  { id: 1, name: 'Lương', color: null },
  { id: 2, name: 'Thâm niên', color: null },
  { id: 3, name: 'Khen thưởng', color: null },
  { id: 4, name: 'Khảo sát', color: null },
  { id: 5, name: 'Đào tạo', color: null },
  { id: 6, name: 'Chung', color: null },
]
const tag = (...ids: number[]) => TAGS.filter((t) => ids.includes(t.id))

const SERIES: Record<number, string> = { 1: 'Nâng lương thường xuyên', 2: 'Thâm niên nhà giáo' }

interface MockPost {
  item: InboxItem
  body: string
  variables: InboxVariable[]
  vars: VarsRow[]
  attachments: InboxAttachment[]
}

const SALARY_VARS: InboxVariable[] = [
  { key: 'HoTen', label: 'Họ tên', type: 'text' },
  { key: 'BacHienTai', label: 'Bậc hiện tại', type: 'number' },
  { key: 'BacMoi', label: 'Bậc mới', type: 'number' },
  { key: 'HeSoLuong', label: 'Hệ số lương', type: 'number' },
  { key: 'NgayHuong', label: 'Ngày hưởng', type: 'date' },
]

const SALARY_BODY = `## Kết quả xét nâng bậc lương

Kính gửi **:var[HoTen]**,

Căn cứ biên bản họp Hội đồng lương, đồng chí được nâng từ bậc :var[BacHienTai] lên bậc :var[BacMoi].

| Nội dung | Giá trị |
| --- | --- |
| Hệ số lương mới | :var[HeSoLuong] |
| Ngày hưởng | :var[NgayHuong] |

Mọi thắc mắc liên hệ Phòng Tổ chức - Cán bộ.`

const SENIORITY_VARS: InboxVariable[] = [
  { key: 'HoTen', label: 'Họ tên', type: 'text' },
  { key: 'MocTinh', label: 'Mốc tính', type: 'date' },
  { key: 'PhuCap', label: 'Phụ cấp (%)', type: 'number' },
]

const SENIORITY_BODY = `### Phụ cấp thâm niên nhà giáo

:var[HoTen] được hưởng phụ cấp thâm niên **:var[PhuCap]%** tính từ mốc :var[MocTinh].

- Phụ cấp được chi trả cùng kỳ lương tháng 10.
- Bản chi tiết gửi kèm.`

const genericBody = (title: string, summary: string) =>
  `## ${title}\n\n${summary}\n\nChi tiết xem tại cổng thông tin của Nhà trường. Mọi ý kiến xin gửi về Phòng Tổ chức - Cán bộ.\n\n> Đây là dữ liệu mẫu (synthetic) để thử giao diện.`

const FILE_PDF: InboxAttachment = { fileId: uuid(9001), fileName: 'Quyet-dinh-nang-luong-2026.pdf', contentType: 'application/pdf', sizeBytes: 482_304 }
const FILE_XLSX: InboxAttachment = {
  fileId: uuid(9002),
  fileName: 'Danh-sach-nang-luong.xlsx',
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  sizeBytes: 1_572_864,
}
const FILE_DOCX: InboxAttachment = {
  fileId: uuid(9003),
  fileName: 'Mau-phieu-khao-sat.docx',
  contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  sizeBytes: 38_912,
}

interface Spec {
  n: number
  title: string
  summary: string
  tags: number[]
  delivered: string
  updated?: boolean
  series?: number
  files?: InboxAttachment[]
  variables?: InboxVariable[]
  vars?: VarsRow[]
  body?: string
}

const SPECS: Spec[] = [
  {
    n: 1,
    title: 'Thông báo nâng lương thường xuyên năm 2026',
    tags: [1, 6],
    delivered: '2026-09-28',
    series: 1,
    summary: 'Kết quả xét nâng bậc lương thường xuyên đợt 2026 của cán bộ, viên chức.',
    files: [FILE_PDF, FILE_XLSX],
    variables: SALARY_VARS,
    body: SALARY_BODY,
    vars: [{ HoTen: 'Nguyễn Thử Nghiệm', BacHienTai: '4', BacMoi: '5', HeSoLuong: '4,98', NgayHuong: '01/10/2026' }],
  },
  {
    n: 2,
    title: 'Thông báo nâng lương thường xuyên năm 2025',
    tags: [1],
    delivered: '2025-09-30',
    series: 1,
    summary: 'Kết quả xét nâng bậc lương thường xuyên đợt 2025.',
    variables: SALARY_VARS,
    body: SALARY_BODY,
    vars: [{ HoTen: 'Nguyễn Thử Nghiệm', BacHienTai: '3', BacMoi: '4', HeSoLuong: '4,65', NgayHuong: '01/10/2025' }],
  },
  {
    n: 3,
    title: 'Thông báo nâng lương thường xuyên năm 2024',
    tags: [1],
    delivered: '2024-09-27',
    series: 1,
    summary: 'Kết quả xét nâng bậc lương thường xuyên đợt 2024.',
    variables: SALARY_VARS,
    body: SALARY_BODY,
    vars: [{ HoTen: 'Nguyễn Thử Nghiệm', BacHienTai: '2', BacMoi: '3', HeSoLuong: '4,32', NgayHuong: '01/10/2024' }],
  },
  {
    n: 4,
    title: 'Xét phụ cấp thâm niên nhà giáo đợt 2 năm 2026',
    tags: [2, 1],
    delivered: '2026-09-25',
    series: 2,
    summary: 'Danh sách giảng viên đủ điều kiện hưởng phụ cấp thâm niên nhà giáo.',
    variables: SENIORITY_VARS,
    body: SENIORITY_BODY,
    vars: [
      { HoTen: 'Nguyễn Thử Nghiệm', MocTinh: '01/09/2016', PhuCap: '10' },
      { HoTen: 'Nguyễn Thử Nghiệm', MocTinh: '01/09/2021', PhuCap: '15' },
    ],
  },
  {
    n: 5,
    title: 'Khảo sát mức độ hài lòng về điều kiện làm việc',
    tags: [4],
    delivered: '2026-09-20',
    updated: true,
    files: [FILE_DOCX],
    summary: 'Đề nghị cán bộ, viên chức hoàn thành phiếu khảo sát trước ngày 15/10/2026.',
  },
  { n: 6, title: 'Danh sách khen thưởng năm học 2025-2026', tags: [3], delivered: '2026-09-15', summary: 'Công bố danh sách tập thể và cá nhân được khen thưởng năm học 2025-2026.' },
  { n: 7, title: 'Mở lớp bồi dưỡng nghiệp vụ sư phạm đợt 3', tags: [5], delivered: '2026-09-12', summary: 'Lớp bồi dưỡng khai giảng ngày 20/10/2026, đăng ký đến hết ngày 10/10.' },
  { n: 8, title: 'Lịch nghỉ lễ Quốc khánh 2/9 năm 2026', tags: [6], delivered: '2026-08-28', summary: 'Cán bộ, viên chức nghỉ lễ từ ngày 01/09 đến hết ngày 03/09/2026.' },
  { n: 9, title: 'Thông báo họp giao ban tháng 9', tags: [6], delivered: '2026-08-25', summary: 'Họp giao ban toàn trường lúc 14 giờ ngày 30/09/2026 tại hội trường A.' },
  { n: 10, title: 'Triển khai đánh giá viên chức năm 2026', tags: [6, 4], delivered: '2026-08-18', summary: 'Hướng dẫn tự đánh giá và nộp phiếu đánh giá viên chức.' },
  { n: 11, title: 'Đăng ký hội thảo khoa học cấp trường', tags: [5], delivered: '2026-08-10', summary: 'Mở đăng ký báo cáo tại hội thảo khoa học cấp trường lần thứ 12.' },
  {
    n: 12,
    title: 'Cập nhật thông tin hồ sơ cán bộ',
    tags: [6],
    delivered: '2026-08-02',
    summary: 'Đề nghị rà soát và cập nhật thông tin hồ sơ cá nhân trên hệ thống.',
  },
  { n: 13, title: 'Kết quả bình xét thi đua học kỳ II', tags: [3], delivered: '2026-07-22', summary: 'Công bố kết quả bình xét thi đua học kỳ II năm học 2025-2026.' },
  { n: 14, title: 'Tập huấn an toàn phòng cháy chữa cháy', tags: [5, 6], delivered: '2026-07-14', summary: 'Tập huấn bắt buộc cho toàn thể cán bộ, viên chức ngày 25/07.' },
  { n: 15, title: 'Chế độ bảo hiểm y tế năm 2027', tags: [6], delivered: '2026-07-05', summary: 'Thông tin về mức đóng và thời hạn gia hạn bảo hiểm y tế.' },
  { n: 16, title: 'Khảo sát nhu cầu đào tạo ngoại ngữ', tags: [4, 5], delivered: '2026-06-27', summary: 'Khảo sát nhu cầu học tiếng Anh, tiếng Nhật của cán bộ.' },
  { n: 17, title: 'Thông báo nghỉ hè năm 2026', tags: [6], delivered: '2026-06-18', summary: 'Lịch nghỉ hè của cán bộ, viên chức khối hành chính và giảng dạy.' },
  { n: 18, title: 'Xét nâng lương trước thời hạn do lập thành tích', tags: [1, 3], delivered: '2026-06-05', summary: 'Hồ sơ đề nghị nâng lương trước thời hạn nộp trước ngày 20/06.' },
  { n: 19, title: 'Quy định mới về giờ chuẩn giảng dạy', tags: [6], delivered: '2026-05-21', summary: 'Áp dụng định mức giờ chuẩn mới từ năm học 2026-2027.' },
  { n: 20, title: 'Mời tham gia chương trình sức khỏe cộng đồng', tags: [6], delivered: '2026-05-10', summary: 'Khám sức khỏe định kỳ miễn phí dành cho cán bộ, viên chức.' },
  { n: 21, title: 'Hướng dẫn thanh toán công tác phí', tags: [6], delivered: '2026-04-29', summary: 'Quy trình và biểu mẫu thanh toán công tác phí trong nước.' },
  { n: 22, title: 'Danh hiệu Nhà giáo ưu tú: mở nhận hồ sơ', tags: [3], delivered: '2026-04-15', summary: 'Mở nhận hồ sơ đề nghị xét tặng danh hiệu Nhà giáo ưu tú.' },
  { n: 23, title: 'Bồi dưỡng chức danh nghề nghiệp giảng viên chính', tags: [5], delivered: '2026-04-02', summary: 'Kế hoạch mở lớp bồi dưỡng chức danh giảng viên chính hạng II.' },
  { n: 24, title: 'Thông báo thay đổi giờ làm việc mùa hè', tags: [6], delivered: '2026-03-20', summary: 'Giờ làm việc mùa hè áp dụng từ 01/04 đến 30/09.' },
  { n: 25, title: 'Khảo sát chất lượng bữa ăn căng tin', tags: [4], delivered: '2026-03-08', summary: 'Ý kiến đóng góp về chất lượng căng tin giúp Nhà trường cải thiện.' },
  { n: 26, title: 'Nhắc nộp báo cáo sáng kiến cải tiến', tags: [6], delivered: '2026-02-24', summary: 'Hạn nộp báo cáo sáng kiến cải tiến năm học 2025-2026.' },
]

function buildPosts(): MockPost[] {
  return SPECS.map((s) => ({
    item: {
      id: uuid(s.n),
      title: s.title,
      summary: s.summary,
      tags: tag(...s.tags),
      publishedAt: day(s.delivered),
      deliveredAt: day(s.delivered),
      isNew: false,
      updatedAfterDelivery: Boolean(s.updated),
      seriesId: s.series ?? null,
      hasAttachments: Boolean(s.files?.length),
    },
    body: s.body ?? genericBody(s.title, s.summary),
    variables: s.variables ?? [],
    vars: s.vars ?? [],
    attachments: s.files ?? [],
  }))
}

let posts: MockPost[] = buildPosts()
let nextN = 100

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()

function matches(item: InboxItem, q: InboxQuery): boolean {
  if (q.tags?.length && !item.tags.some((t) => q.tags!.includes(t.id))) return false
  if (q.from && item.deliveredAt < q.from) return false
  if (q.to && item.deliveredAt > q.to) return false
  if (q.q) {
    const hay = fold(`${item.title} ${item.summary}`)
    if (
      !fold(q.q)
        .split(/\s+/)
        .every((w) => hay.includes(w))
    )
      return false
  }
  return true
}

const clone = <T,>(v: T): T => structuredClone(v)

export async function listMock(query: InboxQuery, cursor: string | undefined, limit: number): Promise<InboxPage> {
  await delay()
  const sorted = posts
    .map((p) => p.item)
    .filter((i) => matches(i, query))
    .sort((a, b) => b.deliveredAt.getTime() - a.deliveredAt.getTime() || b.id.localeCompare(a.id))
  const start = cursor ? Number(cursor) || 0 : 0
  const items = sorted.slice(start, start + limit)
  return { items: clone(items), nextCursor: start + limit < sorted.length ? String(start + limit) : null }
}

export async function detailMock(id: string): Promise<InboxDetail> {
  await delay()
  const post = posts.find((p) => p.item.id === id)
  if (!post) throw new ApiError(404, 'Không tìm thấy thông báo.')
  const { item } = post
  const previous = item.seriesId
    ? posts
        .filter((p) => p.item.seriesId === item.seriesId && p.item.deliveredAt < item.deliveredAt)
        .sort((a, b) => b.item.deliveredAt.getTime() - a.item.deliveredAt.getTime())
        .map((p) => ({ id: p.item.id, title: p.item.title, publishedAt: p.item.publishedAt }))
    : []
  return clone({
    ...item,
    bodyMd: post.body,
    variables: post.variables,
    vars: post.vars,
    attachments: post.attachments,
    series: item.seriesId ? { id: item.seriesId, name: SERIES[item.seriesId] ?? '', previous } : null,
  })
}

export async function tagsMock(): Promise<InboxTag[]> {
  await delay(20)
  return clone(TAGS)
}

// ---- test hook ---------------------------------------------------------------------------------------------------

/** A new post is delivered to the mock inbox: it shows up after the next fetch (route change or reload of the lists). */
export function publishMockNotification(title: string): string {
  const id = uuid(nextN++)
  const now = new Date()
  posts = [
    {
      item: {
        id,
        title,
        summary: 'Thông báo mới được gửi tới bạn.',
        tags: tag(6),
        publishedAt: now,
        deliveredAt: now,
        isNew: true,
        updatedAfterDelivery: false,
        seriesId: null,
        hasAttachments: false,
      },
      body: genericBody(title, 'Thông báo mới được gửi tới bạn.'),
      variables: [],
      vars: [],
      attachments: [],
    },
    ...posts,
  ]
  return id
}

declare global {
  interface Window {
    /** Test hook (mock mode only): delivers a new post to the synthetic inbox. */
    __inboxMock?: { publish: (title: string) => string }
  }
}

if (typeof window !== 'undefined') window.__inboxMock = { publish: publishMockNotification }

import type { InnovationEntry, InnovationsPage } from './innovationApi'
import { INNOVATION_PAGE_SIZE } from './innovationApi'

/**
 * Synthetic Sáng kiến for `VITE_MOCK_AUTH` (MSCB T0001). Dynamically imported behind the dev-only mock switch, so it never
 * ships in a production build. `?scenario=empty|error` on the URL exercises the other page states.
 */

const scenario = () => new URLSearchParams(window.location.search).get('scenario')

const ITEMS: InnovationEntry[] = [
  { id: 9, code: 'SK-2025-014', title: 'Quy trình tự động hóa chấm bài thực hành lập trình bằng máy chủ chấm điểm nội bộ', type: 'Cấp cơ sở', decisionNo: '812/QĐ-KHTN', recognizedOn: '2025-06-18', academicYear: '2024-2025' },
  { id: 8, code: 'SK-2024-031', title: 'Bộ học liệu mở cho môn Cơ sở dữ liệu theo hướng tiếp cận dự án', type: 'Cấp cơ sở', decisionNo: '1290/QĐ-KHTN', recognizedOn: '2024-09-02', academicYear: '2023-2024' },
  { id: 7, code: 'SK-2024-008', title: 'Mô hình lớp học đảo ngược kết hợp đánh giá đồng đẳng', type: 'Cấp trường', decisionNo: '455/QĐ-ĐHQG', recognizedOn: '2024-03-12', academicYear: '2023-2024' },
  { id: 6, code: 'SK-2023-022', title: 'Hệ thống nhắc lịch coi thi và trực phòng máy cho giảng viên', type: 'Cấp cơ sở', decisionNo: '977/QĐ-KHTN', recognizedOn: '2023-07-21', academicYear: '2022-2023' },
  { id: 5, code: 'SK-2022-019', title: 'Phương pháp đánh giá năng lực lập trình dựa trên bài tập nhỏ liên tục', type: 'Cấp trường', decisionNo: '233/QĐ-ĐHQG', recognizedOn: '2022-11-30', academicYear: '2022-2023' },
  { id: 4, code: 'SK-2021-005', title: 'Công cụ trực quan hóa thuật toán sắp xếp phục vụ giảng dạy', type: 'Cấp cơ sở', decisionNo: '310/QĐ-KHTN', recognizedOn: '2021-05-10', academicYear: '2020-2021' },
  { id: 3, code: 'SK-2020-011', title: 'Bộ đề thi trắc nghiệm có phân tầng độ khó', type: 'Cấp cơ sở', decisionNo: '1544/QĐ-KHTN', recognizedOn: '2020-12-04', academicYear: '2020-2021' },
  { id: 2, code: null, title: 'Sổ tay hướng dẫn thực tập doanh nghiệp cho sinh viên năm cuối', type: null, decisionNo: null, recognizedOn: null, academicYear: '2018-2019' },
  { id: 1, code: 'SK-2017-002', title: 'Cải tiến bài thực hành Mạng máy tính bằng môi trường ảo hóa', type: 'Cấp cơ sở', decisionNo: '622/QĐ-KHTN', recognizedOn: '2017-08-15', academicYear: '2016-2017' },
]

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .toLowerCase()

function statsOf(items: InnovationEntry[]) {
  const counts = new Map<string | null, number>()
  for (const i of items) counts.set(i.type, (counts.get(i.type) ?? 0) + 1)
  return {
    count: items.length,
    byType: [...counts].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
  }
}

export async function loadMockInnovations(q: string, cursor: number | null): Promise<InnovationsPage> {
  await new Promise((r) => setTimeout(r, 120))
  const s = scenario()
  if (s === 'error') throw new Error('mock error')
  const all = s === 'empty' ? [] : ITEMS
  const needle = fold(q.trim())
  const matches = all.filter((i) => !needle || [i.title, i.code, i.type].some((v) => v && fold(v).includes(needle)))
  const after = matches.filter((i) => cursor === null || i.id < cursor)
  const items = after.slice(0, INNOVATION_PAGE_SIZE)
  return {
    stats: statsOf(all),
    items,
    nextCursor: after.length > items.length ? items[items.length - 1].id : null,
  }
}

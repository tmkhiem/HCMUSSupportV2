import type { Page, Publication, ResearchMember, ResearchProject } from './researchApi'

/**
 * Synthetic Nghiên cứu khoa học for `VITE_MOCK_AUTH` (MSCB T0001). Dynamically imported behind the dev-only mock switch,
 * so it never ships in a production build. `?scenario=empty|error` on the URL exercises the other page states.
 * The mock pages are small (5) so "Tải thêm" can be exercised.
 */

const scenario = () => new URLSearchParams(window.location.search).get('scenario')
const MOCK_PAGE = 5

const ME: ResearchMember = { employeeCode: 'T0001', fullName: 'Nguyễn Thử Nghiệm', role: 'chu_nhiem' }
const T0002: ResearchMember = { employeeCode: 'T0002', fullName: 'Trần Biên Tập', role: 'thanh_vien' }
const T0003: ResearchMember = { employeeCode: 'T0003', fullName: 'Lê Nhân Viên', role: 'thanh_vien' }
const T0004: ResearchMember = { employeeCode: 'T0004', fullName: 'Phạm Cộng Sự', role: 'thanh_vien' }
const asMember = (m: ResearchMember): ResearchMember => ({ ...m, role: 'thanh_vien' })

const PROJECTS: ResearchProject[] = [
  { id: 7, code: 'T2025-18', title: 'Ứng dụng học máy trong phát hiện gian lận bài thi lập trình trực tuyến', level: 'Cấp trường', researchType: 'Ứng dụng', funding: 60_000_000, periodText: '01/2025 - 12/2026', acceptedOn: null, result: null, myRole: 'chu_nhiem', members: [ME, T0002, T0003] },
  { id: 6, code: 'B2024-21', title: 'Xây dựng bộ dữ liệu tiếng Việt cho bài toán phân loại văn bản học thuật', level: 'Cấp Đại học Quốc gia', researchType: 'Cơ bản', funding: 180_000_000, periodText: '2024 - 2026', acceptedOn: null, result: null, myRole: 'thanh_vien', members: [{ ...T0004, role: 'chu_nhiem' }, asMember(ME), T0002] },
  { id: 5, code: 'CS2023-07', title: 'Hệ thống gợi ý tài liệu học tập cho sinh viên ngành Công nghệ thông tin', level: 'Cấp cơ sở', researchType: 'Ứng dụng', funding: 25_000_000, periodText: '2023 - 2024', acceptedOn: '2024-06-20', result: 'Đạt', myRole: 'chu_nhiem', members: [ME, T0003] },
  { id: 4, code: 'T2022-11', title: 'Nghiên cứu phương pháp đánh giá tự động mã nguồn bài tập nhỏ', level: 'Cấp trường', researchType: 'Ứng dụng', funding: 40_000_000, periodText: '2022 - 2023', acceptedOn: '2023-07-05', result: 'Xuất sắc', myRole: 'chu_nhiem', members: [ME, T0002, T0003, T0004] },
  { id: 3, code: 'CS2021-03', title: 'Tối ưu hóa truy vấn cho cơ sở dữ liệu quan hệ cỡ nhỏ', level: 'Cấp cơ sở', researchType: 'Cơ bản', funding: null, periodText: '2021 - 2022', acceptedOn: '2022-05-30', result: 'Đạt', myRole: 'thanh_vien', members: [{ ...T0002, role: 'chu_nhiem' }, asMember(ME)] },
  { id: 2, code: 'CS2019-14', title: 'Khảo sát nhu cầu kỹ năng của sinh viên công nghệ thông tin sau tốt nghiệp', level: 'Cấp cơ sở', researchType: 'Khảo sát', funding: 15_000_000, periodText: '2019 - 2020', acceptedOn: '2020-04-18', result: 'Đạt', myRole: 'chu_nhiem', members: [ME] },
  { id: 1, code: 'CS2017-02', title: 'Mô phỏng mạng cảm biến không dây trên nền tảng mã nguồn mở', level: 'Cấp cơ sở', researchType: 'Cơ bản', funding: 20_000_000, periodText: '2017 - 2018', acceptedOn: '2018-03-12', result: 'Đạt', myRole: 'thanh_vien', members: [{ ...T0003, role: 'chu_nhiem' }, asMember(ME)] },
]

const au = (m: ResearchMember, ordinal: number) => ({ employeeCode: m.employeeCode, fullName: m.fullName, ordinal })

const PUBLICATIONS: Publication[] = [
  { id: 6, doi: '10.1000/synthetic.2025.0061', eid: null, title: 'Detecting collusion in online programming exams with graph-based similarity', venue: 'Journal of Educational Computing (dữ liệu thử nghiệm)', year: 2025, details: null, url: null, myOrdinal: 1, authors: [au(ME, 1), au(T0002, 2)] },
  { id: 5, doi: null, eid: null, title: 'Một phương pháp gợi ý học liệu dựa trên lịch sử học tập', venue: 'Tạp chí Khoa học và Công nghệ Thử nghiệm', year: 2024, details: 'Tập 12, số 3, tr. 45-58', url: 'https://example.test/papers/5', myOrdinal: 2, authors: [au(T0003, 1), au(ME, 2), au(T0004, 3)] },
  { id: 4, doi: 'https://doi.org/10.1000/synthetic.2023.0044', eid: null, title: 'Automatic grading of small programming assignments: a replication study', venue: 'Proceedings of the Synthetic Conference on Software Engineering', year: 2023, details: null, url: null, myOrdinal: 1, authors: [au(ME, 1), au(T0003, 2), au(T0002, 3), au(T0004, 4)] },
  { id: 3, doi: '10.1000/synthetic.2021.0019', eid: '2-s2.0-0000000003', title: 'Query optimisation heuristics for small relational workloads', venue: 'International Journal of Data Systems (dữ liệu thử nghiệm)', year: 2021, details: null, url: null, myOrdinal: 3, authors: [au(T0002, 1), au(T0004, 2), au(ME, 3)] },
  { id: 2, doi: null, eid: null, title: 'Khảo sát kỹ năng nghề nghiệp của cử nhân công nghệ thông tin', venue: 'Hội thảo Quốc gia Thử nghiệm về Giáo dục Đại học', year: 2020, details: null, url: null, myOrdinal: 1, authors: [au(ME, 1)] },
  { id: 1, doi: null, eid: null, title: 'Mô phỏng mạng cảm biến không dây bằng công cụ mã nguồn mở', venue: null, year: null, details: null, url: null, myOrdinal: 2, authors: [au(T0003, 1), au(ME, 2)] },
]

async function paged<T extends { id: number }>(all: T[], cursor: number | null): Promise<Page<T>> {
  await new Promise((r) => setTimeout(r, 120))
  const s = scenario()
  if (s === 'error') throw new Error('mock error')
  const rows = s === 'empty' ? [] : all
  const after = rows.filter((r) => cursor === null || r.id < cursor)
  const items = after.slice(0, MOCK_PAGE)
  return { items, nextCursor: after.length > items.length ? items[items.length - 1].id : null }
}

export const loadMockProjects = (cursor: number | null) => paged(PROJECTS, cursor)
export const loadMockPublications = (cursor: number | null) => paged(PUBLICATIONS, cursor)

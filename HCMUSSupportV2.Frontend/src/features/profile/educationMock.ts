import type { BusinessTrips, DegreeEntry, TrainingEntry } from './educationApi'

/**
 * Synthetic Hồ sơ education data for `VITE_MOCK_AUTH` (MSCB T0001). Only dynamically imported behind the dev-only mock
 * switch, so it never ships in a production build. `?education=empty|error` on the URL exercises the other page states.
 */

function scenario(): string | null {
  return new URLSearchParams(window.location.search).get('education')
}

function pick<T>(data: T, empty: T): T {
  const s = scenario()
  if (s === 'error') throw new Error('mock error')
  return s === 'empty' ? empty : data
}

const day = (date: string) => ({ date, precision: 'day' })
const month = (date: string) => ({ date, precision: 'month' })
const year = (date: string) => ({ date, precision: 'year' })
const unknown = { date: null, precision: 'year' }

const degrees: DegreeEntry[] = [
  {
    id: 3, degreeType: 'Tiến sĩ', major: 'Khoa học máy tính', institution: 'Đại học Tổng hợp Mẫu', country: 'Nhật Bản',
    trainingForm: 'Chính quy', enrolledOn: month('2014-10-01'), graduatedOn: month('2018-03-01'),
    thesisTitle: 'Phương pháp học sâu cho bài toán nhận dạng chữ viết tay tiếng Việt',
  },
  {
    id: 2, degreeType: 'Thạc sĩ', major: 'Khoa học máy tính', institution: 'Trường Đại học Khoa học Tự nhiên, ĐHQG-HCM', country: 'Việt Nam',
    trainingForm: 'Chính quy', enrolledOn: year('2009-01-01'), graduatedOn: day('2011-12-20'),
    thesisTitle: 'Xây dựng hệ thống truy vấn ngữ nghĩa trên tập văn bản tiếng Việt',
  },
  {
    id: 1, degreeType: 'Cử nhân', major: 'Công nghệ thông tin', institution: 'Trường Đại học Khoa học Tự nhiên, ĐHQG-HCM', country: 'Việt Nam',
    trainingForm: 'Chính quy', enrolledOn: year('2005-01-01'), graduatedOn: year('2009-01-01'), thesisTitle: null,
  },
  {
    id: 4, degreeType: 'Chứng chỉ', major: 'Nghiệp vụ sư phạm đại học', institution: null, country: null,
    trainingForm: null, enrolledOn: unknown, graduatedOn: unknown, thesisTitle: null,
  },
]

const trainings: TrainingEntry[] = [
  { id: 8, content: 'Bồi dưỡng kiến thức quốc phòng và an ninh đối tượng 3', place: 'Trung tâm Giáo dục quốc phòng TP.HCM', trainingForm: 'Tập trung', startOn: day('2025-06-09'), endOn: day('2025-06-20'), year: 2025 },
  { id: 7, content: 'Bồi dưỡng chuẩn chức danh nghề nghiệp giảng viên chính (hạng II)', place: 'Trường Đại học Sư phạm Mẫu', trainingForm: 'Tập trung', startOn: month('2025-02-01'), endOn: month('2025-05-01'), year: 2025 },
  { id: 6, content: 'Khóa tập huấn quản lý khoa học và công nghệ', place: 'Trực tuyến', trainingForm: 'Từ xa', startOn: day('2023-11-14'), endOn: day('2023-11-14'), year: 2023 },
  { id: 5, content: 'Bồi dưỡng lý luận chính trị trung cấp', place: 'Trường Chính trị Mẫu', trainingForm: 'Vừa học vừa làm', startOn: month('2023-03-01'), endOn: month('2023-08-01'), year: 2023 },
  { id: 4, content: 'Hội thảo phương pháp giảng dạy lấy người học làm trung tâm', place: 'Trường Đại học Khoa học Tự nhiên', trainingForm: null, startOn: day('2023-01-10'), endOn: day('2023-01-11'), year: 2023 },
  { id: 3, content: 'Bồi dưỡng nghiệp vụ sư phạm đại học', place: null, trainingForm: 'Tập trung', startOn: unknown, endOn: unknown, year: null },
]

const trips: BusinessTrips = {
  stats: { tripCount: 5, totalDays: 33 },
  years: [2025, 2024, 2022],
  items: [
    { id: 5, fromOn: '2025-04-07', toOn: '2025-04-12', days: 6, place: 'Singapore', purpose: 'Báo cáo tại hội nghị quốc tế về trí tuệ nhân tạo', transport: 'Máy bay', decisionNo: '502/QĐ-KHTN', decidedOn: '2025-03-20', note: null },
    { id: 4, fromOn: '2025-01-13', toOn: '2025-01-15', days: 3, place: 'Hà Nội', purpose: 'Họp Hội đồng ngành Công nghệ thông tin', transport: 'Máy bay', decisionNo: '45/QĐ-KHTN', decidedOn: '2025-01-06', note: 'Đi trong nước.' },
    { id: 3, fromOn: '2024-10-21', toOn: '2024-11-01', days: 12, place: 'Tokyo, Nhật Bản', purpose: 'Hợp tác nghiên cứu với phòng thí nghiệm đối tác', transport: 'Máy bay', decisionNo: '1090/QĐ-KHTN', decidedOn: '2024-09-30', note: null },
    { id: 2, fromOn: '2024-05-06', toOn: '2024-05-09', days: 4, place: 'Đà Nẵng', purpose: 'Tham dự hội thảo khoa học toàn quốc', transport: null, decisionNo: '310/QĐ-KHTN', decidedOn: '2024-04-22', note: null },
    { id: 1, fromOn: '2022-08-22', toOn: '2022-09-07', days: 8, place: 'Seoul, Hàn Quốc', purpose: 'Tập huấn kỹ năng giảng dạy', transport: 'Máy bay', decisionNo: null, decidedOn: null, note: 'Chưa có quyết định đi kèm.' },
  ],
}

export const loadMockDegrees = () => pick(degrees, [])
export const loadMockTrainings = () => pick(trainings, [])
export const loadMockBusinessTrips = () => pick(trips, { stats: { tripCount: 0, totalDays: 0 }, years: [], items: [] })

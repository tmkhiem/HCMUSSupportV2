import type { Commendations, Positions, Salary, SalaryEntry } from './careerApi'

/**
 * Synthetic Hồ sơ career data for `VITE_MOCK_AUTH` (MSCB T0001). Only dynamically imported behind the dev-only mock
 * switch, so it never ships in a production build. `?career=empty|error` on the URL exercises the other page states.
 */

function scenario(): string | null {
  return new URLSearchParams(window.location.search).get('career')
}

function pick<T>(data: T, empty: T): T {
  const s = scenario()
  if (s === 'error') throw new Error('mock error')
  return s === 'empty' ? empty : data
}

const GRADE_II = { gradeCode: 'V.07.01.02', gradeName: 'Giảng viên chính (hạng II)' }
const GRADE_III = { gradeCode: 'V.07.01.03', gradeName: 'Giảng viên (hạng III)' }

const history: SalaryEntry[] = [
  {
    id: 6, ...GRADE_II, step: 5, coefficient: 5.08, overGradePct: 5,
    decisionNo: '412/QĐ-KHTN', signedOn: '2025-02-14', effectiveFrom: '2025-03-01', nextRaiseOn: '2028-03-01',
    note: 'Nâng bậc lương thường xuyên.',
  },
  {
    id: 5, ...GRADE_II, step: 4, coefficient: 4.74, overGradePct: null,
    decisionNo: '233/QĐ-KHTN', signedOn: '2022-02-10', effectiveFrom: '2022-03-01', nextRaiseOn: '2025-03-01',
    note: null,
  },
  {
    id: 4, ...GRADE_II, step: 3, coefficient: 4.4, overGradePct: null,
    decisionNo: '1187/QĐ-KHTN', signedOn: '2019-11-20', effectiveFrom: '2019-12-01', nextRaiseOn: '2022-12-01',
    note: 'Bổ nhiệm ngạch giảng viên chính, xếp bậc 3.',
  },
  {
    id: 3, ...GRADE_III, step: 6, coefficient: 3.99, overGradePct: null,
    decisionNo: '640/QĐ-KHTN', signedOn: '2016-08-05', effectiveFrom: '2016-09-01', nextRaiseOn: '2019-09-01',
    note: null,
  },
  {
    id: 2, ...GRADE_III, step: 5, coefficient: 3.66, overGradePct: null,
    decisionNo: null, signedOn: null, effectiveFrom: '2013-09-01', nextRaiseOn: '2016-09-01',
    note: 'Không còn quyết định gốc.',
  },
  {
    id: 1, ...GRADE_III, step: 3, coefficient: 3, overGradePct: null,
    decisionNo: '98/QĐ-KHTN', signedOn: '2010-01-12', effectiveFrom: '2010-02-01', nextRaiseOn: '2013-02-01',
    note: 'Tuyển dụng, hết thời gian tập sự.',
  },
]

const salary: Salary = {
  current: {
    ...GRADE_II, step: 5, coefficient: 5.08, overGradePct: 5,
    effectiveFrom: '2025-03-01', nextRaiseOn: '2028-03-01', monthsToNextRaise: 17,
  },
  history,
}

const currentPosition = {
  id: 3,
  title: 'Phó trưởng bộ môn',
  unitDescription: 'Bộ môn Khoa học máy tính, Khoa Công nghệ thông tin',
  coefficient: 0.4,
  appointedOn: '2023-08-01',
  decisionNo: '905/QĐ-KHTN',
  signedOn: '2023-07-20',
  endedOn: null,
  isCurrent: true,
  tenureYears: 3,
  tenureMonths: 2,
}

const positions: Positions = {
  current: currentPosition,
  items: [
    currentPosition,
    {
      id: 2, title: 'Thư ký hội đồng khoa', unitDescription: 'Khoa Công nghệ thông tin', coefficient: null,
      appointedOn: '2018-09-01', decisionNo: '1031/QĐ-KHTN', signedOn: '2018-08-24', endedOn: '2023-07-31',
      isCurrent: false, tenureYears: 4, tenureMonths: 11,
    },
    {
      id: 1, title: 'Giảng viên', unitDescription: 'Bộ môn Khoa học máy tính', coefficient: null,
      appointedOn: '2010-02-01', decisionNo: null, signedOn: null, endedOn: '2018-08-31',
      isCurrent: false, tenureYears: 8, tenureMonths: 7,
    },
  ],
}

const commendations: Commendations = {
  awardCount: 5,
  titleCount: 3,
  awards: [
    {
      academicYear: '2023-2024',
      items: [
        { id: 11, name: 'Bằng khen của Giám đốc Đại học Quốc gia TP.HCM', decisionNo: '1204/QĐ-ĐHQG', decidedOn: { date: '2024-09-20', precision: 'day' } },
        { id: 10, name: 'Giấy khen hoàn thành xuất sắc nhiệm vụ nghiên cứu khoa học', decisionNo: '311/QĐ-KHTN', decidedOn: { date: '2024-06-12', precision: 'day' } },
      ],
    },
    {
      academicYear: '2021-2022',
      items: [
        { id: 9, name: 'Giấy khen đạt thành tích xuất sắc trong công tác giảng dạy', decisionNo: '188/QĐ-KHTN', decidedOn: { date: '2022-07-01', precision: 'month' } },
      ],
    },
    {
      academicYear: '2019-2020',
      items: [
        { id: 8, name: 'Bằng khen của Bộ trưởng Bộ Giáo dục và Đào tạo', decisionNo: null, decidedOn: { date: '2020-01-01', precision: 'year' } },
        { id: 7, name: 'Giấy khen đảng viên hoàn thành tốt nhiệm vụ', decisionNo: '27/QĐ-ĐU', decidedOn: { date: '2020-12-18', precision: 'day' } },
      ],
    },
  ],
  titles: [
    {
      academicYear: '2023-2024',
      items: [{ id: 21, name: 'Chiến sĩ thi đua cơ sở', decisionNo: '1002/QĐ-KHTN', decidedOn: { date: '2024-08-15', precision: 'day' } }],
    },
    {
      academicYear: '2021-2022',
      items: [{ id: 20, name: 'Lao động tiên tiến', decisionNo: '870/QĐ-KHTN', decidedOn: { date: '2022-08-10', precision: 'day' } }],
    },
    {
      academicYear: null,
      items: [{ id: 19, name: 'Giảng viên giỏi cấp trường', decisionNo: null, decidedOn: { date: null, precision: 'year' } }],
    },
  ],
}

export const loadMockSalary = () => pick(salary, { current: null, history: [] })
export const loadMockPositions = () => pick(positions, { current: null, items: [] })
export const loadMockCommendations = () =>
  pick(commendations, { awardCount: 0, titleCount: 0, awards: [], titles: [] })

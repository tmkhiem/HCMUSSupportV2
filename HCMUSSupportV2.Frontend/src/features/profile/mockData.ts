import type { DetailedProfile, GeneralProfile, MaskedField, ProfileOverview, SensitiveField } from './api'

/** Synthetic Hồ sơ data for `VITE_MOCK_AUTH` (MSCB T0001). Only dynamically imported behind the dev-only mock switch. */

export const mockOverview: ProfileOverview = {
  hero: {
    code: 'T0001',
    fullName: 'Nguyễn Thử Nghiệm',
    photoUrl: null,
    positionTitle: 'Giảng viên chính',
    unit: 'Khoa Công nghệ thông tin',
    email: 't0001@example.test',
    phone: '0901 000 001',
  },
  salary: { gradeName: 'Giảng viên chính (hạng II)', step: 4, coefficient: 4.65, nextRaiseOn: '2027-03-01' },
  positions: { currentTitle: 'Phó trưởng bộ môn', count: 2 },
  commendations: { awards: 5, titles: 3 },
  degrees: { count: 3, latestDegreeType: 'Tiến sĩ', latestMajor: 'Khoa học máy tính' },
  trainingCount: 6,
  businessTripCount: 4,
  innovationCount: 2,
  hasProfile: true,
}

export const mockGeneral: GeneralProfile = {
  code: 'T0001',
  fullName: 'Nguyễn Thử Nghiệm',
  lastName: 'Nguyễn Thử',
  firstName: 'Nghiệm',
  dateOfBirth: { date: '1985-03-07', precision: 'day' },
  gender: 'Nam',
  ethnicity: 'Kinh',
  religion: 'Không',
  nationality: 'Việt Nam',
  birthPlace: 'Thành phố Hồ Chí Minh',
  hometown: 'Quảng Ngãi',
  phoneMobile: '0901 000 001',
  phoneHome: null,
  personalEmail: 'thunghiem@example.test',
  emails: ['t0001@example.test', 't0001@student.example.test'],
  permanentAddress: { address: '12 Đường Thử Nghiệm', ward: 'Phường 4', district: 'Quận 5', province: 'Thành phố Hồ Chí Minh' },
  contactAddress: { address: null, ward: null, district: null, province: null },
}

const field = (f: SensitiveField, masked: string | null): MaskedField => ({ field: f, masked, hasValue: masked !== null })

export const mockDetailed: DetailedProfile = {
  unit: 'Khoa Công nghệ thông tin',
  department: 'Bộ môn Công nghệ tri thức',
  positionTitle: 'Phó trưởng bộ môn',
  salaryGradeCode: 'V.07.01.03',
  salaryGradeName: 'Giảng viên chính (hạng II)',
  salaryStep: 4,
  salaryCoefficient: 4.65,
  overGradePct: null,
  academicRank: 'Phó giáo sư',
  degree: 'Tiến sĩ',
  educationLevel: '12/12',
  major: 'Khoa học máy tính',
  politicalTheory: 'Trung cấp',
  party: { isMember: true, joinedOn: '2012-05-19', fileNo: 'ĐV-0001', cardNo: '0001234' },
  youthUnion: { isMember: true, joinedOn: '2001-03-26', fileNo: null, cardNo: null },
  tradeUnion: { isMember: false, joinedOn: null, fileNo: null, cardNo: null },
  nationalId: field('national_id', '•••• 4321'),
  nationalIdIssuedOn: '2021-08-15',
  nationalIdIssuedBy: 'Cục Cảnh sát QLHC về TTXH',
  taxCode: field('tax_code', '•••• 7788'),
  bankName: 'Ngân hàng TMCP Thử Nghiệm',
  bankBranch: 'Chi nhánh Quận 5',
  bankAccount: field('bank_account', '•••• 9012'),
  socialInsuranceNo: field('social_insurance_no', '•••• 3456'),
  healthInsuranceNo: field('health_insurance_no', null),
}

const REAL: Record<SensitiveField, string> = {
  national_id: '079085004321',
  tax_code: '8412347788',
  bank_account: '1234567890129012',
  social_insurance_no: '7912345456',
  health_insurance_no: '',
}

export async function mockReveal(f: SensitiveField): Promise<string> {
  await new Promise((r) => setTimeout(r, 150))
  return REAL[f]
}

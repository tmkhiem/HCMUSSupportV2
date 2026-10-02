
import type { ProfileOverviewDto } from '../../types';

// Properly typed mock profile matching the ProfileOverview interface
const MOCK_PROFILE: ProfileOverviewDto = {
  "user": {
    "fullName": "Jane Doe",
    "employeeId": "VNU-2024-085",
    "department": "Bộ môn Sinh thái học (Từ 2022)",
    "position": "Trưởng bộ môn",
    "email": "jane.doe@university.edu.vn",
    "phone": "090-123-4567"
  },
  "general_information": {
    "date_of_birth": "15/05/1988",
    "gender": "Nữ",
    "ethnicity": "Kinh",
    "religion": "Không"
  },
  "contact_details": {
    "hometown": "Hà Nội",
    "permanent_residence": "Q. Cầu Giấy, HN",
    "id_number": "001088******"
  },
  "salary_history": "Bậc 4 - Hệ số 4.0",
  "commendations": "Chiên sĩ thi đua cấp cơ sở Năm học 2023-2024",
  "position": {
    "title": "Trưởng bộ môn",
    "department_info": "Bộ môn Sinh thái học (Từ 2022)"
  },
  "educational_background": {
    "degree": "Tiến sĩ Sinh học",
    "institution_and_year": "Đại học Quốc gia Hà Nội - 2016"
  },
  "business_trips": {
    "purpose": "Hội nghị Đa dạng sinh học",
    "location_and_date": "Tokyo, Nhật Bản - 10/2024"
  }
};

export const mockProfileService = {
  getProfileOverview: async (): Promise<ProfileOverviewDto> => MOCK_PROFILE,
  getGeneralInfo: async (): Promise<string> => `
| Trường thông tin | Giá trị |
|---|---|
| Họ và tên | Jane Doe |
| Ngày sinh | 15/05/1988 |
`,
  getDetailedInfo: async (): Promise<string> => `### Địa chỉ liên lạc\n* Quê quán: Xã A, Huyện B, Tỉnh C`,
  getSalaryProgress: async (): Promise<string> => `| Thời điểm | Ngạch/Bậc | Hệ số |\n|---|---|---|`,
  getAwards: async (): Promise<string> => `### Danh sách khen thưởng\n* Chiến sĩ thi đua`,
  getPositionHistory: async (): Promise<string> => `| Giai đoạn | Chức vụ |`,
  getAcademicProgress: async (): Promise<string> => `### Quá trình đào tạo\n1. Tiến sĩ`,
  getTrainingProgress: async (): Promise<string> => `### Bồi dưỡng chuyên môn\n* GVC`,
  getBusinessMissions: async (): Promise<string> => `### Danh sách các chuyến công tác\n* Tokyo`
};

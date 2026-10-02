
import type { TeachingDto, CursorPagedResult, NotificationFilterRequest } from '../../types';

const COURSE_NAMES = [
  "Cơ sở dữ liệu", "Lập trình hướng đối tượng", "Cấu trúc dữ liệu và Giải thuật",
  "Mạng máy tính", "Hệ điều hành", "Phân tích và Thiết kế hệ thống",
  "Trí tuệ nhân tạo", "Học máy", "Xử lý ảnh số", "An ninh mạng",
  "Phát triển ứng dụng web", "Lập trình di động", "Thị giác máy tính",
  "Khoa học dữ liệu", "Thống kê máy tính", "Toán rời rạc",
  "Đại số tuyến tính", "Giải tích 1", "Giải tích 2", "Vật lý đại cương",
  "Sinh học đại cương", "Hóa học đại cương", "Kỹ năng mềm", "Khởi nghiệp",
  "Quản trị dự án phần mềm", "Kiểm thử phần mềm", "Kiến trúc máy tính",
  "Hệ thống nhúng", "Điện toán đám mây", "Dữ liệu lớn"
];

const MOCK_TEACHING: TeachingDto[] = Array.from({ length: 30 }, (_, i) => ({
  instanceId: `Học kỳ ${i % 2 + 1} Năm học 202${Math.floor(i / 6) + 1}-202${Math.floor(i / 6) + 2} (${i})`,
  title: `Chi tiết giảng dạy môn ${COURSE_NAMES[i % COURSE_NAMES.length]}`,
  content: `### Chi tiết giảng dạy\n\n| Môn học | Lớp | Số tiết | Ghi chú |\n|---|---|---|---|\n| ${COURSE_NAMES[i % COURSE_NAMES.length]} | L0${(i % 5) + 1} | 45 | Lý thuyết |\n| ${COURSE_NAMES[(i + 5) % COURSE_NAMES.length]} | C${(i % 3) + 1} | 30 | Thực hành |\n\n**Tổng số tiết quy đổi:** 105 tiết.`
}));

export const mockTeachingService = {
  getTeachingItems: async (request: NotificationFilterRequest): Promise<CursorPagedResult<TeachingDto>> => {
    const isFilterSpecified = !!request.search;

    if (!request.cursor) {
      console.log(`Mock Teaching: Loading first page. Filter specified: ${isFilterSpecified}`);
    } else {
      console.log(`Mock Teaching: Loading more items (cursor: ${request.cursor}). Filter specified: ${isFilterSpecified}`);
    }

    let filtered = [...MOCK_TEACHING];
    if (request.search) {
      const query = request.search.toLowerCase();
      filtered = filtered.filter(item => 
        item.instanceId.toLowerCase().includes(query) || 
        item.title.toLowerCase().includes(query) || 
        item.content.toLowerCase().includes(query)
      );
    }

    filtered.sort((a, b) => b.instanceId.localeCompare(a.instanceId));

    let startIdx = 0;
    if (request.cursor) {
      const cursorIdx = filtered.findIndex(item => item.instanceId === request.cursor);
      if (cursorIdx !== -1) startIdx = cursorIdx + 1;
    }

    const items = filtered.slice(startIdx, startIdx + request.pageSize);
    const nextCursor = items.length > 0 ? items[items.length - 1].instanceId : null;
    const hasNextPage = startIdx + request.pageSize < filtered.length;

    return {
      items,
      nextCursor,
      hasNextPage,
      totalCount: filtered.length,
      pageSize: request.pageSize
    };
  }
};

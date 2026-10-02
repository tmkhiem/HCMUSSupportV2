
import type { InitiativeDto, CursorPagedResult, NotificationFilterRequest } from '../../types';

const INITIATIVE_TITLES = [
  "Cải tiến quy trình đăng ký môn học trực tuyến",
  "Giải pháp tiết kiệm năng lượng tại các phòng thí nghiệm",
  "Phần mềm quản lý văn bản đi và đến (E-Office HCMUS)",
  "Hệ thống tự động hóa thư viện trung tâm",
  "Quy trình số hóa hồ sơ viên chức và người lao động",
  "Giải pháp nâng cao chất lượng wifi trong khuôn viên trường",
  "Ứng dụng chatbot hỗ trợ sinh viên 24/7",
  "Cải tiến hệ thống làm mát phòng máy chủ",
  "Mô hình phân loại rác thải tại nguồn trong trường học",
  "Hệ thống quản lý lịch trình giảng dạy thông minh",
  "Giải pháp lưu trữ đám mây cho nghiên cứu khoa học",
  "Quy trình xử lý phản hồi của người học về chất lượng đào tạo",
  "Hệ thống cấp mã QR cho thẻ sinh viên tích hợp",
  "Cải tiến công nghệ lọc nước tại các vòi uống nước công cộng",
  "Hệ thống giám sát an ninh bằng nhận diện khuôn mặt",
  "Giải pháp bồi dưỡng năng lực số cho giảng viên",
  "Hệ thống đăng ký mượn thiết bị thí nghiệm từ xa",
  "Quy trình đánh giá KPI nội bộ cho khối hành chính",
  "Ứng dụng di động theo dõi tiến độ nghiên cứu của học viên",
  "Cải tiến phương pháp giảng dạy tích hợp E-learning",
  "Hệ thống quản lý tài sản cố định bằng RFID",
  "Giải pháp hội nghị truyền hình chất lượng cao",
  "Hệ thống thanh toán học phí qua ví điện tử tích hợp",
  "Quy trình kiểm soát ra vào cơ sở 2 Linh Trung",
  "Hệ thống thông báo khẩn cấp qua ứng dụng nội bộ",
  "Cải tiến quy trình bảo trì máy tính phòng thực hành",
  "Giải pháp hỗ trợ khởi nghiệp cho sinh viên năm cuối",
  "Hệ thống quản lý dữ liệu xuất bản khoa học",
  "Quy trình liên kết đào tạo doanh nghiệp 4.0",
  "Hệ thống khảo sát trực tuyến ý kiến cổ đông giáo dục",
  "Giải pháp bảo mật mạng nội bộ đa tầng",
  "Hệ thống đăng ký thẻ gửi xe điện tử",
  "Cải tiến quy trình thi và kiểm tra trực tuyến",
  "Hệ thống quản lý ký túc xá thông minh",
  "Giải pháp phát triển cộng đồng cựu sinh viên trực tuyến"
];

export const mockInitiativeService = {
  getInitiatives: async (request: NotificationFilterRequest): Promise<CursorPagedResult<InitiativeDto>> => {
    const isFilterSpecified = !!request.search;

    const MOCK_INITIATIVES: InitiativeDto[] = INITIATIVE_TITLES.map((title, i) => ({
      instanceId: 300 + i,
      title: title,
      renderedBody: `### Chi tiết sáng kiến\n*   **Mã số hệ thống:** ${300 + i}\n*   **Mã hồ sơ:** SK-202${(i % 3) + 3}-00${300 + i}\n*   **Năm công nhận:** 202${(i % 3) + 3}\n*   **Chủ trì:** TS. Nguyễn Văn ${String.fromCharCode(65 + (i % 26))}\n*   **Mô tả:** Sáng kiến tập trung vào việc tối ưu hóa hiệu quả vận hành và giảm thiểu chi phí cho đơn vị.\n*   **Tỉ lệ đóng góp cá nhân:** ${10 + (i % 5) * 10}%`
    }));

    if (!request.cursor) {
      console.log(`Mock Initiatives: Loading first page. Filter specified: ${isFilterSpecified}`);
    } else {
      console.log(`Mock Initiatives: Loading more items (cursor: ${request.cursor}). Filter specified: ${isFilterSpecified}`);
    }

    let filtered = [...MOCK_INITIATIVES];
    if (request.search) {
      const query = request.search.toLowerCase();
      filtered = filtered.filter(item => 
        item.instanceId.toString().includes(query) ||
        item.title.toLowerCase().includes(query)
      );
    }
    
    filtered.sort((a, b) => b.instanceId - a.instanceId);

    let startIdx = 0;
    if (request.cursor) {
      const cursorVal = typeof request.cursor === 'string' ? parseInt(request.cursor, 10) : request.cursor;
      const cursorIdx = filtered.findIndex(item => item.instanceId === cursorVal);
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
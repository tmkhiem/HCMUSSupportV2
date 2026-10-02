
import type { NotificationDto, NotificationFilterRequest, CursorPagedResult } from '../../types';

const MOCK_NOTIFICATIONS: NotificationDto[] = [
  { instanceId: 1, title: "Kết quả đánh giá viên chức 2024", notificationDate: "2025/12/04", renderedBody: "Họ và tên: Jane\nĐơn vị: Khoa Sinh học\nKết quả đánh giá: Hoàn thành tốt nhiệm vụ", tags: ["news", "hr"] },
  { instanceId: 2, title: "Khảo sát sự hài lòng của vc-nlđ về wifi tại trường", notificationDate: "2025/11/23", renderedBody: "Kính gửi Quý Thầy/Cô\nKính mong quý Thầy Cô dành chút thời gian thực hiện khảo sát. \nTrân trọng.", tags: ["news", "survey"] },
  { instanceId: 3, title: "Khảo sát nhu cầu sử dụng Internet của Thầy Cô", notificationDate: "2025/06/16", renderedBody: "Kính gửi Quý Thầy/Cô\nKính mong quý Thầy Cô dành chút thời gian thực hiện khảo sát. \nTrân trọng.", tags: ["news", "survey"] },
  { instanceId: 4, title: "Kết quả đánh giá 1", notificationDate: "2024/12/02", renderedBody: "Họ và tên: Jane\nĐơn vị: Khoa Sinh học\nKết quả đánh giá Hoàn thành tốt nhiệm vụ", tags: ["news", "hr"] },
  { instanceId: 5, title: "Thông báo nghỉ lễ Quốc khánh 2/9", notificationDate: "2025/08/25", renderedBody: "Trường thông báo nghỉ lễ từ ngày 31/08 đến hết ngày 02/09.", tags: ["news", "system"] },
  { instanceId: 6, title: "Thay đổi quy định gửi xe", notificationDate: "2025/04/05", renderedBody: "Nhà trường áp dụng hệ thống thẻ từ mới cho bãi giữ xe.", tags: ["system"] },
  { instanceId: 7, title: "Hội nghị cán bộ viên chức năm 2025", notificationDate: "2025/10/10", renderedBody: "Kế hoạch tổ chức hội nghị cán bộ viên chức cấp trường.", tags: ["news", "event"] },
  { instanceId: 8, title: "Thông báo nộp hồ sơ nâng bậc lương", notificationDate: "2025/09/01", renderedBody: "Phòng TCCB thông báo tiếp nhận hồ sơ nâng bậc lương đợt 2/2025.", tags: ["hr"] },
  { instanceId: 9, title: "Lịch khám sức khỏe định kỳ năm 2025", notificationDate: "2025/08/15", renderedBody: "Nhà trường phối hợp với bệnh viện tổ chức khám sức khỏe.", tags: ["news", "hr"] },
  { instanceId: 10, title: "Cập nhật phần mềm quản lý giảng dạy", notificationDate: "2025/07/20", renderedBody: "Hệ thống sẽ tạm ngưng để bảo trì và cập nhật phiên bản mới.", tags: ["system"] },
  { instanceId: 11, title: "Thông báo đăng ký đề tài NCKH cấp cơ sở", notificationDate: "2025/05/12", renderedBody: "Mời các giảng viên đăng ký đề tài NCKH cho năm học tới.", tags: ["news", "research"] },
  { instanceId: 12, title: "Hội thảo quốc tế về Khoa học dữ liệu", notificationDate: "2025/03/30", renderedBody: "Hội thảo quy tụ các chuyên gia hàng đầu trong lĩnh vực DS.", tags: ["event", "research"] },
  { instanceId: 13, title: "Thông báo về việc quyết toán thuế TNCN", notificationDate: "2025/03/15", renderedBody: "Phòng Kế hoạch Tài chính hướng dẫn quyết toán thuế.", tags: ["finance"] },
  { instanceId: 14, title: "Lễ kỷ niệm ngày Nhà giáo Việt Nam 20/11", notificationDate: "2024/11/15", renderedBody: "Chương trình chào mừng ngày 20/11 tại hội trường chính.", tags: ["news", "event"] },
  { instanceId: 15, title: "Thông báo xét tặng danh hiệu Chiến sĩ thi đua", notificationDate: "2024/06/20", renderedBody: "Hội đồng Thi đua Khen thưởng thông báo lịch xét chọn.", tags: ["hr", "event"] },
  { instanceId: 16, title: "Cảnh báo an ninh mạng nội bộ", notificationDate: "2025/02/10", renderedBody: "Phát hiện các email lừa đảo mạo danh ban giám hiệu.", tags: ["system"] },
  { instanceId: 17, title: "Khóa đào tạo kỹ năng sư phạm số", notificationDate: "2025/01/25", renderedBody: "Đăng ký tham gia lớp bồi dưỡng kỹ năng giảng dạy online.", tags: ["news", "hr"] },
  { instanceId: 18, title: "Thông báo thay đổi lịch sinh hoạt chuyên môn", notificationDate: "2025/01/05", renderedBody: "Do trùng lịch họp, buổi sinh hoạt chuyên môn dời sang thứ 6.", tags: ["news"] },
  { instanceId: 19, title: "Phê duyệt danh mục thiết bị thí nghiệm mới", notificationDate: "2024/12/15", renderedBody: "Danh sách các thiết bị được đầu tư cho khoa Sinh học năm 2025.", tags: ["finance", "system"] },
  { instanceId: 20, title: "Thông báo về việc nghỉ Tết Nguyên Đán 2025", notificationDate: "2025/01/10", renderedBody: "Cán bộ, viên chức nghỉ tết từ ngày 25/01 đến hết 02/02.", tags: ["news", "system"] },
  { instanceId: 21, title: "Tổ chức ngày hội thể thao viên chức", notificationDate: "2024/10/05", renderedBody: "Giải bóng đá và cầu lông chào mừng kỷ niệm ngày thành lập trường.", tags: ["event"] },
  { instanceId: 22, title: "Quyết định bổ nhiệm cán bộ quản lý đợt 1", notificationDate: "2024/09/15", renderedBody: "Danh sách các nhân sự được bổ nhiệm vị trí mới.", tags: ["hr"] },
  { instanceId: 23, title: "Thông báo lịch trực hè 2025", notificationDate: "2025/06/01", renderedBody: "Phân công lịch trực lãnh đạo và hành chính trong kỳ nghỉ hè.", tags: ["news"] },
  { instanceId: 24, title: "Triển khai hệ thống E-Office mới", notificationDate: "2024/08/01", renderedBody: "Tất cả văn bản đi và đến sẽ được xử lý qua phần mềm mới.", tags: ["system"] },
  { instanceId: 25, title: "Thông báo về việc nhận thẻ bảo hiểm y tế", notificationDate: "2024/07/20", renderedBody: "Mời Thầy/Cô đến phòng TCCB nhận thẻ BHYT năm 2024-2025.", tags: ["hr"] },
  { instanceId: 26, title: "Họp sơ kết học kỳ 1 năm học 2024-2025", notificationDate: "2025/01/20", renderedBody: "Đánh giá kết quả thực hiện nhiệm vụ trong 6 tháng đầu năm.", tags: ["news", "event"] },
  { instanceId: 27, title: "Thông báo đăng ký lớp bồi dưỡng quản lý nhà nước", notificationDate: "2025/04/12", renderedBody: "Nhà trường tổ chức lớp bồi dưỡng ngạch chuyên viên chính.", tags: ["hr", "training"] },
  { instanceId: 28, title: "Kế hoạch thực tập sư phạm năm 2025", notificationDate: "2025/02/18", renderedBody: "Triển khai kế hoạch hướng dẫn sinh viên thực tập tại các trường THPT.", tags: ["news"] },
  { instanceId: 29, title: "Thông báo cấp kinh phí NCKH đợt 1/2025", notificationDate: "2025/03/05", renderedBody: "Các chủ nhiệm đề tài kiểm tra tài khoản để nhận kinh phí.", tags: ["research", "finance"] },
  { instanceId: 30, title: "Thông báo về việc sử dụng đồng phục trường", notificationDate: "2025/01/15", renderedBody: "Khuyến khích giảng viên mặc đồng phục vào ngày thứ Hai hàng tuần.", tags: ["system"] },
  { instanceId: 31, title: "Thông báo tham gia hiến máu nhân đạo", notificationDate: "2025/05/20", renderedBody: "Hội Chữ thập đỏ trường tổ chức ngày hội hiến máu tại cơ sở 1.", tags: ["event"] },
  { instanceId: 32, title: "Cập nhật quy chế chi tiêu nội bộ 2025", notificationDate: "2025/01/02", renderedBody: "Văn bản quy chế mới đã được đăng tải trên cổng thông tin nội bộ.", tags: ["finance", "system"] }
];

export const mockNotificationService = {
  getAllTags: async (): Promise<string[]> => {
    const tagSet = new Set<string>();
    MOCK_NOTIFICATIONS.forEach(item => {
      item.tags.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  },

  getNotifications: async (request: NotificationFilterRequest): Promise<CursorPagedResult<NotificationDto>> => {
    const isFilterSpecified = !!(request.search || request.tags?.length || request.dateFrom || request.dateTo);
    
    if (!request.cursor) {
      console.log(`Mock News: Loading first page. Filter specified: ${isFilterSpecified}`);
    } else {
      console.log(`Mock News: Loading more items (cursor: ${request.cursor}). Filter specified: ${isFilterSpecified}`);
    }

    let filtered = [...MOCK_NOTIFICATIONS];
    if (request.tags && request.tags.length > 0) {
      filtered = filtered.filter(item => 
        request.tags!.some(tag => 
          item.tags.some(it => it.toLowerCase() === tag.toLowerCase())
        )
      );
    }
    if (request.dateFrom) filtered = filtered.filter(item => item.notificationDate >= request.dateFrom!);
    if (request.dateTo) filtered = filtered.filter(item => item.notificationDate <= request.dateTo!);
    if (request.search) {
      const q = request.search.toLowerCase();
      filtered = filtered.filter(item => item.title.toLowerCase().includes(q) || item.renderedBody.toLowerCase().includes(q));
    }
    
    // Default descending sort
    filtered.sort((a, b) => b.notificationDate.localeCompare(a.notificationDate) || b.instanceId - a.instanceId);

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
  },

  searchInNotifications: async (query: string, data: NotificationDto[]): Promise<NotificationDto[]> => {
    if (!query) return data;
    const lowerQuery = query.toLowerCase();
    return data.filter(item => 
      item.title.toLowerCase().includes(lowerQuery) || 
      item.renderedBody.toLowerCase().includes(lowerQuery)
    );
  }
};

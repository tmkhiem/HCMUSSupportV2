
import type { ResearchTopicDto, ResearchPaperDto, CursorPagedResult, NotificationFilterRequest } from '../../types';

const RESEARCH_TOPICS_TITLES = [
  "Ứng dụng AI trong chẩn đoán sớm bệnh lý võng mạc",
  "Nghiên cứu mô hình ngôn ngữ lớn cho tiếng Việt chuyên ngành y tế",
  "Phát triển hệ thống IoT giám sát ô nhiễm không khí tại TP.HCM",
  "Giải pháp bảo mật dựa trên Blockchain cho chuỗi cung ứng nông sản",
  "Nghiên cứu vật liệu nano mới cho pin lithium-ion",
  "Tối ưu hóa thuật toán phân cụm dữ liệu quy mô lớn",
  "Phân tích đa dạng sinh học tại khu bảo tồn Cần Giờ",
  "Nghiên cứu tác động của biến đổi khí hậu đến mực nước biển",
  "Phát triển vaccine thế hệ mới dựa trên công nghệ mRNA",
  "Thiết kế hệ thống nhúng thông minh cho xe tự hành",
  "Nghiên cứu phương pháp mã hóa hậu lượng tử",
  "Ứng dụng Deep Learning trong nhận dạng cử chỉ tay",
  "Phát triển màng lọc sinh học xử lý nước thải dệt nhuộm",
  "Nghiên cứu cấu trúc Protein bằng phương pháp mô phỏng máy tính",
  "Xây dựng hệ thống khuyến nghị cá nhân hóa cho thương mại điện tử",
  "Nghiên cứu sự tương tác giữa vi khuẩn và rễ cây lúa",
  "Phát triển cảm biến sinh học phát hiện dư lượng thuốc trừ sâu",
  "Nghiên cứu thuật toán nén video cho đường truyền băng thông thấp",
  "Ứng dụng dữ liệu lớn trong dự báo thị trường chứng khoán",
  "Nghiên cứu tác động của mạng xã hội đến tâm lý thanh thiếu niên",
  "Phát triển hệ điều hành cho vệ tinh nhỏ (CubeSat)",
  "Nghiên cứu giải pháp lưu trữ năng lượng xanh từ hydro",
  "Xây dựng bản đồ gene của các loài thảo dược quý hiếm",
  "Nghiên cứu mô hình học sâu tiết kiệm năng lượng",
  "Phát triển hệ thống tương tác người-máy dựa trên sóng não (BCI)",
  "Nghiên cứu vật liệu siêu dẫn nhiệt độ cao",
  "Ứng dụng thực tế ảo tăng cường trong giáo dục phổ thông",
  "Phân tích độc học của các hạt vi nhựa trong môi trường nước",
  "Nghiên cứu cơ chế kháng kháng sinh của vi khuẩn Gram âm",
  "Phát triển hệ thống hỗ trợ ra quyết định cho quản lý đô thị thông minh"
];

const RESEARCH_PAPERS_TITLES = [
  "A Deep Learning Approach to Vietnamese Sentiment Analysis",
  "Next-Generation Energy Storage: The Role of Silicon Nanowires",
  "Security and Privacy Challenges in Industrial IoT Ecosystems",
  "Efficient Resource Allocation in 6G Heterogeneous Networks",
  "Impact of Urban Expansion on Local Microclimates in Southeast Asia",
  "Blockchain-based Decentralized Identity Management Systems",
  "Meta-Analysis of COVID-19 Variants: A Genomic Perspective",
  "Real-time Object Detection using Lightweight Neural Networks",
  "Graph Neural Networks for Social Network Link Prediction",
  "Advances in Natural Language Understanding: Beyond Transformers",
  "Privacy-Preserving Federated Learning for Medical Imaging",
  "Synthesis and Characterization of Novel Graphene-based Composites",
  "Machine Learning Models for Earthquake Magnitude Prediction",
  "Optimal Routing Protocols for Underwater Wireless Sensor Networks",
  "Evaluating the Efficiency of Public Transportation using Big Data",
  "Sustainable Water Purification via Photocatalytic Nanomaterials",
  "Cross-lingual Transfer Learning for Low-Resource Languages",
  "An Automated System for Crop Disease Identification",
  "Cryptography in the Era of Quantum Computing",
  "Bio-inspired Optimization Algorithms for Warehouse Logistics",
  "Human Activity Recognition using Wearable Sensors and LSTM",
  "Smart Contracts for Transparent Charity Funding Platforms",
  "The Evolution of Cybersecurity Threats in Cloud Environments",
  "Non-invasive Glucose Monitoring: A Review of Optical Methods",
  "Scalable Data Mining on Distributed Computing Frameworks",
  "Integration of Renewables in Smart Grids: Technical Challenges",
  "Robust Speech Recognition in Noisy Industrial Environments",
  "Assessing the Potential of Carbon Capture and Storage Technologies",
  "Multi-agent Reinforcement Learning for Traffic Signal Control",
  "Ethical Implications of AI in Automated Decision Making"
];

const MOCK_TOPICS: ResearchTopicDto[] = RESEARCH_TOPICS_TITLES.map((title, i) => ({
  instanceId: `RT-${1000 + i}`,
  title: `Đề tài: ${title}`,
  content: `### Chi tiết đề tài\n*   **Chủ nhiệm:** TS. Nguyễn Văn ${String.fromCharCode(65 + (i % 26))}\n*   **Mã số:** RT-${1000 + i}\n*   **Kinh phí:** ${50 + i * 10} triệu VNĐ\n*   **Mục tiêu:** Giải quyết các vấn đề cấp bách trong lĩnh vực nghiên cứu chuyên sâu.`
}));

const MOCK_PAPERS: ResearchPaperDto[] = RESEARCH_PAPERS_TITLES.map((title, i) => ({
  instanceId: `RP-${2000 + i}`,
  title: `Công bố: ${title}`,
  content: `### Thông tin bài báo\n*   **DOI:** 10.1038/s41598-02${i % 9}-00${i}\n*   **Impact Factor:** ${2.5 + (i % 5)}\n*   **Tóm tắt:** Bài báo đề xuất các phương pháp mới và đóng góp quan trọng vào tri thức nhân loại.`
}));

export const mockResearchService = {
  getTopics: async (request: NotificationFilterRequest): Promise<CursorPagedResult<ResearchTopicDto>> => {
    const isFilterSpecified = !!request.search;

    if (!request.cursor) {
      console.log(`Mock Topics: Loading first page. Filter specified: ${isFilterSpecified}`);
    } else {
      console.log(`Mock Topics: Loading more items (cursor: ${request.cursor}). Filter specified: ${isFilterSpecified}`);
    }

    let filtered = [...MOCK_TOPICS];
    if (request.search) {
      const query = request.search.toLowerCase();
      filtered = filtered.filter(item => item.title.toLowerCase().includes(query));
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

    return { items, nextCursor, hasNextPage, totalCount: filtered.length, pageSize: request.pageSize };
  },
  getPapers: async (request: NotificationFilterRequest): Promise<CursorPagedResult<ResearchPaperDto>> => {
    const isFilterSpecified = !!request.search;

    if (!request.cursor) {
      console.log(`Mock Papers: Loading first page. Filter specified: ${isFilterSpecified}`);
    } else {
      console.log(`Mock Papers: Loading more items (cursor: ${request.cursor}). Filter specified: ${isFilterSpecified}`);
    }

    let filtered = [...MOCK_PAPERS];
    if (request.search) {
      const query = request.search.toLowerCase();
      filtered = filtered.filter(item => item.title.toLowerCase().includes(query));
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

    return { items, nextCursor, hasNextPage, totalCount: filtered.length, pageSize: request.pageSize };
  }
};

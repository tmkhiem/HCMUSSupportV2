/** Vietnamese labels for known audit actions; unknown ones show the raw action name. */
const LABELS: Record<string, string> = {
  'auth.login': 'Đăng nhập',
  'auth.logout': 'Đăng xuất',
  'roles.granted': 'Cấp quyền',
  'roles.revoked': 'Thu hồi quyền',
  'viewas.started': 'Bắt đầu xem thử',
  'viewas.stopped': 'Kết thúc xem thử',
  'viewas.read': 'Đọc dữ liệu khi xem thử',
  'employee.status_changed': 'Đổi trạng thái cán bộ',
  'employee.created': 'Tạo cán bộ thủ công',
  'group.created': 'Tạo nhóm',
  'group.updated': 'Cập nhật nhóm',
  'group.archived': 'Lưu trữ nhóm',
  'group.restored': 'Khôi phục nhóm',
  'group.members_added': 'Thêm thành viên nhóm',
  'group.members_removed': 'Xóa thành viên nhóm',
  'group.members_imported': 'Nhập thành viên nhóm',
  'group.recomputed': 'Tính lại nhóm',
  'sync.issue_resolve': 'Xử lý vấn đề đồng bộ',
  'profile.sensitive_reveal': 'Xem thông tin nhạy cảm',
}

export function actionLabel(action: string | null | undefined): string {
  if (!action) return '—'
  return LABELS[action] ?? action
}

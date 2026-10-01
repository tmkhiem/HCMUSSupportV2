import { ApiError } from '../../api/http'

/** The backend answers 404 when the signed-in person has no HRM profile yet: that is an empty state, not an error. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

export const NO_PROFILE_MESSAGE = 'Chưa có hồ sơ trong hệ thống. Vui lòng liên hệ Phòng Tổ chức - Cán bộ để được cập nhật.'

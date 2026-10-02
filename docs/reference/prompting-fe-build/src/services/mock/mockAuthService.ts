
import type { UserDto } from '../../types';

export const mockAuthService = {
  getStatus: async (): Promise<UserDto | null> => ({
    UserId: "mock-user-123",
    FullName: "Jane Doe Mock",
    Emails: "jane.doe@mock.com",
    PpUrl: "",
    IsAdmin: true
  }),
  logout: async () => true,
  getLoginUrl: () => "#"
};

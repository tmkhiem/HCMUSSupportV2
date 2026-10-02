
import type { UserDto, GroupDto, NotificationDto, CursorPagedResult } from '../../types';

export const mockAdminService = {
  getUsers: async (pageSize: number, cursor?: string | number, filter?: string): Promise<CursorPagedResult<UserDto>> => {
    // Mock empty implementation
    return { 
      items: [], 
      nextCursor: null, 
      hasNextPage: false, 
      totalCount: 0, 
      pageSize 
    };
  },
  getGroups: async (pageSize: number, cursor?: string | number, filter?: string): Promise<CursorPagedResult<GroupDto>> => {
    // Mock empty implementation
    return { 
      items: [], 
      nextCursor: null, 
      hasNextPage: false, 
      totalCount: 0, 
      pageSize 
    };
  },
  getUserProfile: async (userId: string): Promise<string> => "# Profile Content",
  getGroupDetails: async (groupName: string) => null,
  updateGroupInfo: async (groupId: string, groupName: string, groupMembers: string[]) => true,
  getAllTags: async (): Promise<string[]> => ["news", "system", "hr", "event", "research", "finance", "survey", "training"],
  findUsersByKeyword: async (q: string): Promise<UserDto[]> => [],
  findGroupsByKeyword: async (q: string): Promise<string[]> => [],
  viewAs: async (userId: string) => null,
  uploadRecipientFile: async (type: 'users' | 'groups'): Promise<string[]> => [],
  createEventWithTargets: async (data: any) => true,
  getViewAsItems: async (userId: string, category: string, pageSize: number, cursor?: string | number, keyword?: string): Promise<CursorPagedResult<NotificationDto>> => {
    return {
      items: [],
      nextCursor: null,
      hasNextPage: false,
      totalCount: 0,
      pageSize
    };
  }
};


import { appConfig } from '../../appConfig';
import { authorizedFetch } from './apiClient';
import type { UserDto, GroupDto, CursorPagedResult, NotificationDto } from '../../types';

const handleJsonResponse = async (res: Response, fallback: any = null) => {
  if (!res.ok) return fallback;
  const text = await res.text();
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse JSON", e);
    return fallback;
  }
};

export const mainAdminService = {
  getUsers: async (pageSize: number, cursor?: string | number, filter?: string): Promise<CursorPagedResult<UserDto>> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/admin/getUsers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursor, filter, pageSize })
    });
    return handleJsonResponse(res, { items: [], nextCursor: null, hasNextPage: false, pageSize });
  },
  getGroups: async (pageSize: number, cursor?: string | number, filter?: string): Promise<CursorPagedResult<GroupDto>> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/admin/getGroups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursor, filter, pageSize })
    });
    return handleJsonResponse(res, { items: [], nextCursor: null, hasNextPage: false, pageSize });
  },
  getUserProfile: async (userId: string) => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/admin/getUserProfile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    return res.text();
  },
  getGroupDetails: async (groupName: string) => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/admin/getGroupDetails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupName })
    });
    return handleJsonResponse(res, null);
  },
  updateGroupInfo: async (groupId: string, groupName: string, groupMembers: string[]) => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/admin/updateGroupInfo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, groupName, groupMembers })
    });
    return handleJsonResponse(res, false);
  },
  getAllTags: async () => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/admin/getAllTags`, { method: 'POST' });
    return handleJsonResponse(res, []);
  },
  findUsersByKeyword: async (q: string) => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/admin/findUsersByKeyword`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q })
    });
    return handleJsonResponse(res, []);
  },
  findGroupsByKeyword: async (q: string) => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/admin/findGroupsByKeyword`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q })
    });
    return handleJsonResponse(res, []);
  },
  viewAs: async (userId: string) => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/admin/viewAs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    return handleJsonResponse(res, null);
  },
  uploadRecipientFile: async (type: 'users' | 'groups') => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/admin/uploadRecipientFile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type })
    });
    return handleJsonResponse(res, []);
  },
  createEventWithTargets: async (data: any) => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/admin/createEventWithTargets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleJsonResponse(res, false);
  },
  getViewAsItems: async (userId: string, category: string, pageSize: number, cursor?: string | number, keyword?: string): Promise<CursorPagedResult<NotificationDto>> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/admin/getViewAsItems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, category, pageSize, cursor, keyword })
    });
    return handleJsonResponse(res, { items: [], nextCursor: null, hasNextPage: false, pageSize });
  }
};

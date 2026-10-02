
import type { NotificationDto, NotificationFilterRequest, CursorPagedResult } from '../../types';
import { appConfig } from '../../appConfig';
import { authorizedFetch } from './apiClient';

export const mainNotificationService = {
  getAllTags: async (): Promise<string[]> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/notification/getAllTags`, { method: 'POST' });
    if (!res.ok) return [];
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  },

  getNotifications: async (request: NotificationFilterRequest): Promise<CursorPagedResult<NotificationDto>> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/notification/getNotifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (!res.ok) return { items: [], nextCursor: null, hasNextPage: false, pageSize: request.pageSize };
    const text = await res.text();
    return text ? JSON.parse(text) : { items: [], nextCursor: null, hasNextPage: false, pageSize: request.pageSize };
  },

  searchInNotifications: async (query: string, data: NotificationDto[]): Promise<NotificationDto[]> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/notification/searchInNotifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, data })
    });
    if (!res.ok) return data;
    const text = await res.text();
    return text ? JSON.parse(text) : data;
  }
};

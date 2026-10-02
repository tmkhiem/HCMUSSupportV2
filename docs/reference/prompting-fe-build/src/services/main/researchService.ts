
import type { ResearchTopicDto, ResearchPaperDto, CursorPagedResult, NotificationFilterRequest } from '../../types';
import { appConfig } from '../../appConfig';
import { authorizedFetch } from './apiClient';

export const mainResearchService = {
  getTopics: async (params: NotificationFilterRequest): Promise<CursorPagedResult<ResearchTopicDto>> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/research/getTopics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) return { items: [], nextCursor: null, hasNextPage: false, pageSize: params.pageSize };
    const text = await res.text();
    return text ? JSON.parse(text) : { items: [], nextCursor: null, hasNextPage: false, pageSize: params.pageSize };
  },
  getPapers: async (params: NotificationFilterRequest): Promise<CursorPagedResult<ResearchPaperDto>> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/research/getPapers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) return { items: [], nextCursor: null, hasNextPage: false, pageSize: params.pageSize };
    const text = await res.text();
    return text ? JSON.parse(text) : { items: [], nextCursor: null, hasNextPage: false, pageSize: params.pageSize };
  }
};

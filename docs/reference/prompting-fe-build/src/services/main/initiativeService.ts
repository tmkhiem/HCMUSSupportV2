
import type { InitiativeDto, CursorPagedResult, NotificationFilterRequest } from '../../types';
import { appConfig } from '../../appConfig';
import { authorizedFetch } from './apiClient';

export const mainInitiativeService = {
  getInitiatives: async (params: NotificationFilterRequest): Promise<CursorPagedResult<InitiativeDto>> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/initiative/getInitiatives`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) return { items: [], nextCursor: null, hasNextPage: false, pageSize: params.pageSize };
    const text = await res.text();
    return text ? JSON.parse(text) : { items: [], nextCursor: null, hasNextPage: false, pageSize: params.pageSize };
  }
};


import { appConfig } from '../../appConfig';
import type { UserDto } from '../../types';
import { authorizedFetch } from './apiClient';

export const mainAuthService = {  
  getStatus: async (): Promise<UserDto | null> => {
    try {
      // Use authorizedFetch to ensure credentials (cookies) are sent
      const res = await authorizedFetch(`${appConfig.backendUrl}/api/auth/status`);
      if (res.status === 401) return null;
      if (res.ok) {
        return await res.json();
      }
      throw new Error(`Auth check failed with status ${res.status}`);
    } catch (e) {
      console.error("Auth status error", e);
      throw e;
    }
  },
  logout: async (): Promise<boolean> => {
    console.log('Logging out (main service)...')
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/auth/logout`, {
      method: 'GET'
    });
    return res.status === 200;
  },
  getLoginUrl: () => `${appConfig.backendUrl}/api/auth/login`
};

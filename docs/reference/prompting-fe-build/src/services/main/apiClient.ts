
import { appConfig } from '../../appConfig';

export const authorizedFetch = async (url: string, options: RequestInit = {}) => {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
  });
  
  // If the request is not to the auth status endpoint and returns 401, reload the page
  if (response.status === 401 && !url.includes('/api/auth/status')) {
    window.location.reload();
  }
  
  return response;
};

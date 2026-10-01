import { useQuery } from '@tanstack/react-query'
import { http } from '../api/http'
import { MOCK_AUTH } from '../auth/useMe'

export interface SystemInfo {
  version?: string
}

/** `GET /api/system/info` (D01). Failure is silent: the account menu just shows no version. */
export function useSystemInfo() {
  return useQuery({
    queryKey: ['system', 'info'],
    queryFn: () => http.get<SystemInfo>('/api/system/info', { skipUnauthorizedHandler: true }),
    enabled: !MOCK_AUTH,
    staleTime: Infinity,
    retry: false,
  })
}

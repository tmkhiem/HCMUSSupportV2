import { useQuery } from '@tanstack/react-query'
import { systemClient } from '../api/clients'
import { MOCK_AUTH } from '../auth/useMe'

/** `GET /api/system/info` (D01) through the generated client. Failure is silent: the account menu just shows no version. */
export function useSystemInfo() {
  return useQuery({
    queryKey: ['system', 'info'],
    queryFn: () => systemClient.info(),
    enabled: !MOCK_AUTH,
    staleTime: Infinity,
    retry: false,
  })
}

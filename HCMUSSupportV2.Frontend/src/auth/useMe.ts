import { useQuery } from '@tanstack/react-query'
import { authClient } from '../api/clients'
import { ApiError } from '../api/http'
import { toMe } from './types'
import type { Me } from './types'

export const meQueryKey = ['auth', 'me'] as const

/**
 * Dev-only mock auth. `import.meta.env.DEV` is a build-time constant, so in a production build this whole
 * branch (and the dynamically imported mock module) is dead code and removed, even if the variable leaks in.
 */
export const MOCK_AUTH = import.meta.env.DEV && import.meta.env.VITE_MOCK_AUTH === '1'

/**
 * `GET /api/auth/me`. As a side effect the response (re)issues the `XSRF-TOKEN` cookie that unsafe requests
 * need, so this must run again after every sign-in or user switch.
 */
export async function fetchMe(): Promise<Me | null> {
  if (MOCK_AUTH) {
    const { createMockMe } = await import('./mockMe')
    return createMockMe(window.location.search)
  }
  try {
    return toMe(await authClient.me())
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null
    throw e
  }
}

/** The signed-in user. `data === null` means signed out (401); an error means the check itself failed. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
    staleTime: MOCK_AUTH ? Infinity : 5 * 60_000,
    retry: false,
  })
}

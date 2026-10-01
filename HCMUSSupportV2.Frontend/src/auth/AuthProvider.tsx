import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { authClient } from '../api/clients'
import { http, setUnauthorizedHandler } from '../api/http'
import { AuthContext } from './authContext'
import type { AuthContextValue, AuthStatus } from './authContext'
import { clearUserData, refreshSession } from './session'
import { MOCK_AUTH, meQueryKey, useMe } from './useMe'
import { hasRole } from './types'
import type { Me } from './types'

/**
 * Owns the session state: `GET /api/auth/me` through TanStack Query, 401 -> signed out, and the global 401
 * handler from `api/http.ts`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const query = useMe()

  useEffect(() => {
    // Any 401 from the API means the session is gone: drop the cached user so RequireAuth sends us to login.
    setUnauthorizedHandler(() => qc.setQueryData<Me | null>(meQueryKey, null))
    return () => setUnauthorizedHandler(null)
  }, [qc])

  const me = query.data ?? null
  const status: AuthStatus = query.isError
    ? 'error'
    : query.isPending
      ? 'loading'
      : me
        ? 'authenticated'
        : 'unauthenticated'

  const value: AuthContextValue = {
    status,
    me,
    error: query.error,
    hasRole: (role) => hasRole(me, role),
    refetch: () => void query.refetch(),
    logout: async () => {
      if (!MOCK_AUTH) {
        try {
          // Sends X-XSRF-TOKEN (clientFetch). A 400/401 means the session is already gone; either way sign out locally.
          await authClient.logout()
        } catch {
          // ignored on purpose
        }
      }
      // Signed out now: RequireAuth redirects to the login page (with the page we came from as returnUrl).
      clearUserData(qc)
      qc.setQueryData<Me | null>(meQueryKey, null)
      // Confirm with the server (401 -> null) so the cached state matches the cleared cookie.
      if (!MOCK_AUTH) await qc.invalidateQueries({ queryKey: meQueryKey })
    },
    exitViewAs: async () => {
      if (!MOCK_AUTH) await http.delete('/api/admin/view-as')
      if (MOCK_AUTH) {
        // The mock reads ?mock-view-as from the URL; drop it so the bar goes away.
        const url = new URL(window.location.href)
        url.searchParams.delete('mock-view-as')
        window.history.replaceState(null, '', url)
      }
      await refreshSession(qc)
    },
  }

  return <AuthContext value={value}>{children}</AuthContext>
}

import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { http, setUnauthorizedHandler } from '../api/http'
import { AuthContext } from './authContext'
import type { AuthContextValue, AuthStatus } from './authContext'
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

  const signedOut = () => {
    // Keep the (now null) auth entry, forget everything user-specific.
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== meQueryKey[0] })
    qc.setQueryData<Me | null>(meQueryKey, null)
  }

  const value: AuthContextValue = {
    status,
    me,
    error: query.error,
    hasRole: (role) => hasRole(me, role),
    refetch: () => void query.refetch(),
    logout: async () => {
      if (!MOCK_AUTH) {
        try {
          await http.post('/api/auth/logout', undefined, { skipUnauthorizedHandler: true })
        } catch {
          // The cookie may already be gone; either way the user is signed out locally.
        }
      }
      signedOut()
    },
    exitViewAs: async () => {
      if (!MOCK_AUTH) await http.delete('/api/admin/view-as')
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== meQueryKey[0] })
      if (MOCK_AUTH) {
        // The mock reads ?mock-view-as from the URL; drop it so the bar goes away.
        const url = new URL(window.location.href)
        url.searchParams.delete('mock-view-as')
        window.history.replaceState(null, '', url)
      }
      await qc.invalidateQueries({ queryKey: meQueryKey })
    },
  }

  return <AuthContext value={value}>{children}</AuthContext>
}

import { createContext, useContext } from 'react'
import type { Me, Role } from './types'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error'

export interface AuthContextValue {
  status: AuthStatus
  /** Non-null only when `status === 'authenticated'`. */
  me: Me | null
  error: unknown
  hasRole: (role: Role | undefined) => boolean
  refetch: () => void
  logout: () => Promise<void>
  /** Ends an admin's view-as session and reloads the user. */
  exitViewAs: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** The signed-in user. Only call below `RequireAuth`. */
export function useCurrentUser(): Me {
  const { me } = useAuth()
  if (!me) throw new Error('useCurrentUser called while signed out')
  return me
}

import type { QueryClient } from '@tanstack/react-query'
import { meQueryKey } from './useMe'

/** Forget everything user-specific except the auth entry itself. */
export function clearUserData(qc: QueryClient) {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== meQueryKey[0] })
}

/**
 * After a sign-in or user switch: drop the previous person's cached data and refetch `me`, which also refreshes
 * the `XSRF-TOKEN` cookie (it is bound to the signed-in user).
 */
export async function refreshSession(qc: QueryClient) {
  clearUserData(qc)
  await qc.invalidateQueries({ queryKey: meQueryKey })
}

import { ApiError } from '../api/http'

/** The server's (Vietnamese) message for an `ApiError`, otherwise the caller's specific fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback
}

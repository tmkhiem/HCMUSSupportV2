/**
 * Tiny fetch wrapper for the hand-written bits (auth, system info). Everything else will go through the NSwag
 * client in `generated-client.ts`, which can reuse `apiFetch` as its `fetch` implementation.
 *
 * - Same-origin cookie session: `credentials: 'include'`.
 * - Non-2xx -> `ApiError` carrying the RFC 7807 ProblemDetails (Vietnamese `detail` is safe to show).
 * - A 401 anywhere calls the registered handler (AuthProvider logs the user out -> login screen).
 */

export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  errors?: Record<string, string[]>
  [key: string]: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly problem?: ProblemDetails

  constructor(status: number, message: string, problem?: ProblemDetails) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }
}

let unauthorizedHandler: (() => void) | null = null

/** Registered by `AuthProvider`. Pass `null` to unregister. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

export interface RequestOptions extends Omit<RequestInit, 'body' | 'method'> {
  /** Plain objects are sent as JSON; `FormData` is passed through untouched. */
  body?: unknown
  /** The caller treats 401 as a normal answer (e.g. `GET /api/auth/me`), so don't fire the global handler. */
  skipUnauthorizedHandler?: boolean
}

function describe(status: number, problem: ProblemDetails | undefined): string {
  if (problem?.detail) return problem.detail
  if (problem?.title) return problem.title
  if (status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.'
  if (status === 404) return 'Không tìm thấy dữ liệu.'
  return `Có lỗi xảy ra (HTTP ${status}). Vui lòng thử lại.`
}

async function readProblem(res: Response): Promise<ProblemDetails | undefined> {
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('json')) return undefined
  try {
    return (await res.json()) as ProblemDetails
  } catch {
    return undefined
  }
}

/** Low-level: returns the raw `Response` for 2xx, throws `ApiError` otherwise. */
export async function apiFetch(path: string, method: string, options: RequestOptions = {}): Promise<Response> {
  const { body, skipUnauthorizedHandler, headers, ...rest } = options
  const init: RequestInit = { credentials: 'include', ...rest, method, headers: new Headers(headers) }
  const h = init.headers as Headers
  h.set('Accept', 'application/json, application/problem+json')
  if (body instanceof FormData) {
    init.body = body
  } else if (body !== undefined) {
    h.set('Content-Type', 'application/json')
    init.body = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(path, init)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError(0, 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.')
  }

  if (res.ok) return res

  const problem = await readProblem(res)
  if (res.status === 401 && !skipUnauthorizedHandler) unauthorizedHandler?.()
  throw new ApiError(res.status, describe(res.status, problem), problem)
}

async function request<T>(path: string, method: string, options?: RequestOptions): Promise<T> {
  const res = await apiFetch(path, method, options)
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('json')) return undefined as T
  return (await res.json()) as T
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, 'GET', options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, 'POST', { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, 'PUT', { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, 'DELETE', options),
}

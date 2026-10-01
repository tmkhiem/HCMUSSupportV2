import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, clientFetch, http, readXsrfToken, setUnauthorizedHandler } from './http'

function respond(status: number, body?: unknown, contentType = 'application/json'): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'content-type': contentType },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/'
  setUnauthorizedHandler(null)
})

describe('http', () => {
  it('sends credentials and parses JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(http.get('/api/thing')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/thing', expect.objectContaining({ credentials: 'include', method: 'GET' }))
  })

  it('serialises plain bodies as JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, {}))
    vi.stubGlobal('fetch', fetchMock)

    await http.post('/api/thing', { a: 1 })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.body).toBe('{"a":1}')
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json')
  })

  it('returns undefined for 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(204)))
    await expect(http.delete('/api/thing')).resolves.toBeUndefined()
  })

  it('throws ApiError carrying the ProblemDetails detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respond(422, { title: 'Invalid', detail: 'Email đã được dùng.', status: 422 }, 'application/problem+json')),
    )
    const error = await http.post('/api/x', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(422)
    expect((error as ApiError).message).toBe('Email đã được dùng.')
    expect((error as ApiError).problem?.title).toBe('Invalid')
  })

  it('falls back to a Vietnamese message when there is no problem body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(500)))
    await expect(http.get('/api/x')).rejects.toThrow('HTTP 500')
  })

  it('reports network failures as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(http.get('/api/x')).rejects.toMatchObject({ status: 0 })
  })

  it('calls the global handler on 401 and still throws', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(401)))

    await expect(http.get('/api/x')).rejects.toMatchObject({ status: 401 })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('skips the global handler when the caller treats 401 as an answer', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(401)))

    await expect(http.get('/api/auth/me', { skipUnauthorizedHandler: true })).rejects.toMatchObject({ status: 401 })
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('antiforgery', () => {
  const headerOf = (fetchMock: ReturnType<typeof vi.fn>) => (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers

  it('reads and decodes the XSRF-TOKEN cookie', () => {
    expect(readXsrfToken('a=1; XSRF-TOKEN=ab%2Bc%3D; b=2')).toBe('ab+c=')
    expect(readXsrfToken('a=1')).toBeUndefined()
    expect(readXsrfToken('NOT-XSRF-TOKEN=x')).toBeUndefined()
  })

  it('adds X-XSRF-TOKEN on unsafe methods only', async () => {
    document.cookie = 'XSRF-TOKEN=tok%2F1; path=/'
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(respond(200, {})))
    vi.stubGlobal('fetch', fetchMock)

    for (const method of ['post', 'put', 'delete'] as const) {
      fetchMock.mockClear()
      await http[method]('/api/x')
      expect(headerOf(fetchMock).get('X-XSRF-TOKEN')).toBe('tok/1')
    }
    fetchMock.mockClear()
    await http.get('/api/x')
    expect(headerOf(fetchMock).has('X-XSRF-TOKEN')).toBe(false)
  })

  it('sends no header when there is no cookie yet', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, {}))
    vi.stubGlobal('fetch', fetchMock)
    await http.post('/api/x', {})
    expect(headerOf(fetchMock).has('X-XSRF-TOKEN')).toBe(false)
  })
})

describe('clientFetch (NSwag)', () => {
  it('adds credentials and the XSRF header, and returns the Response', async () => {
    document.cookie = 'XSRF-TOKEN=abc; path=/'
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { ok: 1 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await clientFetch.fetch('/api/auth/logout', { method: 'POST', headers: {} })
    expect(res.status).toBe(200)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.credentials).toBe('include')
    expect((init.headers as Headers).get('X-XSRF-TOKEN')).toBe('abc')
  })

  it('rejects with ApiError and fires the 401 handler, except for /api/auth/me', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(respond(401))))

    await expect(clientFetch.fetch('/api/auth/me')).rejects.toMatchObject({ status: 401 })
    expect(handler).not.toHaveBeenCalled()
    await expect(clientFetch.fetch('/api/other?x=1')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

import { AuthClient, SystemClient } from './generated-client'
import { clientFetch } from './http'

/** Typed NSwag clients. They share `clientFetch`: cookies, `X-XSRF-TOKEN`, ProblemDetails -> `ApiError`, 401 handler. */
export const authClient = new AuthClient(undefined, clientFetch)
export const systemClient = new SystemClient(undefined, clientFetch)

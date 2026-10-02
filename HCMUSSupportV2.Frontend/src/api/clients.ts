import { AuthClient, NotificationsClient, SystemClient, TagsClient } from './generated-client'
import { clientFetch } from './http'

/** Typed NSwag clients. They share `clientFetch`: cookies, `X-XSRF-TOKEN`, ProblemDetails -> `ApiError`, 401 handler. */
export const authClient = new AuthClient(undefined, clientFetch)
export const systemClient = new SystemClient(undefined, clientFetch)
/** Inbox (D08). `NotificationsClient.get` is not used: its `vars` is the abstract `JsonNode`, which cannot be deserialised. */
export const notificationsClient = new NotificationsClient(undefined, clientFetch)
export const tagsClient = new TagsClient(undefined, clientFetch)

import { AuthClient, ManageEmployeesClient, MeClient, NotificationsClient, SystemClient, TagsClient } from './generated-client'
import { clientFetch } from './http'

/** Typed NSwag clients. They share `clientFetch`: cookies, `X-XSRF-TOKEN`, ProblemDetails -> `ApiError`, 401 handler. */
export const authClient = new AuthClient(undefined, clientFetch)
export const systemClient = new SystemClient(undefined, clientFetch)
/** Inbox (D08). `NotificationsClient.get` is not used: its `vars` is the abstract `JsonNode`, which cannot be deserialised. */
export const notificationsClient = new NotificationsClient(undefined, clientFetch)
export const tagsClient = new TagsClient(undefined, clientFetch)
/** Own Hồ sơ (`/api/me/*`). Its DTOs are all-optional with `Date`s: the profile feature maps them in `features/profile/meMappers.ts`. */
export const meClient = new MeClient(undefined, clientFetch)
/** Nhân sự & email (D14c, editor). */
export const manageEmployeesClient = new ManageEmployeesClient(undefined, clientFetch)

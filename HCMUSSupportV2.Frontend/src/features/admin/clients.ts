import {
  AdminEmployeesClient,
  AuditClient,
  DashboardClient,
  GroupsClient,
  RolesClient,
  ViewAsClient,
} from '../../api/generated-client'
import { clientFetch } from '../../api/http'

/** Typed NSwag clients for the admin and groups screens (D14b). Same `clientFetch` as `api/clients.ts`. */
export const rolesClient = new RolesClient(undefined, clientFetch)
export const viewAsClient = new ViewAsClient(undefined, clientFetch)
export const employeesAdminClient = new AdminEmployeesClient(undefined, clientFetch)
export const dashboardClient = new DashboardClient(undefined, clientFetch)
export const auditClient = new AuditClient(undefined, clientFetch)
export const groupsClient = new GroupsClient(undefined, clientFetch)

import {
  AdminEmployeesClient,
  ApiClientsClient,
  AuditClient,
  DashboardClient,
  DatasetsClient,
  GroupsClient,
  RolesClient,
  SyncAdminClient,
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
export const syncAdminClient = new SyncAdminClient(undefined, clientFetch)
export const datasetsClient = new DatasetsClient(undefined, clientFetch)
export const apiClientsClient = new ApiClientsClient(undefined, clientFetch)

export type Role = 'editor' | 'admin'

/** `employee` is implicit: every signed-in person has it. */
export type RoleName = 'employee' | Role

export const ROLE_LABELS: Record<RoleName, string> = {
  employee: 'Nhân viên',
  editor: 'Biên tập viên',
  admin: 'Quản trị viên',
}

export interface ActingAs {
  code: string
  fullName: string
}

/**
 * `GET /api/auth/me`. The top-level fields describe the signed-in person (what the nav and `RequireRole`
 * gate on). While an admin is using view-as, `actingAs` names the employee being viewed.
 */
export interface Me {
  code: string
  fullName: string
  unit: string | null
  photoUrl: string | null
  emails: string[]
  roles: Role[]
  actingAs: ActingAs | null
}

/** Admins have full rights, so `admin` satisfies every role. */
export function hasRole(me: Pick<Me, 'roles'> | null | undefined, role: Role | undefined): boolean {
  if (!role) return true
  if (!me) return false
  return me.roles.includes('admin') || me.roles.includes(role)
}

import type { MeDto } from '../api/generated-client'

export type Role = 'editor' | 'admin'

/** `employee` is held by every signed-in person; the backend always includes it in `roles`. */
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
 * gate on). While an admin is using view-as (D14a), `actingAs` names the employee being viewed.
 */
export interface Me {
  code: string
  fullName: string
  unit: string | null
  photoUrl: string | null
  emails: string[]
  /** Always contains `employee`; plus `editor` and/or `admin` when assigned. */
  roles: RoleName[]
  actingAs: ActingAs | null
}

/** Admins have full rights, so `admin` satisfies every role. */
export function hasRole(me: Pick<Me, 'roles'> | null | undefined, role: Role | undefined): boolean {
  if (!role) return true
  if (!me) return false
  return me.roles.includes('admin') || me.roles.includes(role)
}

/** The generated DTO has every field optional; normalise it to the shape the app relies on. */
export function toMe(dto: MeDto): Me {
  const known = (r: string): r is RoleName => r === 'employee' || r === 'editor' || r === 'admin'
  const roles = (dto.roles ?? []).filter(known)
  if (!roles.includes('employee')) roles.unshift('employee')
  return {
    code: dto.code ?? '',
    fullName: dto.fullName ?? '',
    unit: dto.unit ?? null,
    photoUrl: dto.photoUrl ?? null,
    emails: dto.emails ?? [],
    roles,
    actingAs: dto.actingAs ? { code: dto.actingAs.code ?? '', fullName: dto.actingAs.fullName ?? '' } : null,
  }
}

import { DASH, formatMoney, isBlank, joinParts } from '../../lib/format'
import type { Publication, ResearchProject } from './researchApi'

/** `chu_nhiem` -> "Chủ nhiệm"; anything else (`thanh_vien`, unknown) -> "Thành viên". */
export function roleLabel(role: string | null | undefined): string {
  return isChair(role) ? 'Chủ nhiệm' : 'Thành viên'
}

export function isChair(role: string | null | undefined): boolean {
  return (role ?? '').trim().toLowerCase() === 'chu_nhiem'
}

/** "25.000.000 đ", or `—` for a project with no recorded funding. */
export function fundingLabel(funding: number | null | undefined): string {
  return funding === null || funding === undefined ? DASH : formatMoney(funding)
}

/** Chủ nhiệm first, then the rest by name; the input is not changed. */
export function sortMembers<T extends { role: string; fullName: string | null; employeeCode: string }>(members: readonly T[]): T[] {
  return [...members].sort(
    (a, b) =>
      Number(isChair(b.role)) - Number(isChair(a.role)) ||
      (a.fullName ?? a.employeeCode).localeCompare(b.fullName ?? b.employeeCode, 'vi'),
  )
}

/** "DT-2024-01 · 2024-2026 · 25.000.000 đ" for the list row. */
export function projectMeta(p: Pick<ResearchProject, 'code' | 'periodText' | 'funding'>): string {
  return joinParts([p.code, p.periodText, p.funding === null ? null : fundingLabel(p.funding)])
}

/** "Tạp chí X · 2023", skipping what is missing. */
export function venueLine(p: Pick<Publication, 'venue' | 'year'>): string {
  return joinParts([p.venue, p.year])
}

/** The DOI as a resolvable link; a `https://doi.org/` prefix on the stored value is tolerated. */
export function doiUrl(doi: string | null | undefined): string | null {
  if (isBlank(doi)) return null
  const bare = doi!.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
  return `https://doi.org/${bare}`
}

/** Only `http(s)` links are rendered as anchors. */
export function safeUrl(url: string | null | undefined): string | null {
  if (isBlank(url)) return null
  try {
    const u = new URL(url!.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

/** The link a publication opens: its DOI, else its own URL. */
export function publicationLink(p: Pick<Publication, 'doi' | 'url'>): string | null {
  return doiUrl(p.doi) ?? safeUrl(p.url)
}

/** Authors in order, without the signed-in employee. */
export function coAuthors(p: Pick<Publication, 'authors'>, myCode: string): string[] {
  return [...p.authors]
    .sort((a, b) => a.ordinal - b.ordinal)
    .filter((a) => a.employeeCode !== myCode)
    .map((a) => a.fullName ?? a.employeeCode)
}

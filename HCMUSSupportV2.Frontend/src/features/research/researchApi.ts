import { useInfiniteQuery } from '@tanstack/react-query'
import { http } from '../../api/http'
import { MOCK_AUTH } from '../../auth/useMe'

/*
 * Nghiên cứu khoa học (D13). Hand-written against `HCMUSSupportV2.Backend/Modules/Hrm/Me/MeDtos.cs`
 * (`PageDto<ResearchProjectDto>`, `PageDto<PublicationDto>`; camelCase on the wire, `DateOnly` as `yyyy-MM-dd`, a keyset
 * `nextCursor` that is null on the last page). Under `VITE_MOCK_AUTH` the hooks return `researchMock.ts`, no network call.
 */

export interface ResearchMember {
  employeeCode: string
  fullName: string | null
  /** Raw role: `chu_nhiem` or `thanh_vien`. */
  role: string
}

export interface ResearchProject {
  id: number
  code: string
  title: string
  level: string | null
  researchType: string | null
  funding: number | null
  periodText: string | null
  acceptedOn: string | null
  result: string | null
  /** Raw role of the signed-in employee: `chu_nhiem` or `thanh_vien`. */
  myRole: string
  members: ResearchMember[]
}

export interface PublicationAuthor {
  employeeCode: string
  fullName: string | null
  ordinal: number
}

export interface Publication {
  id: number
  doi: string | null
  eid: string | null
  title: string
  venue: string | null
  year: number | null
  details: string | null
  url: string | null
  myOrdinal: number
  authors: PublicationAuthor[]
}

export interface Page<T> {
  items: T[]
  nextCursor: number | null
}

export const RESEARCH_PAGE_SIZE = 20

const mock = () => import('./researchMock')

function pageUrl(path: string, cursor: number | null): string {
  const params = new URLSearchParams()
  if (cursor !== null) params.set('cursor', String(cursor))
  params.set('limit', String(RESEARCH_PAGE_SIZE))
  return `${path}?${params}`
}

export function useResearchProjects() {
  return useInfiniteQuery({
    queryKey: ['me', 'research', 'projects'],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) =>
      MOCK_AUTH
        ? (await mock()).loadMockProjects(pageParam)
        : http.get<Page<ResearchProject>>(pageUrl('/api/me/research/projects', pageParam)),
    getNextPageParam: (last) => last.nextCursor,
  })
}

export function usePublications() {
  return useInfiniteQuery({
    queryKey: ['me', 'research', 'publications'],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) =>
      MOCK_AUTH
        ? (await mock()).loadMockPublications(pageParam)
        : http.get<Page<Publication>>(pageUrl('/api/me/research/publications', pageParam)),
    getNextPageParam: (last) => last.nextCursor,
  })
}

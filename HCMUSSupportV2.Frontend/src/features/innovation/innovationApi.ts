import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { http } from '../../api/http'
import { MOCK_AUTH } from '../../auth/useMe'

/*
 * Sáng kiến (D13). Hand-written against `HCMUSSupportV2.Backend/Modules/Hrm/Me/MeDtos.cs` (`InnovationsDto`; camelCase on
 * the wire, `DateOnly` as `yyyy-MM-dd`) because the NSwag client has no Hrm endpoints yet. Under `VITE_MOCK_AUTH` the hook
 * returns synthetic data from `innovationMock.ts`, no network call.
 */

export interface InnovationEntry {
  id: number
  code: string | null
  title: string
  type: string | null
  decisionNo: string | null
  recognizedOn: string | null
  academicYear: string | null
}

export interface InnovationTypeCount {
  type: string | null
  count: number
}

/** Always the employee's totals, whatever `q` is. */
export interface InnovationStats {
  count: number
  byType: InnovationTypeCount[]
}

export interface InnovationsPage {
  stats: InnovationStats
  items: InnovationEntry[]
  nextCursor: number | null
}

export const INNOVATION_PAGE_SIZE = 20

const mock = () => import('./innovationMock')

export function fetchInnovations(q: string, cursor: number | null): Promise<InnovationsPage> {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (cursor !== null) params.set('cursor', String(cursor))
  params.set('limit', String(INNOVATION_PAGE_SIZE))
  return http.get<InnovationsPage>(`/api/me/innovations?${params}`)
}

/** Keyset-paged list; `q` is the server-side search (title, code, type). */
export function useInnovations(q: string) {
  return useInfiniteQuery({
    queryKey: ['me', 'innovations', q],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) =>
      MOCK_AUTH ? (await mock()).loadMockInnovations(q, pageParam) : fetchInnovations(q, pageParam),
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  })
}

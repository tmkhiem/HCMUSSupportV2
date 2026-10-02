import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteNotification,
  deleteSeries,
  deleteTag,
  estimateAudience,
  fetchManageDetail,
  fetchManagePage,
  fetchManageSeries,
  fetchManageTags,
  fetchPreviewVars,
  fetchRevisions,
  fetchStats,
  saveSeries,
  saveTag,
  searchEmployees,
  searchGroups,
} from './manageApi'
import type { ManageListQuery } from './manageApi'
import type { ManageDetail } from './manageTypes'

/** Everything starts with `manage`, so a user switch (`clearUserData`) drops it all and one `invalidate` refreshes the editor side. */
export const manageKeys = {
  all: ['manage'] as const,
  list: (q: ManageListQuery) => ['manage', 'list', q] as const,
  lists: ['manage', 'list'] as const,
  detail: (id: string) => ['manage', 'detail', id] as const,
  revisions: (id: string) => ['manage', 'revisions', id] as const,
  stats: (id: string) => ['manage', 'stats', id] as const,
  tags: ['manage', 'tags'] as const,
  series: ['manage', 'series'] as const,
}

/** No live push: the list always refetches when it is opened or the window regains focus. */
export function useManageList(query: ManageListQuery) {
  return useInfiniteQuery({
    queryKey: manageKeys.list(query),
    queryFn: ({ pageParam }) => fetchManagePage(query, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
}

export function useManageDetail(id: string | undefined) {
  return useQuery({
    queryKey: manageKeys.detail(id ?? ''),
    queryFn: () => fetchManageDetail(id!),
    enabled: Boolean(id),
    retry: false,
    staleTime: 0,
    // The editor owns the loaded copy (the form); a background refetch must not replace it while someone types.
    refetchOnWindowFocus: false,
  })
}

export const useRevisions = (id: string | undefined, enabled: boolean) =>
  useQuery({ queryKey: manageKeys.revisions(id ?? ''), queryFn: () => fetchRevisions(id!), enabled: Boolean(id) && enabled, retry: false })

export const useStats = (id: string | undefined, enabled: boolean) =>
  useQuery({ queryKey: manageKeys.stats(id ?? ''), queryFn: () => fetchStats(id!), enabled: Boolean(id) && enabled, retry: false })

export const useManageTags = () => useQuery({ queryKey: manageKeys.tags, queryFn: fetchManageTags, staleTime: 60_000 })
export const useManageSeries = () => useQuery({ queryKey: manageKeys.series, queryFn: fetchManageSeries, staleTime: 60_000 })

/** The variable rows of one MSCB and whether that person is in the audience. Needs a saved notification. */
export function usePreviewVars(id: string | undefined, employee: string | null, version: number | undefined, importId: string | null) {
  return useQuery({
    // `version` and the import make the answer change after a save or an applied sheet.
    queryKey: ['manage', 'preview', id, employee, version, importId] as const,
    queryFn: () => fetchPreviewVars(id!, employee!, importId),
    enabled: Boolean(id && employee),
    retry: false,
    staleTime: 0,
  })
}

export interface AudienceInput {
  audienceAll: boolean
  groupIds: number[]
  employeeCodes: string[]
  importId: string | null
}

/** "Dự kiến N người nhận" for the unsaved targeting choices. The key sorts ids so reordering does not refetch. */
export function useAudienceEstimate(input: AudienceInput, enabled = true) {
  const groupIds = [...input.groupIds].sort((a, b) => a - b)
  const employeeCodes = [...input.employeeCodes].sort()
  const nothing = !input.audienceAll && groupIds.length === 0 && employeeCodes.length === 0 && !input.importId
  return useQuery({
    queryKey: ['manage', 'estimate', input.audienceAll, groupIds, employeeCodes, input.importId] as const,
    queryFn: () => estimateAudience({ audienceAll: input.audienceAll, groupIds, employeeCodes, importId: input.importId }),
    enabled: enabled && !nothing,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  })
}

export const useGroupSearch = (q: string) =>
  useQuery({ queryKey: ['manage', 'groups', q] as const, queryFn: () => searchGroups(q), staleTime: 30_000, placeholderData: keepPreviousData })

export const useEmployeeSearch = (q: string, enabled = true) =>
  useQuery({ queryKey: ['manage', 'employees', q] as const, queryFn: () => searchEmployees(q), enabled, staleTime: 30_000, placeholderData: keepPreviousData })

/** Writes the answer of a save / lifecycle call into the cache and refreshes the lists. */
export function useStoreDetail() {
  const qc = useQueryClient()
  return (detail: ManageDetail) => {
    qc.setQueryData(manageKeys.detail(detail.id), detail)
    void qc.invalidateQueries({ queryKey: manageKeys.lists })
    void qc.invalidateQueries({ queryKey: manageKeys.revisions(detail.id) })
    void qc.invalidateQueries({ queryKey: manageKeys.stats(detail.id) })
  }
}

export function useDeleteNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: manageKeys.lists }),
  })
}

export function useSaveTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: number | null; name: string; color: string | null }) => saveTag(v.id, v),
    onSuccess: () => void qc.invalidateQueries({ queryKey: manageKeys.tags }).then(() => qc.invalidateQueries({ queryKey: manageKeys.lists })),
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteTag(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: manageKeys.tags }).then(() => qc.invalidateQueries({ queryKey: manageKeys.lists })),
  })
}

export function useSaveSeries() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: number | null; name: string; description: string }) => saveSeries(v.id, v),
    onSuccess: () => void qc.invalidateQueries({ queryKey: manageKeys.series }).then(() => qc.invalidateQueries({ queryKey: manageKeys.lists })),
  })
}

export function useDeleteSeries() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteSeries(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: manageKeys.series }).then(() => qc.invalidateQueries({ queryKey: manageKeys.lists })),
  })
}

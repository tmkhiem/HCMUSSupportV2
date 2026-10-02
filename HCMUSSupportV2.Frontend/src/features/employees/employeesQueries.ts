import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { addEmail, fetchEmployee, fetchEmployees, importEmails, removeEmail, setPrimaryEmail } from './employeesApi'
import type { AddEmailInput, EmployeeFilters, ManagedEmployee } from './employeesTypes'

export const employeeKeys = {
  all: ['manage', 'employees'] as const,
  lists: ['manage', 'employees', 'list'] as const,
  list: (filters: EmployeeFilters) => ['manage', 'employees', 'list', filters] as const,
  detail: (code: string) => ['manage', 'employees', 'detail', code] as const,
}

/** Keyset pages (`nextCursor`); the previous result stays on screen while a new filter loads. */
export function useEmployeeList(filters: EmployeeFilters) {
  return useInfiniteQuery({
    queryKey: employeeKeys.list(filters),
    queryFn: ({ pageParam }) => fetchEmployees(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
}

export function useEmployee(code: string | null) {
  return useQuery({
    queryKey: employeeKeys.detail(code ?? ''),
    queryFn: () => fetchEmployee(code!),
    enabled: Boolean(code),
    retry: false,
    staleTime: 0,
  })
}

/** A write answers with the employee as it is now: put it in the detail cache and refresh the lists. */
function useEmailMutation<TInput>(run: (input: TInput) => Promise<ManagedEmployee>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: (employee) => {
      qc.setQueryData(employeeKeys.detail(employee.code), employee)
      void qc.invalidateQueries({ queryKey: employeeKeys.lists })
    },
  })
}

export const useAddEmail = (code: string) => useEmailMutation((input: AddEmailInput) => addEmail(code, input))
export const useRemoveEmail = (code: string) => useEmailMutation((email: string) => removeEmail(code, email))
export const useSetPrimaryEmail = (code: string) => useEmailMutation((email: string) => setPrimaryEmail(code, email))

export interface ImportInput {
  file: File
  dryRun: boolean
  removeMissing: boolean
}

export const invalidateEmployees = (qc: QueryClient) => qc.invalidateQueries({ queryKey: employeeKeys.all })

/** Dry run or apply. Applying invalidates every directory query. */
export function useImportEmails() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, dryRun, removeMissing }: ImportInput) => importEmails(file, dryRun, removeMissing),
    onSuccess: (report) => {
      if (!report.dryRun) void invalidateEmployees(qc)
    },
  })
}

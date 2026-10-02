import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useDebounced } from '../../../lib/useDebounced'
import { groupsClient } from '../../admin/clients'

export interface OrgUnitOption {
  id: number
  name: string
}

interface Props {
  id: number | null | undefined
  /** Name remembered from the last pick; a stored rule only has the id. */
  name?: string
  onChange: (unit: OrgUnitOption | null) => void
  disabled?: boolean
}

/**
 * Typeahead over org units. There is no org-unit endpoint, but every active unit has an `org_unit` group
 * (`GET manage/groups?kind=org_unit`) that carries `orgUnitId` and `orgUnitName`, so the picker searches those.
 */
export default function OrgUnitField({ id, name, onChange, disabled }: Props) {
  const [input, setInput] = useState('')
  const dq = useDebounced(input.trim())

  const toOptions = (items: readonly { orgUnitId?: number; orgUnitName?: string; name?: string }[] | undefined): OrgUnitOption[] =>
    (items ?? []).flatMap((g) => (g.orgUnitId ? [{ id: g.orgUnitId, name: g.orgUnitName ?? g.name ?? `#${g.orgUnitId}` }] : []))

  // Up to 200 units once, to turn the ids of a stored rule back into names.
  const all = useQuery({
    queryKey: ['groups', 'org-units', 'all'],
    queryFn: async () => toOptions((await groupsClient.list(undefined, 'org_unit', false, undefined, 200)).items),
    staleTime: 5 * 60_000,
  })
  const search = useQuery({
    queryKey: ['groups', 'org-units', 'search', dq],
    queryFn: async () => toOptions((await groupsClient.list(dq, 'org_unit', false, undefined, 20)).items),
    enabled: dq.length > 0,
  })

  const options = dq.length > 0 ? (search.data ?? []) : (all.data ?? []).slice(0, 20)
  const known = (all.data ?? []).find((o) => o.id === id)
  const value: OrgUnitOption | null = id ? { id, name: name ?? known?.name ?? `Đơn vị #${id}` } : null

  return (
    <Autocomplete
      size="small"
      disabled={disabled}
      options={options}
      value={value}
      onChange={(_, v) => onChange(v)}
      inputValue={input}
      onInputChange={(_, v) => setInput(v)}
      filterOptions={(o) => o}
      getOptionLabel={(o) => o.name}
      getOptionKey={(o) => o.id}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      loading={search.isFetching || all.isPending}
      loadingText="Đang tìm…"
      noOptionsText="Không tìm thấy đơn vị"
      renderInput={(params) => <TextField {...params} label="Đơn vị" placeholder="Gõ tên đơn vị" />}
      sx={{ flex: 1, minWidth: 240 }}
    />
  )
}

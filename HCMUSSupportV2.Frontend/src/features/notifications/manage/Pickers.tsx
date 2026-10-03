import Autocomplete from '@mui/material/Autocomplete'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { joinParts } from '../../../lib/format'
import { employeeLabel } from './labels'
import { useAudienceMembers, useEmployeeSearch, useGroupSearch } from './manageQueries'
import type { AudienceInput } from './manageQueries'
import type { EmployeeRef, GroupRef } from './manageTypes'
import { useDebounced } from './useDebounced'


function NO_FILTER<T>(options: T[]): T[] {
  return options
}

/** Several employees, found by MSCB or name on the server (`GET manage/notifications/employees`). */
export function EmployeeMultiPicker({
  value,
  onChange,
  disabled,
  label = 'Nhân sự cụ thể',
}: {
  value: EmployeeRef[]
  onChange: (next: EmployeeRef[]) => void
  disabled?: boolean
  label?: string
}) {
  const [input, setInput] = useState('')
  const q = useDebounced(input.trim(), 300)
  const found = useEmployeeSearch(q)
  return (
    <Autocomplete
      multiple
      size="small"
      disabled={disabled}
      options={found.data ?? []}
      value={value}
      loading={found.isFetching}
      filterOptions={NO_FILTER}
      getOptionLabel={employeeLabel}
      isOptionEqualToValue={(a, b) => a.code === b.code}
      inputValue={input}
      onInputChange={(_, v, reason) => reason !== 'reset' && setInput(v)}
      onChange={(_, next) => onChange(next)}
      noOptionsText={q ? 'Không tìm thấy nhân sự.' : 'Nhập mã số hoặc tên.'}
      loadingText="Đang tìm…"
      renderValue={(items, getItemProps) =>
        items.map((e, index) => {
          const { key, ...props } = getItemProps({ index })
          return <Chip key={key} size="small" label={employeeLabel(e)} {...props} sx={{ bgcolor: e.status && e.status !== 'active' ? 'warning.light' : undefined }} />
        })
      }
      renderOption={(props, e) => {
        const { key, ...rest } = props
        return (
          <li key={key} {...rest}>
            <span>
              <Typography component="span" sx={{ fontWeight: 600 }}>
                {employeeLabel(e)}
              </Typography>
              <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                {joinParts([e.unit, e.status && e.status !== 'active' ? 'Không còn hoạt động' : null])}
              </Typography>
            </span>
          </li>
        )
      }}
      renderInput={(params) => <TextField {...params} label={label} placeholder="Nhập mã số hoặc tên" />}
    />
  )
}

/** One recipient of this notification (the "preview as a recipient" picker): it offers the audience only, nobody else. */
export function EmployeeSinglePicker({
  value,
  onChange,
  audience,
  label = 'Xem trước với tư cách…',
}: {
  value: EmployeeRef | null
  onChange: (next: EmployeeRef | null) => void
  /** The current (unsaved) targeting choices. */
  audience: AudienceInput
  label?: string
}) {
  const [input, setInput] = useState('')
  const q = useDebounced(input.trim(), 300)
  const found = useAudienceMembers(audience, q)
  return (
    <Autocomplete
      size="small"
      options={found.data ?? []}
      value={value}
      loading={found.isFetching}
      filterOptions={NO_FILTER}
      getOptionLabel={employeeLabel}
      isOptionEqualToValue={(a, b) => a.code === b.code}
      inputValue={input}
      onInputChange={(_, v, reason) => (reason === 'reset' ? setInput(value ? employeeLabel(value) : '') : setInput(v))}
      onChange={(_, next) => onChange(next)}
      noOptionsText={q ? 'Không có người nhận nào khớp.' : 'Chưa chọn người nhận nào.'}
      loadingText="Đang tìm…"
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="Chọn người nhận để xem nội dung của họ"
          slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, 'aria-label': label } }}
        />
      )}
    />
  )
}

/** Several groups (`GET manage/groups`). */
export function GroupMultiPicker({ value, onChange, disabled }: { value: GroupRef[]; onChange: (next: GroupRef[]) => void; disabled?: boolean }) {
  const [input, setInput] = useState('')
  const q = useDebounced(input.trim(), 300)
  const found = useGroupSearch(q)
  return (
    <Autocomplete
      multiple
      size="small"
      disabled={disabled}
      options={found.data ?? []}
      value={value}
      loading={found.isFetching}
      filterOptions={NO_FILTER}
      getOptionLabel={(g) => g.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      inputValue={input}
      onInputChange={(_, v, reason) => reason !== 'reset' && setInput(v)}
      onChange={(_, next) => onChange(next)}
      noOptionsText="Không tìm thấy nhóm."
      loadingText="Đang tìm…"
      renderValue={(items, getItemProps) =>
        items.map((g, index) => {
          const { key, ...props } = getItemProps({ index })
          return <Chip key={key} size="small" label={`${g.name} (${g.memberCount})`} {...props} />
        })
      }
      renderOption={(props, g) => {
        const { key, ...rest } = props
        return (
          <li key={key} {...rest}>
            {g.name}
            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              {g.memberCount} người
            </Typography>
          </li>
        )
      }}
      renderInput={(params) => <TextField {...params} label="Nhóm" placeholder="Tìm nhóm" />}
    />
  )
}

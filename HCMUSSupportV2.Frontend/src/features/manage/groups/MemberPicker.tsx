import PersonAddOutlined from '@mui/icons-material/PersonAddOutlined'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useCurrentUser } from '../../../auth/authContext'
import { useDebounced } from '../../../lib/useDebounced'
import { rolesClient } from '../../admin/clients'
import { parseCodes } from './memberCodes'

interface Picked {
  code: string
  label: string
}

/**
 * Typeahead that collects MSCBs to add to a static group. Admins get employee suggestions (`admin/roles?q=`, the
 * only employee search the API has; it is admin-only). Editors have no search endpoint, so for them it is a chip
 * input: type or paste MSCBs (comma, space or new line separated) and press Enter. The server reports unknown codes.
 */
export default function MemberPicker({ onAdd, pending }: { onAdd: (codes: string[]) => void; pending: boolean }) {
  const isAdmin = useCurrentUser().roles.includes('admin')
  const [picked, setPicked] = useState<Picked[]>([])
  const [input, setInput] = useState('')
  const dq = useDebounced(input.trim())

  const search = useQuery({
    queryKey: ['groups', 'member-search', dq],
    queryFn: async () => (await rolesClient.list(dq, undefined, undefined, 15)).items ?? [],
    enabled: isAdmin && dq.length >= 2,
  })
  const options: Picked[] = (search.data ?? []).map((e) => ({ code: e.code ?? '', label: `${e.fullName ?? ''} · ${e.code ?? ''}` }))

  const commit = (values: (string | Picked)[]) => {
    const next: Picked[] = []
    for (const v of values) {
      if (typeof v === 'string') parseCodes(v).forEach((code) => next.push({ code, label: code }))
      else next.push(v)
    }
    // Keep the first of each code (a code typed first keeps its bare label).
    setPicked([...new Map(next.map((p) => [p.code, p])).values()])
  }

  const submit = () => {
    const codes = [...new Set([...picked.map((p) => p.code), ...parseCodes(input)])]
    if (codes.length === 0) return
    onAdd(codes)
    setPicked([])
    setInput('')
  }
  const count = new Set([...picked.map((p) => p.code), ...parseCodes(input)]).size

  return (
    <Stack spacing={1.5}>
      <Autocomplete
        multiple
        freeSolo
        autoSelect
        size="small"
        options={options}
        value={picked}
        onChange={(_, v) => commit(v)}
        inputValue={input}
        onInputChange={(_, v) => setInput(v)}
        filterOptions={(o) => o}
        getOptionLabel={(o) => (typeof o === 'string' ? o : o.label)}
        getOptionKey={(o) => (typeof o === 'string' ? o : o.code)}
        isOptionEqualToValue={(a, b) => (typeof a === 'string' ? a : a.code) === (typeof b === 'string' ? b : b.code)}
        loading={search.isFetching}
        loadingText="Đang tìm…"
        noOptionsText="Không tìm thấy cán bộ"
        renderValue={(value, getItemProps) =>
          value.map((v, i) => {
            const { key, ...rest } = getItemProps({ index: i })
            return <Chip key={key} size="small" label={typeof v === 'string' ? v : v.label} {...rest} />
          })
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label="Thêm thành viên"
            placeholder={isAdmin ? 'Gõ MSCB hoặc họ tên' : 'Nhập MSCB rồi nhấn Enter'}
          />
        )}
      />
      {!isAdmin && (
        <Typography variant="caption" color="text.secondary">
          Có thể dán nhiều MSCB cùng lúc, cách nhau bằng dấu phẩy, dấu cách hoặc xuống dòng.
        </Typography>
      )}
      <Stack direction="row">
        <Button variant="contained" startIcon={<PersonAddOutlined />} disabled={count === 0 || pending} onClick={submit}>
          {pending ? 'Đang thêm…' : count > 0 ? `Thêm ${count} người` : 'Thêm'}
        </Button>
      </Stack>
    </Stack>
  )
}

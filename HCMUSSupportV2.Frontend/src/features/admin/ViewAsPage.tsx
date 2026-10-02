import SearchOutlined from '@mui/icons-material/SearchOutlined'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StartViewAsRequest } from '../../api/generated-client'
import type { RoleRowDto } from '../../api/generated-client'
import { refreshSession } from '../../auth/session'
import AcrylicCard from '../../ui/AcrylicCard'
import { errorMessage } from '../../ui/errorMessage'
import PageHeader from '../../ui/PageHeader'
import { rolesClient, viewAsClient } from './clients'
import { useDebounced } from './common'

export function Component() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [picked, setPicked] = useState<RoleRowDto | null>(null)
  const dq = useDebounced(input.trim())

  const search = useQuery({
    queryKey: ['admin', 'view-as-search', dq],
    queryFn: () => rolesClient.list(dq, undefined, undefined, 20),
    enabled: dq.length >= 2,
  })

  const start = useMutation({
    mutationFn: (code: string) => viewAsClient.start(new StartViewAsRequest({ employeeCode: code })),
    onSuccess: async () => {
      await refreshSession(qc)
      navigate('/tin-tuc')
    },
  })

  return (
    <>
      <PageHeader title="Xem thử" eyebrow="Quản trị" subtitle="Xem hệ thống đúng như một cán bộ nhìn thấy. Chỉ đọc, mọi lần xem đều được ghi nhật ký." />
      <AcrylicCard index={1} sx={{ mt: 3, p: 3, maxWidth: 640 }}>
        <Stack spacing={2}>
          <Autocomplete
            options={search.data?.items ?? []}
            value={picked}
            onChange={(_, v) => setPicked(v)}
            inputValue={input}
            onInputChange={(_, v) => setInput(v)}
            filterOptions={(o) => o}
            getOptionLabel={(o) => `${o.fullName} · ${o.code}`}
            isOptionEqualToValue={(a, b) => a.code === b.code}
            loading={search.isFetching}
            noOptionsText={dq.length < 2 ? 'Nhập ít nhất 2 ký tự' : 'Không tìm thấy cán bộ'}
            loadingText="Đang tìm…"
            renderOption={(props, o) => (
              <li {...props} key={o.code}>
                <Stack>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{o.fullName} · {o.code}</Typography>
                  <Typography variant="caption" color="text.secondary">{o.unit ?? '—'}</Typography>
                </Stack>
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Cán bộ cần xem"
                placeholder="MSCB hoặc họ tên"
                slotProps={{
                  input: { ...params.InputProps, startAdornment: <><SearchOutlined fontSize="small" sx={{ mr: 1 }} />{params.InputProps.startAdornment}</> },
                }}
              />
            )}
          />
          {start.error && <Alert severity="error">{errorMessage(start.error, 'Không bắt đầu được chế độ xem thử.')}</Alert>}
          <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
            <Button variant="contained" startIcon={<VisibilityOutlined />} disabled={!picked?.code || start.isPending} onClick={() => picked?.code && start.mutate(picked.code)}>
              {start.isPending ? 'Đang chuyển…' : 'Bắt đầu xem thử'}
            </Button>
          </Stack>
        </Stack>
      </AcrylicCard>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        Phiên xem thử tự hết hạn sau 60 phút. Bấm &quot;Thoát&quot; trên thanh vàng ở đầu trang để quay lại tài khoản của bạn.
      </Typography>
    </>
  )
}

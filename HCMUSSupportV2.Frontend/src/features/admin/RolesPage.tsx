import CloseOutlined from '@mui/icons-material/CloseOutlined'
import SearchOutlined from '@mui/icons-material/SearchOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { RoleRowDto } from '../../api/generated-client'
import { SetRolesRequest } from '../../api/generated-client'
import { ROLE_LABELS } from '../../auth/types'
import type { RoleName } from '../../auth/types'
import AcrylicCard from '../../ui/AcrylicCard'
import { errorMessage } from '../../ui/errorMessage'
import PageHeader from '../../ui/PageHeader'
import PageState from '../../ui/PageState'
import { rolesClient } from './clients'
import { LoadMore, formatDateTime, useDebounced } from './common'

const STATUS_LABELS: Record<string, string> = { active: 'Đang làm việc', inactive: 'Ngưng hoạt động', retired: 'Đã nghỉ hưu' }

function RoleChips({ roles }: { roles: readonly string[] | undefined }) {
  const assigned = (roles ?? []).filter((r) => r === 'editor' || r === 'admin')
  if (assigned.length === 0) return <Typography variant="body2" color="text.secondary">Nhân viên</Typography>
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {assigned.map((r) => (
        <Chip key={r} size="small" color={r === 'admin' ? 'primary' : 'default'} label={ROLE_LABELS[r as RoleName]} />
      ))}
    </Stack>
  )
}

function RoleDrawerBody({ code, onClose }: { code: string; onClose: () => void }) {
  const qc = useQueryClient()
  const detail = useQuery({ queryKey: ['admin', 'roles', code], queryFn: () => rolesClient.get(code) })
  const [draft, setDraft] = useState<{ editor: boolean; admin: boolean } | null>(null)

  const d = detail.data
  const saved = { editor: (d?.roles ?? []).includes('editor'), admin: (d?.roles ?? []).includes('admin') }
  const current = draft ?? saved
  const dirty = Boolean(d) && (current.editor !== saved.editor || current.admin !== saved.admin)

  const save = useMutation({
    mutationFn: () => {
      const roles: string[] = []
      if (current.editor) roles.push('editor')
      if (current.admin) roles.push('admin')
      return rolesClient.put(code, new SetRolesRequest({ roles }))
    },
    onSuccess: (res) => {
      qc.setQueryData(['admin', 'roles', code], res)
      setDraft(null)
      void qc.invalidateQueries({ queryKey: ['admin', 'roles-list'] })
    },
  })

  return (
    <Box sx={{ width: { xs: '100vw', sm: 440 }, maxWidth: '100vw', p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" component="h2">Chi tiết phân quyền</Typography>
        <IconButton aria-label="Đóng" onClick={onClose}><CloseOutlined /></IconButton>
      </Stack>
      <PageState error={detail.error} loading={detail.isPending} errorFallback="Không tải được thông tin cán bộ." onRetry={() => detail.refetch()}>
        {d && (
          <>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{d.fullName}</Typography>
              <Typography variant="body2" color="text.secondary">
                {[d.code, d.unit, STATUS_LABELS[d.status ?? ''] ?? d.status].filter(Boolean).join(' · ')}
              </Typography>
              {(d.emails ?? []).length > 0 && (
                <Typography variant="body2" color="text.secondary">{(d.emails ?? []).join(', ')}</Typography>
              )}
            </Box>
            <Divider />
            <Box>
              <FormControlLabel control={<Switch checked disabled />} label="Nhân viên (mặc định)" />
              <FormControlLabel
                control={<Switch checked={current.editor} onChange={(_, v) => setDraft({ ...current, editor: v })} />}
                label="Biên tập viên: soạn thông báo, quản lý nhóm"
              />
              <FormControlLabel
                control={<Switch checked={current.admin} onChange={(_, v) => setDraft({ ...current, admin: v })} />}
                label="Quản trị viên: toàn quyền"
              />
            </Box>
            {save.error && <Alert severity="error">{errorMessage(save.error, 'Không lưu được phân quyền.')}</Alert>}
            {save.isSuccess && !dirty && <Alert severity="success">Đã lưu phân quyền. Có hiệu lực ngay.</Alert>}
            <Stack direction="row" spacing={1}>
              <Button variant="contained" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? 'Đang lưu…' : 'Lưu'}
              </Button>
              <Button disabled={!dirty || save.isPending} onClick={() => { setDraft(null); save.reset() }}>Hoàn tác</Button>
            </Stack>
            <Divider />
            <Typography variant="sectionLabel">Lịch sử cấp quyền</Typography>
            {(d.grants ?? []).length === 0 ? (
              <Typography variant="body2" color="text.secondary">Chưa được cấp quyền nào.</Typography>
            ) : (
              <Stack spacing={1}>
                {(d.grants ?? []).map((g) => (
                  <Typography key={`${g.role}-${g.grantedAt?.toString()}`} variant="body2">
                    <b>{ROLE_LABELS[g.role as RoleName] ?? g.role}</b> · cấp bởi {g.grantedByName ?? g.grantedBy ?? '—'} · {formatDateTime(g.grantedAt)}
                  </Typography>
                ))}
              </Stack>
            )}
          </>
        )}
      </PageState>
    </Box>
  )
}

export function Component() {
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const dq = useDebounced(q)

  const list = useInfiniteQuery({
    queryKey: ['admin', 'roles-list', dq, role],
    queryFn: ({ pageParam }) => rolesClient.list(dq || undefined, role || undefined, pageParam, 50),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const rows: RoleRowDto[] = list.data?.pages.flatMap((p) => p.items ?? []) ?? []

  return (
    <>
      <PageHeader title="Phân quyền" eyebrow="Quản trị" subtitle="Gán quyền biên tập viên và quản trị viên cho cán bộ." />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 3, mb: 2 }}>
        <TextField
          size="small"
          label="Tìm cán bộ"
          placeholder="MSCB, họ tên hoặc email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ flex: 1 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchOutlined fontSize="small" /></InputAdornment> } }}
        />
        <TextField select size="small" label="Quyền" value={role} onChange={(e) => setRole(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">Tất cả</MenuItem>
          <MenuItem value="admin">Quản trị viên</MenuItem>
          <MenuItem value="editor">Biên tập viên</MenuItem>
          <MenuItem value="employee">Chỉ là nhân viên</MenuItem>
        </TextField>
      </Stack>

      <PageState error={list.error} loading={list.isPending} empty={rows.length === 0} emptyMessage="Không có cán bộ phù hợp." errorFallback="Không tải được danh sách cán bộ." onRetry={() => list.refetch()}>
        <AcrylicCard sx={{ overflow: 'hidden' }}>
          <TableContainer>
            <Table size="small" aria-label="Danh sách phân quyền">
              <TableHead>
                <TableRow>
                  <TableCell>MSCB</TableCell>
                  <TableCell>Họ tên</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Đơn vị</TableCell>
                  <TableCell>Quyền</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.code} hover selected={r.code === selected} onClick={() => setSelected(r.code ?? null)} sx={{ cursor: 'pointer' }}>
                    <TableCell>
                      <Button size="small" onClick={() => setSelected(r.code ?? null)} aria-label={`Mở ${r.fullName}`}>{r.code}</Button>
                    </TableCell>
                    <TableCell>
                      {r.fullName}
                      {r.status && r.status !== 'active' && <Chip size="small" sx={{ ml: 1 }} label={STATUS_LABELS[r.status] ?? r.status} />}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{r.unit ?? '—'}</TableCell>
                    <TableCell><RoleChips roles={r.roles} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </AcrylicCard>
        <Stack sx={{ mt: 2 }}>
          <LoadMore visible={Boolean(list.hasNextPage)} loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()} />
        </Stack>
      </PageState>

      <Drawer anchor="right" open={selected !== null} onClose={() => setSelected(null)}>
        {selected && <RoleDrawerBody key={selected} code={selected} onClose={() => setSelected(null)} />}
      </Drawer>
    </>
  )
}

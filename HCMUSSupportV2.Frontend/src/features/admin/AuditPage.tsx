import Box from '@mui/material/Box'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import AcrylicCard from '../../ui/AcrylicCard'
import PageHeader from '../../ui/PageHeader'
import PageState from '../../ui/PageState'
import { auditClient } from './clients'
import { LoadMore, formatDateTime, useDebounced } from './common'
import { actionLabel } from './auditLabels'

/** `yyyy-MM-dd` from a date input -> local midnight (Asia/Ho_Chi_Minh is UTC+7, but the browser's zone is what the admin sees). */
function dayStart(value: string, addDays = 0): Date | undefined {
  if (!value) return undefined
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d + addDays)
}

function details(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

export function Component() {
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const dActor = useDebounced(actor.trim())

  const actions = useQuery({ queryKey: ['admin', 'audit-actions'], queryFn: () => auditClient.actions(), staleTime: 5 * 60_000 })
  const list = useInfiniteQuery({
    queryKey: ['admin', 'audit', dActor, action, from, to],
    queryFn: ({ pageParam }) =>
      auditClient.query(dActor || undefined, action || undefined, undefined, undefined, dayStart(from), dayStart(to, 1), pageParam, 50),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.items ?? []) ?? []

  return (
    <>
      <PageHeader title="Nhật ký" eyebrow="Quản trị" subtitle="Mọi thao tác quan trọng của quản trị viên, biên tập viên và hệ thống." />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 3, mb: 2 }}>
        <TextField size="small" label="Người thực hiện (MSCB)" value={actor} onChange={(e) => setActor(e.target.value)} sx={{ flex: 1 }} />
        <TextField select size="small" label="Hành động" value={action} onChange={(e) => setAction(e.target.value)} sx={{ minWidth: 240 }}>
          <MenuItem value="">Tất cả</MenuItem>
          {(actions.data ?? []).map((a) => (
            <MenuItem key={a} value={a}>{actionLabel(a)}{actionLabel(a) !== a ? ` (${a})` : ''}</MenuItem>
          ))}
        </TextField>
        <TextField size="small" type="date" label="Từ ngày" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="Đến ngày" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      </Stack>

      <PageState error={list.error} loading={list.isPending} empty={rows.length === 0} emptyMessage="Không có bản ghi nào khớp bộ lọc." errorFallback="Không tải được nhật ký." onRetry={() => list.refetch()}>
        <AcrylicCard sx={{ overflow: 'hidden' }}>
          <TableContainer>
            <Table size="small" aria-label="Nhật ký thao tác">
              <TableHead>
                <TableRow>
                  <TableCell>Thời gian</TableCell>
                  <TableCell>Người thực hiện</TableCell>
                  <TableCell>Hành động</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Đối tượng</TableCell>
                  <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Chi tiết</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.at)}</TableCell>
                    <TableCell>
                      {r.actorName ?? r.actorCode ?? 'Hệ thống'}
                      {r.actingAsCode && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          đang xem thử: {r.actingAsName ?? r.actingAsCode}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {actionLabel(r.action)}
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{r.action}</Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {[r.targetType, r.targetId].filter(Boolean).join(' ') || '—'}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, maxWidth: 360 }}>
                      <Box component="code" sx={{ fontSize: 12, overflowWrap: 'anywhere' }}>{details(r.details) || '—'}</Box>
                    </TableCell>
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
    </>
  )
}

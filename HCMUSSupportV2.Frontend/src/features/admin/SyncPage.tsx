import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AcrylicCard from '../../ui/AcrylicCard'
import { errorMessage } from '../../ui/errorMessage'
import PageHeader from '../../ui/PageHeader'
import PageState from '../../ui/PageState'
import SectionLabel from '../../ui/SectionLabel'
import { LoadMore, formatDateTime } from './common'
import { hrmAdmin } from './hrmApi'
import type { SyncIssue } from './hrmApi'

const RUN_STATUS: Record<string, { label: string; color: 'success' | 'error' | 'warning' | 'default' }> = {
  ok: { label: 'Thành công', color: 'success' },
  success: { label: 'Thành công', color: 'success' },
  completed: { label: 'Thành công', color: 'success' },
  failed: { label: 'Thất bại', color: 'error' },
  error: { label: 'Thất bại', color: 'error' },
  running: { label: 'Đang chạy', color: 'warning' },
  rejected: { label: 'Bị từ chối', color: 'warning' },
}

const nextOf = (last: { nextCursor?: string | number | null }) => last.nextCursor ?? undefined

function IssueRow({ issue, onResolve, busy }: { issue: SyncIssue; onResolve: (id: number) => void; busy: boolean }) {
  return (
    <TableRow hover>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(issue.createdAt)}</TableCell>
      <TableCell>{issue.dataset}</TableCell>
      <TableCell><Chip size="small" label={issue.kind} /></TableCell>
      <TableCell>
        <Box component="span" sx={{ fontWeight: 600 }}>{issue.sourceKey}</Box>
        {issue.detailsJson && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{issue.detailsJson}</Typography>
        )}
      </TableCell>
      <TableCell align="right">
        {issue.resolvedAt ? (
          <Typography variant="caption" color="text.secondary">Đã xử lý {formatDateTime(issue.resolvedAt)}</Typography>
        ) : (
          <Button size="small" disabled={busy} onClick={() => onResolve(issue.id)} aria-label={`Đánh dấu đã xử lý ${issue.sourceKey}`}>
            Đã xử lý
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}

export function Component() {
  const qc = useQueryClient()
  const runs = useInfiniteQuery({
    queryKey: ['admin', 'sync-runs'],
    queryFn: ({ pageParam }) => hrmAdmin.syncRuns(pageParam),
    initialPageParam: undefined as string | number | undefined,
    getNextPageParam: nextOf,
  })
  const issues = useInfiniteQuery({
    queryKey: ['admin', 'sync-issues', 'open'],
    queryFn: ({ pageParam }) => hrmAdmin.syncIssues(false, pageParam),
    initialPageParam: undefined as string | number | undefined,
    getNextPageParam: nextOf,
  })
  const resolve = useMutation({
    mutationFn: (id: number) => hrmAdmin.resolveIssue(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'sync-issues'] })
      void qc.invalidateQueries({ queryKey: ['admin', 'sync-runs'] })
    },
  })

  const runRows = runs.data?.pages.flatMap((p) => p.items) ?? []
  const issueRows = issues.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <>
      <PageHeader title="Đồng bộ" eyebrow="Quản trị" subtitle="Lịch sử đồng bộ dữ liệu từ HRM và các vấn đề cần xử lý." />

      <SectionLabel sx={{ mt: 3, mb: 1 }}>Vấn đề chưa xử lý</SectionLabel>
      {resolve.error && <Alert severity="error" sx={{ mb: 1 }}>{errorMessage(resolve.error, 'Không đánh dấu được vấn đề.')}</Alert>}
      <PageState error={issues.error} loading={issues.isPending} empty={issueRows.length === 0} emptyMessage="Không có vấn đề nào cần xử lý." errorFallback="Không tải được danh sách vấn đề." onRetry={() => issues.refetch()}>
        <AcrylicCard sx={{ overflow: 'hidden' }}>
          <TableContainer>
            <Table size="small" aria-label="Vấn đề đồng bộ">
              <TableHead>
                <TableRow>
                  <TableCell>Phát hiện</TableCell>
                  <TableCell>Bộ dữ liệu</TableCell>
                  <TableCell>Loại</TableCell>
                  <TableCell>Khóa nguồn</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {issueRows.map((i) => (
                  <IssueRow key={i.id} issue={i} busy={resolve.isPending} onResolve={(id) => resolve.mutate(id)} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </AcrylicCard>
        <Stack sx={{ mt: 2 }}>
          <LoadMore visible={Boolean(issues.hasNextPage)} loading={issues.isFetchingNextPage} onClick={() => issues.fetchNextPage()} />
        </Stack>
      </PageState>

      <SectionLabel sx={{ mt: 4, mb: 1 }}>Lần đồng bộ gần đây</SectionLabel>
      <PageState error={runs.error} loading={runs.isPending} empty={runRows.length === 0} emptyMessage="Chưa có lần đồng bộ nào." errorFallback="Không tải được lịch sử đồng bộ." onRetry={() => runs.refetch()}>
        <AcrylicCard sx={{ overflow: 'hidden' }}>
          <TableContainer>
            <Table size="small" aria-label="Lịch sử đồng bộ">
              <TableHead>
                <TableRow>
                  <TableCell>Bắt đầu</TableCell>
                  <TableCell>Bộ dữ liệu</TableCell>
                  <TableCell>Trạng thái</TableCell>
                  <TableCell align="right">Nhận</TableCell>
                  <TableCell align="right">Thêm</TableCell>
                  <TableCell align="right">Sửa</TableCell>
                  <TableCell align="right">Xóa</TableCell>
                  <TableCell align="right">Vấn đề mở</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {runRows.map((r) => {
                  const s = RUN_STATUS[r.status] ?? { label: r.status, color: 'default' as const }
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.startedAt)}</TableCell>
                      <TableCell>
                        {r.dataset}
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{r.source}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" color={s.color} label={s.label} />
                        {r.error && <Typography variant="caption" color="error" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{r.error}</Typography>}
                      </TableCell>
                      <TableCell align="right">{r.received}</TableCell>
                      <TableCell align="right">{r.inserted}</TableCell>
                      <TableCell align="right">{r.updated}</TableCell>
                      <TableCell align="right">{r.deleted}</TableCell>
                      <TableCell align="right">{r.openIssueCount}/{r.issueCount}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </AcrylicCard>
        <Stack sx={{ mt: 2 }}>
          <LoadMore visible={Boolean(runs.hasNextPage)} loading={runs.isFetchingNextPage} onClick={() => runs.fetchNextPage()} />
        </Stack>
      </PageState>
    </>
  )
}

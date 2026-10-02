import PersonRemoveOutlined from '@mui/icons-material/PersonRemoveOutlined'
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { ImportReportDto, MemberCodesRequest } from '../../../api/generated-client'
import AcrylicCard from '../../../ui/AcrylicCard'
import { errorMessage } from '../../../ui/errorMessage'
import PageState from '../../../ui/PageState'
import SectionLabel from '../../../ui/SectionLabel'
import { groupsClient } from '../../admin/clients'
import { LoadMore, formatDateTime, useDebounced } from '../../admin/common'

/** Split a pasted list of MSCBs (commas, semicolons, spaces, new lines) into unique codes. */
export function parseCodes(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))]
}

function Summary({ label, items }: { label: string; items: readonly string[] | undefined }) {
  if (!items || items.length === 0) return null
  return (
    <Typography variant="body2">
      <b>{label} ({items.length}):</b> {items.slice(0, 15).join(', ')}
      {items.length > 15 ? '…' : ''}
    </Typography>
  )
}

function ImportPanel({ groupId, onDone }: { groupId: number; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ImportReportDto | null>(null)

  const run = useMutation({
    mutationFn: ({ f, dryRun }: { f: File; dryRun: boolean }) =>
      groupsClient.importMembers(groupId, dryRun, { data: f, fileName: f.name }),
    onSuccess: (r) => {
      setReport(r)
      if (!r.dryRun) {
        setFile(null)
        onDone()
      }
    },
  })

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
        <Button startIcon={<UploadFileOutlined />} variant="outlined" onClick={() => fileRef.current?.click()} disabled={run.isPending}>
          Nhập từ tệp CSV / Excel
        </Button>
        <input
          ref={fileRef}
          type="file"
          hidden
          data-testid="members-file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) {
              setFile(f)
              setReport(null)
              run.mutate({ f, dryRun: true })
            }
          }}
        />
        {file && <Typography variant="body2" color="text.secondary">{file.name}</Typography>}
      </Stack>
      {run.error && <Alert severity="error">{errorMessage(run.error, 'Không đọc được tệp.')}</Alert>}
      {report && (
        <Alert severity={report.dryRun ? 'info' : 'success'} sx={{ '& .MuiAlert-message': { width: '100%' } }}>
          <Stack spacing={0.5}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {report.dryRun ? 'Kết quả kiểm tra (chưa thay đổi gì)' : 'Đã nhập'}: {report.rows} dòng · {report.added?.length ?? 0} sẽ thêm mới
            </Typography>
            <Summary label="Đã là thành viên" items={report.alreadyMember} />
            <Summary label="Trùng trong tệp" items={report.duplicate} />
            <Summary label="Không tồn tại" items={report.unknown} />
            <Summary label="Ngưng hoạt động" items={report.inactive} />
            {report.dryRun && file && (report.added?.length ?? 0) > 0 && (
              <Stack direction="row" sx={{ pt: 1 }}>
                <Button size="small" variant="contained" disabled={run.isPending} onClick={() => run.mutate({ f: file, dryRun: false })}>
                  Áp dụng ({report.added?.length})
                </Button>
              </Stack>
            )}
          </Stack>
        </Alert>
      )}
    </Stack>
  )
}

export default function GroupMembers({ groupId, editable }: { groupId: number; editable: boolean }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [codesText, setCodesText] = useState('')
  const dq = useDebounced(q)

  const list = useInfiniteQuery({
    queryKey: ['groups', groupId, 'members', dq],
    queryFn: ({ pageParam }) => groupsClient.members(groupId, dq || undefined, pageParam, 50),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.items ?? []) ?? []

  const refresh = () => {
    setSelected(new Set())
    void qc.invalidateQueries({ queryKey: ['groups'] })
  }

  const add = useMutation({
    mutationFn: (codes: string[]) => groupsClient.addMembers(groupId, new MemberCodesRequest({ codes })),
    onSuccess: () => {
      setCodesText('')
      refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (codes: string[]) => groupsClient.removeMembers(groupId, new MemberCodesRequest({ codes })),
    onSuccess: refresh,
  })

  const codes = parseCodes(codesText)
  const toggle = (code: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(code)) n.delete(code)
      else n.add(code)
      return n
    })

  return (
    <Stack spacing={2}>
      {editable && (
        <AcrylicCard sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <SectionLabel>Thêm thành viên</SectionLabel>
            <TextField
              size="small"
              multiline
              minRows={2}
              label="Danh sách MSCB"
              placeholder="Mỗi MSCB một dòng, hoặc cách nhau bằng dấu phẩy"
              value={codesText}
              onChange={(e) => setCodesText(e.target.value)}
            />
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Button variant="contained" disabled={codes.length === 0 || add.isPending} onClick={() => add.mutate(codes)}>
                {add.isPending ? 'Đang thêm…' : `Thêm ${codes.length > 0 ? codes.length : ''} MSCB`.trim()}
              </Button>
            </Stack>
            {add.error && <Alert severity="error">{errorMessage(add.error, 'Không thêm được thành viên.')}</Alert>}
            {add.data && (
              <Alert severity="info">
                <Typography variant="body2">Đã thêm {add.data.added?.length ?? 0} · Tổng {add.data.memberCount} thành viên</Typography>
                <Summary label="Đã là thành viên" items={add.data.alreadyMember} />
                <Summary label="Không tồn tại" items={add.data.unknown} />
                <Summary label="Ngưng hoạt động" items={add.data.inactive} />
              </Alert>
            )}
            <ImportPanel groupId={groupId} onDone={refresh} />
          </Stack>
        </AcrylicCard>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <TextField size="small" label="Tìm thành viên" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 240 }} />
        {editable && (
          <Button color="error" startIcon={<PersonRemoveOutlined />} disabled={selected.size === 0 || remove.isPending} onClick={() => remove.mutate([...selected])}>
            Xóa {selected.size > 0 ? `${selected.size} ` : ''}đã chọn
          </Button>
        )}
      </Stack>
      {remove.error && <Alert severity="error">{errorMessage(remove.error, 'Không xóa được thành viên.')}</Alert>}

      <PageState error={list.error} loading={list.isPending} empty={rows.length === 0} emptyMessage="Nhóm chưa có thành viên." errorFallback="Không tải được danh sách thành viên." onRetry={() => list.refetch()}>
        <AcrylicCard sx={{ overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: 480 }}>
            <Table size="small" stickyHeader aria-label="Thành viên">
              <TableHead>
                <TableRow>
                  {editable && <TableCell padding="checkbox" />}
                  <TableCell>MSCB</TableCell>
                  <TableCell>Họ tên</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Đơn vị</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Thêm lúc</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.code} hover>
                    {editable && (
                      <TableCell padding="checkbox">
                        <Checkbox size="small" checked={selected.has(m.code ?? '')} onChange={() => toggle(m.code ?? '')} slotProps={{ input: { 'aria-label': `Chọn ${m.fullName}` } }} />
                      </TableCell>
                    )}
                    <TableCell>{m.code}</TableCell>
                    <TableCell>{m.fullName}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{m.unit ?? '—'}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{formatDateTime(m.addedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </AcrylicCard>
        <Stack>
          <LoadMore visible={Boolean(list.hasNextPage)} loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()} />
        </Stack>
      </PageState>
    </Stack>
  )
}

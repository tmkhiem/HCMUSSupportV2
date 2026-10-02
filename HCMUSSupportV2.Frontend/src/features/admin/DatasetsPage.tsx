import DownloadOutlined from '@mui/icons-material/DownloadOutlined'
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import AcrylicCard from '../../ui/AcrylicCard'
import { errorMessage } from '../../ui/errorMessage'
import PageHeader from '../../ui/PageHeader'
import SectionLabel from '../../ui/SectionLabel'
import { datasetsClient } from './clients'
import { toReport } from './datasetReport'
import type { DatasetName, DatasetReport } from './datasetReport'

const DATASETS: { id: DatasetName; label: string; note: string }[] = [
  { id: 'teaching', label: 'Giảng dạy', note: 'Dữ liệu giảng dạy được thay thế theo từng cặp (năm học, bậc đào tạo) có trong tệp; các bậc khác của cùng năm học được giữ nguyên.' },
  { id: 'research', label: 'Đề tài nghiên cứu', note: 'Toàn bộ danh sách đề tài được thay thế bằng nội dung tệp.' },
  { id: 'publications', label: 'Bài báo khoa học', note: 'Toàn bộ danh sách bài báo được thay thế bằng nội dung tệp.' },
]

const STATUS: Record<string, string> = {
  validated: 'Hợp lệ, chờ áp dụng',
  rejected: 'Bị từ chối',
  applied: 'Đã áp dụng',
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Stack sx={{ minWidth: 110 }}>
      <Typography variant="h5" component="div">{new Intl.NumberFormat('vi-VN').format(value)}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Stack>
  )
}

function Report({ report, onApply, applying }: { report: DatasetReport; onApply?: () => void; applying: boolean }) {
  const applied = report.status === 'applied'
  const canApply = report.status === 'validated' && !applied
  return (
    <AcrylicCard sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{report.fileName}</Typography>
          <Chip size="small" color={applied ? 'success' : canApply ? 'primary' : 'warning'} label={STATUS[report.status] ?? report.status} />
        </Stack>
        <Stack direction="row" useFlexGap spacing={3} sx={{ flexWrap: 'wrap' }}>
          <Metric label="Tổng số dòng" value={report.totalRows} />
          <Metric label="Dòng mới" value={report.newRows} />
          <Metric label="Dòng cập nhật" value={report.updatedRows} />
          <Metric label="Dòng bị xóa" value={report.removedRows} />
        </Stack>
        {report.academicYears.length > 0 && (
          <Typography variant="body2" color="text.secondary">Năm học trong tệp: {report.academicYears.join(', ')}</Typography>
        )}
        {report.unknownMscbs.length > 0 && (
          <Alert severity="warning">
            {report.unknownMscbs.length} MSCB không tồn tại trong hệ thống: {report.unknownMscbs.slice(0, 20).join(', ')}
            {report.unknownMscbs.length > 20 ? '…' : ''}
          </Alert>
        )}
        {report.badValues.length > 0 && (
          <>
            <SectionLabel>Giá trị không hợp lệ ({report.badValues.length})</SectionLabel>
            <List dense disablePadding aria-label="Giá trị không hợp lệ">
              {report.badValues.slice(0, 50).map((b) => (
                <ListItem key={`${b.row}-${b.column}-${b.message}`} disableGutters divider>
                  <ListItemText primary={`Dòng ${b.row} · cột ${b.column}`} secondary={b.message} />
                </ListItem>
              ))}
            </List>
          </>
        )}
        {report.status === 'rejected' && report.badValues.length === 0 && (
          <Alert severity="error">Tệp bị từ chối. Hãy sửa lỗi và tải lên lại.</Alert>
        )}
        {applied && <Alert severity="success">Đã áp dụng dữ liệu.</Alert>}
        {canApply && (
          <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
            <Button variant="contained" onClick={onApply} disabled={applying}>
              {applying ? 'Đang áp dụng…' : 'Áp dụng'}
            </Button>
          </Stack>
        )}
      </Stack>
    </AcrylicCard>
  )
}

export function Component() {
  const [dataset, setDataset] = useState<DatasetName>('teaching')
  const [report, setReport] = useState<DatasetReport | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const current = DATASETS.find((d) => d.id === dataset)!

  const upload = useMutation({
    mutationFn: async (file: File) => toReport(await datasetsClient.import(dataset, { data: file, fileName: file.name })),
    onSuccess: setReport,
  })
  const apply = useMutation({
    mutationFn: async (id: string) => toReport(await datasetsClient.apply(id)),
    onSuccess: setReport,
  })

  return (
    <>
      <PageHeader title="Dữ liệu" eyebrow="Quản trị" subtitle="Nhập dữ liệu giảng dạy, đề tài và bài báo từ tệp Excel. Kiểm tra trước, áp dụng sau." />
      <Tabs
        value={dataset}
        onChange={(_, v: DatasetName) => {
          setDataset(v)
          setReport(null)
          upload.reset()
          apply.reset()
        }}
        variant="scrollable"
        sx={{ mt: 2, mb: 2 }}
        aria-label="Bộ dữ liệu"
      >
        {DATASETS.map((d) => (
          <Tab key={d.id} value={d.id} label={d.label} />
        ))}
      </Tabs>

      <AcrylicCard sx={{ p: 3, mb: 2 }}>
        <Stack spacing={2}>
          <Typography color="text.secondary">{current.note}</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button component="a" href={`/api/admin/datasets/${dataset}/template`} download startIcon={<DownloadOutlined />} variant="outlined">
              Tải tệp mẫu
            </Button>
            <Button startIcon={<UploadFileOutlined />} variant="contained" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
              {upload.isPending ? 'Đang kiểm tra…' : 'Chọn tệp .xlsx để kiểm tra'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              hidden
              data-testid="dataset-file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) {
                  apply.reset()
                  upload.mutate(f)
                }
              }}
            />
          </Stack>
          {upload.error && <Alert severity="error">{errorMessage(upload.error, 'Không kiểm tra được tệp.')}</Alert>}
          {apply.error && <Alert severity="error">{errorMessage(apply.error, 'Không áp dụng được dữ liệu.')}</Alert>}
        </Stack>
      </AcrylicCard>

      {report && report.dataset === dataset && (
        <Report report={report} applying={apply.isPending} onApply={() => apply.mutate(report.id)} />
      )}
    </>
  )
}

import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import CloseIcon from '@mui/icons-material/Close'
import DownloadIcon from '@mui/icons-material/Download'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useRef, useState } from 'react'
import { errorMessage } from '../../ui'
import { importTemplateCsv } from './employeesFormat'
import { useImportEmails } from './employeesQueries'
import type { ImportReport } from './employeesTypes'
import ImportReportView from './ImportReportView'

export interface ImportDialogProps {
  open: boolean
  onClose: () => void
}

const MAX_BYTES = 5 * 1024 * 1024

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([importTemplateCsv()], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'mau-nhan-su-email.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Bulk import in three steps: choose a file, "Kiểm tra tệp" (dry run, nothing is written) and read the report, then
 * "Áp dụng" uploads the same file again with `dryRun=false`. Changing the file or the option goes back to step one.
 */
export default function ImportDialog({ open, onClose }: ImportDialogProps) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true })
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [removeMissing, setRemoveMissing] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const run = useImportEmails()

  const reset = () => {
    setFile(null)
    setReport(null)
    setFileError(null)
    setRemoveMissing(false)
    run.reset()
    if (input.current) input.current.value = ''
  }

  const close = () => {
    onClose()
    // Clear after the exit transition so the content does not jump while closing.
    setTimeout(reset, 200)
  }

  const choose = (picked: File | undefined) => {
    run.reset()
    setReport(null)
    if (!picked) return
    if (!/\.(xlsx|csv)$/i.test(picked.name)) {
      setFile(null)
      setFileError('Chỉ hỗ trợ tệp .xlsx hoặc .csv.')
      return
    }
    if (picked.size > MAX_BYTES) {
      setFile(null)
      setFileError('Tệp tối đa 5 MB.')
      return
    }
    setFileError(null)
    setFile(picked)
  }

  const check = () => file && run.mutate({ file, dryRun: true, removeMissing }, { onSuccess: setReport })
  const apply = () => file && run.mutate({ file, dryRun: false, removeMissing }, { onSuccess: setReport })

  const applied = report !== null && !report.dryRun
  const previewed = report !== null && report.dryRun
  const changes = report ? report.addedCount + report.removedCount : 0

  return (
    <Dialog open={open} onClose={close} fullScreen={fullScreen} fullWidth maxWidth="md" aria-labelledby="import-title">
      <DialogTitle id="import-title" sx={{ pr: 7 }}>
        Nhập MSCB và email từ tệp
        <IconButton aria-label="Đóng" onClick={close} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Tệp Excel (.xlsx) hoặc .csv có dòng tiêu đề <b>MSCB</b>, <b>Họ tên</b> (không bắt buộc) và <b>Email 1</b>, <b>Email 2</b>…
            Bước đầu chỉ kiểm tra: chưa có gì được ghi cho đến khi bạn bấm “Áp dụng”.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
            <input
              ref={input}
              type="file"
              accept=".xlsx,.csv"
              hidden
              data-testid="import-file"
              onChange={(e) => choose(e.target.files?.[0])}
            />
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => input.current?.click()} disabled={run.isPending}>
              {file ? 'Chọn tệp khác' : 'Chọn tệp'}
            </Button>
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere', flex: 1 }} aria-live="polite">
              {file ? file.name : 'Chưa chọn tệp'}
            </Typography>
            <Button size="small" startIcon={<DownloadIcon />} onClick={downloadTemplate}>
              Tải tệp mẫu
            </Button>
          </Stack>
          {fileError && <Alert severity="error">{fileError}</Alert>}

          <FormControlLabel
            control={
              <Checkbox
                checked={removeMissing}
                disabled={run.isPending || applied}
                onChange={(e) => {
                  setRemoveMissing(e.target.checked)
                  setReport(null)
                }}
              />
            }
            label="Với mỗi MSCB trong tệp, chỉ giữ các email trong tệp (gỡ các email khác)"
          />
          {removeMissing && !applied && (
            <Alert severity="warning">
              Các email của MSCB có trong tệp mà không xuất hiện trong tệp sẽ bị gỡ. Xem mục “Email sẽ bị gỡ” trong báo cáo trước khi áp dụng.
            </Alert>
          )}

          {run.isError && <Alert severity="error">{errorMessage(run.error, 'Không xử lý được tệp. Vui lòng thử lại.')}</Alert>}

          {run.isPending && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress aria-label="Đang xử lý tệp" />
            </Box>
          )}

          {applied && report && (
            <Alert severity="success" icon={<CheckCircleOutlinedIcon />} data-testid="import-applied">
              Đã áp dụng: thêm {report.addedCount} email, gỡ {report.removedCount} email.
              {report.conflictCount + report.unknownCount + report.invalidCount > 0 ? ' Các dòng có vấn đề đã được bỏ qua.' : ''}
            </Alert>
          )}
          {previewed && report && changes === 0 && (
            <Alert severity="info">Không có thay đổi nào để áp dụng.</Alert>
          )}

          {report && !run.isPending && <ImportReportView report={report} />}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        {applied ? (
          <>
            <Button color="inherit" onClick={reset}>
              Nhập tệp khác
            </Button>
            <Button variant="contained" onClick={close}>
              Xong
            </Button>
          </>
        ) : (
          <>
            <Button color="inherit" onClick={close}>
              Hủy
            </Button>
            <Button variant={previewed ? 'outlined' : 'contained'} disabled={!file || run.isPending} onClick={check}>
              Kiểm tra tệp
            </Button>
            {previewed && (
              <Button variant="contained" disabled={changes === 0 || run.isPending} onClick={apply}>
                Áp dụng{changes > 0 ? ` (${changes})` : ''}
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}

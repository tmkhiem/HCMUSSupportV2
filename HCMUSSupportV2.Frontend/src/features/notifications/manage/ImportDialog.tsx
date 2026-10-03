import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined'
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import { useTheme } from '@mui/material/styles'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useRef, useState } from 'react'
import { formatNumber } from '../../../lib/format'
import { SectionLabel, errorMessage } from '../../../ui'
import { applyRecipientImport, recipientTemplateUrl, uploadRecipients } from './manageApi'
import type { ImportReport, ManageDetail, RecipientImport } from './manageTypes'

export interface ImportDialogProps {
  open: boolean
  /** The saved notification the sheet is uploaded to. */
  notificationId: string
  onClose: () => void
  /** The notification after "Áp dụng": its declared variables and its audience changed. */
  onApplied: (detail: ManageDetail) => void
}

const MAX_SHOWN = 12

/**
 * "Tải danh sách": upload an xlsx or csv (an MSCB column plus one column per variable), read the validation report,
 * then apply it. Applying makes the sheet the recipient list and merges its columns into the declared variables.
 */
export default function ImportDialog({ open, notificationId, onClose, onApplied }: ImportDialogProps) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'))
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'apply' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RecipientImport | null>(null)

  const reset = () => {
    setBusy(null)
    setError(null)
    setResult(null)
  }
  const close = () => {
    if (busy) return
    reset()
    onClose()
  }

  const upload = async (file: File) => {
    setBusy('upload')
    setError(null)
    setResult(null)
    try {
      setResult(await uploadRecipients(notificationId, file))
    } catch (e) {
      setError(errorMessage(e, 'Không đọc được tệp. Chọn tệp .xlsx hoặc .csv hợp lệ.'))
    } finally {
      setBusy(null)
      if (input.current) input.current.value = ''
    }
  }

  const apply = async () => {
    if (!result) return
    setBusy('apply')
    setError(null)
    try {
      const detail = await applyRecipientImport(notificationId, result.importId)
      reset()
      onApplied(detail)
    } catch (e) {
      setError(errorMessage(e, 'Không áp dụng được danh sách. Vui lòng thử lại.'))
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="md" fullScreen={fullScreen} aria-labelledby="import-title">
      <DialogTitle id="import-title">Tải danh sách người nhận</DialogTitle>
      <DialogContent dividers>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Tệp .xlsx hoặc .csv có một cột <b>MSCB</b> và một cột cho mỗi biến trong nội dung (tiêu đề cột là tên biến). Một người có thể có nhiều dòng.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
          <Button
            variant="contained"
            startIcon={busy === 'upload' ? <CircularProgress size={16} color="inherit" /> : <UploadFileOutlined />}
            disabled={busy !== null}
            onClick={() => input.current?.click()}
          >
            {result ? 'Chọn tệp khác' : 'Chọn tệp'}
          </Button>
          <Button variant="outlined" startIcon={<FileDownloadOutlined />} component="a" href={recipientTemplateUrl(notificationId)} download>
            Tải tệp mẫu
          </Button>
          <input
            ref={input}
            type="file"
            hidden
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            data-testid="import-file"
            aria-label="Tệp danh sách người nhận"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
            }}
          />
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {result && <ReportView report={result.report} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy !== null}>
          Đóng
        </Button>
        <Button
          variant="contained"
          disabled={!result?.report.canApply || busy !== null}
          onClick={() => void apply()}
          startIcon={busy === 'apply' ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Áp dụng danh sách
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function CodeList({ codes, total }: { codes: string[]; total?: number }) {
  const shown = codes.slice(0, MAX_SHOWN)
  const more = (total ?? codes.length) - shown.length
  return (
    <Box component="span" sx={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.875rem' }}>
      {shown.join(', ')}
      {more > 0 ? ` … và ${formatNumber(more)} mã khác` : ''}
    </Box>
  )
}

/** The server's validation report as stats, warnings and the column mapping. */
export function ReportView({ report }: { report: ImportReport }) {
  return (
    <Stack spacing={1.5} data-testid="import-report">
      <SectionLabel>Kết quả kiểm tra{report.fileName ? ` · ${report.fileName}` : ''}</SectionLabel>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Chip label={`${formatNumber(report.rows)} dòng`} />
        <Chip label={`${formatNumber(report.distinctEmployees)} người nhận`} color="primary" />
        {report.employeesWithMultipleRows > 0 && <Chip variant="outlined" label={`${formatNumber(report.employeesWithMultipleRows)} người có nhiều dòng`} />}
        <Chip variant="outlined" label={`Cột mã: ${report.mscbColumn ?? '—'}`} />
      </Box>

      {report.errors.length > 0 && (
        <Alert severity="error">
          {report.errors.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </Alert>
      )}
      {report.unknownCodeCount > 0 && (
        <Alert severity="warning">
          {formatNumber(report.unknownCodeCount)} mã không có trong danh sách nhân sự, sẽ không nhận được thông báo: <CodeList codes={report.unknownCodes} total={report.unknownCodeCount} />
        </Alert>
      )}
      {report.inactiveCodeCount > 0 && (
        <Alert severity="info">
          {formatNumber(report.inactiveCodeCount)} nhân sự đang không hoạt động, sẽ nhận khi hoạt động trở lại: <CodeList codes={report.inactiveCodes} total={report.inactiveCodeCount} />
        </Alert>
      )}
      {report.duplicateRows > 0 && (
        <Alert severity="info">
          {formatNumber(report.duplicateRows)} dòng trùng hệt dòng khác của cùng một người (vẫn được giữ): <CodeList codes={report.duplicateRowCodes} />
        </Alert>
      )}
      {report.rowsWithoutCode > 0 && <Alert severity="warning">{formatNumber(report.rowsWithoutCode)} dòng không có mã số nên bị bỏ qua.</Alert>}
      {report.missingInFile.length > 0 && (
        <Alert severity="warning">
          Nội dung dùng biến nhưng tệp thiếu cột tương ứng: <b>{report.missingInFile.join(', ')}</b>. Giá trị sẽ hiển thị “—”.
        </Alert>
      )}
      {report.unusedColumns.length > 0 && <Alert severity="info">Cột chưa được dùng trong nội dung: {report.unusedColumns.join(', ')}.</Alert>}
      {report.errors.length === 0 && report.unknownCodeCount === 0 && report.missingInFile.length === 0 && report.canApply && (
        <Alert severity="success">Tệp hợp lệ. Bấm “Áp dụng danh sách” để dùng làm danh sách người nhận.</Alert>
      )}

      {report.columns.length > 0 && (
        <TableContainer sx={{ borderRadius: 1, maxHeight: 280 }}>
          <Table size="small" stickyHeader aria-label="Các cột của tệp">
            <TableHead>
              <TableRow>
                <TableCell>Tiêu đề cột</TableCell>
                <TableCell>Biến</TableCell>
                <TableCell>Nhãn</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {report.columns.map((c) => (
                <TableRow key={c.key}>
                  <TableCell>{c.header}</TableCell>
                  <TableCell sx={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>{c.key}</TableCell>
                  <TableCell>{c.label}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  )
}

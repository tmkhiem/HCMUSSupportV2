import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { errorMessage } from '../../../ui'
import MarkdownPreviewPane from '../editor/MarkdownPreviewPane'
import { EmployeeSinglePicker } from './Pickers'
import { employeeLabel } from './labels'
import { usePreviewVars } from './manageQueries'
import type { AudienceInput } from './manageQueries'
import type { EmployeeRef } from './manageTypes'

export interface PreviewPanelProps {
  /** The unsaved draft body. */
  markdown: string
  /** Saved notification id; the recipient's real rows need it. */
  notificationId: string | null
  version: number | undefined
  employee: EmployeeRef | null
  onEmployee: (e: EmployeeRef | null) => void
  /** The current targeting choices: the picker offers exactly these recipients. */
  audience: AudienceInput
}

const REASON_LABEL = (r: string) => {
  if (r === 'all') return 'tất cả nhân sự'
  if (r === 'employee') return 'được chọn đích danh'
  if (r === 'import') return 'có trong tệp danh sách'
  if (r.startsWith('group:')) return `nhóm ${r.slice(6)}`
  return r
}

/**
 * The live preview of the unsaved draft as one recipient: the same renderer the employee sees, fed with that person's
 * rows from the saved sheet. Picking "Xem trước với tư cách…" also says whether the person is in the saved audience.
 */
export default function PreviewPanel({ markdown, notificationId, version, employee, onEmployee, audience }: PreviewPanelProps) {
  const preview = usePreviewVars(notificationId ?? undefined, employee?.code ?? null, version, null)
  const data = preview.data
  const rows = data?.rows ?? []
  const label = employee ? employeeLabel(data ? { code: data.employeeCode, fullName: data.fullName ?? employee.fullName } : employee) : undefined

  return (
    <Stack spacing={1.5} data-testid="preview-panel">
      <EmployeeSinglePicker value={employee} onChange={onEmployee} audience={audience} />

      {employee && notificationId === null && (
        <Alert severity="info">Lưu bản nháp để xem với dữ liệu riêng của người này. Hiện các biến hiển thị “—”.</Alert>
      )}
      {preview.isError && <Alert severity="error">{errorMessage(preview.error, 'Không tải được dữ liệu của người này.')}</Alert>}
      {data && (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }} data-testid="preview-status">
          {!data.employeeExists ? (
            <Chip size="small" color="error" label="Không có nhân sự này" />
          ) : data.inAudience ? (
            <Chip size="small" color="success" label="Thuộc đối tượng nhận" />
          ) : (
            <Chip size="small" color="warning" label="Chưa thuộc đối tượng nhận (theo bản đã lưu)" />
          )}
          {data.audienceReasons.map((r) => (
            <Chip key={r} size="small" variant="outlined" label={REASON_LABEL(r)} />
          ))}
          {data.source === 'pending' && (
            <Chip size="small" variant="outlined" color="info" label={data.inPendingImport ? 'Dữ liệu từ tệp chưa áp dụng' : 'Tệp chưa áp dụng không có người này'} />
          )}
          {data.employeeExists && rows.length === 0 && (
            <Typography variant="caption" color="text.secondary">
              Chưa có dữ liệu riêng: các biến hiển thị “—”.
            </Typography>
          )}
          {rows.length > 1 && (
            <Typography variant="caption" color="text.secondary">
              {rows.length} dòng dữ liệu: nội dung lặp lại cho từng dòng.
            </Typography>
          )}
        </Stack>
      )}

      <MarkdownPreviewPane markdown={markdown} vars={rows} recipientLabel={label} />
    </Stack>
  )
}

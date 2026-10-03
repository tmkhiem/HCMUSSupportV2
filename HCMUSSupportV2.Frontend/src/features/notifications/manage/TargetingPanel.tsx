import GroupsOutlined from '@mui/icons-material/GroupsOutlined'
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { formatDateTime, formatNumber } from '../../../lib/format'
import { AcrylicCard, SectionLabel } from '../../../ui'
import { EmployeeMultiPicker, GroupMultiPicker } from './Pickers'
import { recipientTemplateUrl } from './manageApi'
import { useAudienceEstimate } from './manageQueries'
import type { EmployeeRef, GroupRef, ImportSummary, NotificationStatus } from './manageTypes'

export interface TargetingValue {
  audienceAll: boolean
  groups: GroupRef[]
  employees: EmployeeRef[]
}

export interface TargetingPanelProps {
  value: TargetingValue
  onChange: (next: TargetingValue) => void
  /** The sheet that is the recipient list (applied, or the latest validated one when it is not applied yet). */
  importSummary: ImportSummary | null
  /** Saved notification id, for the template link. */
  notificationId: string | null
  status: NotificationStatus
  /** Recipients already delivered (published notifications). */
  deliveredCount: number
  onUpload: () => void
  disabled?: boolean
  /** Server message for `errors.audience`. */
  error?: string
  uploading?: boolean
}

/**
 * Who gets the notification: everyone (with an email), groups, named employees, and a recipient sheet. The choices add
 * up. The count under the title is the server's live estimate for exactly these (unsaved) choices.
 */
export default function TargetingPanel({ value, onChange, importSummary, notificationId, status, deliveredCount, onUpload, disabled, error, uploading }: TargetingPanelProps) {
  const sheetApplied = importSummary !== null && importSummary.status === 'applied'
  const estimate = useAudienceEstimate({
    audienceAll: value.audienceAll,
    groupIds: value.groups.map((g) => g.id),
    employeeCodes: value.employees.map((e) => e.code),
    importId: sheetApplied ? importSummary.importId : null,
  })
  const nothingChosen = !value.audienceAll && value.groups.length === 0 && value.employees.length === 0 && !sheetApplied
  const live = status === 'published' || status === 'archived'

  return (
    <AcrylicCard sx={{ p: 2.5 }} data-testid="targeting-panel">
      <SectionLabel>Người nhận</SectionLabel>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1, mb: 1.5 }} aria-live="polite" data-testid="recipient-count">
        <Typography component="span" sx={{ fontSize: '1.875rem', fontWeight: 800, lineHeight: 1, color: 'primary.main', fontVariantNumeric: 'tabular-nums' }}>
          {nothingChosen ? '0' : estimate.data === undefined ? '…' : formatNumber(estimate.data)}
        </Typography>
        <Typography component="span" color="text.secondary">
          {live ? `người nhận dự kiến (đã gửi cho ${formatNumber(deliveredCount)})` : 'người nhận dự kiến'}
        </Typography>
      </Box>
      {estimate.isError && <Alert severity="warning" sx={{ mb: 1.5 }}>Không tính được số người nhận lúc này.</Alert>}
      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}

      <Stack spacing={1.75}>
        <FormControlLabel
          control={<Switch checked={value.audienceAll} disabled={disabled} onChange={(e) => onChange({ ...value, audienceAll: e.target.checked })} />}
          label="Tất cả nhân sự (đã có email)"
          slotProps={{ typography: { sx: { fontWeight: 600 } } }}
        />
        <GroupMultiPicker value={value.groups} disabled={disabled} onChange={(groups) => onChange({ ...value, groups })} />
        <EmployeeMultiPicker value={value.employees} disabled={disabled} onChange={(employees) => onChange({ ...value, employees })} />

        <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <GroupsOutlined fontSize="small" color="action" />
            <Typography sx={{ fontWeight: 600, flex: 1, minWidth: 140 }}>Danh sách từ tệp</Typography>
            <Button size="small" variant="outlined" startIcon={<UploadFileOutlined />} disabled={disabled || uploading} onClick={onUpload}>
              Tải danh sách
            </Button>
          </Stack>
          {importSummary ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }} data-testid="import-summary">
              {sheetApplied
                ? `Đang dùng danh sách: ${formatNumber(importSummary.rows)} dòng, ${formatNumber(importSummary.distinctEmployees)} người${importSummary.appliedAt ? `, áp dụng ${formatDateTime(importSummary.appliedAt)}` : ''}.`
                : `Tệp đã kiểm tra nhưng chưa áp dụng (${formatNumber(importSummary.distinctEmployees)} người).`}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Gửi giá trị riêng cho từng người (ví dụ hệ số lương mới) bằng một tệp xlsx hoặc csv.
              {notificationId && (
                <>
                  {' '}
                  <a href={recipientTemplateUrl(notificationId)} download>
                    Tải tệp mẫu
                  </a>
                </>
              )}
            </Typography>
          )}
        </Box>
      </Stack>
    </AcrylicCard>
  )
}

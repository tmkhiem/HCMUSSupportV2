import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import SendOutlined from '@mui/icons-material/SendOutlined'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { formatNumber } from '../../../lib/format'
import { AcrylicCard, SectionLabel } from '../../../ui'
import TagChip from '../TagChip'
import type { FieldErrors } from './draft'
import { useAudienceEstimate, useManageSeries, useManageTags } from './manageQueries'
import type { AudienceInput } from './manageQueries'
import type { DraftForm, ManageDetail } from './manageTypes'

/** Step index (0-based) a server field error belongs to, for the "go back" links. */
export function stepOfField(field: string): number {
  if (field === 'title' || field === 'summary') return 0
  if (field === 'audience' || field === 'groupIds' || field === 'employeeCodes') return 1
  if (field === 'bodyMd' || field === 'variables') return 2
  return 3
}

interface Check {
  ok: boolean
  /** A failing blocking check keeps "Đăng" off. */
  blocking: boolean
  text: string
  step: number
  stepLabel: string
}

export interface ReviewStepProps {
  form: DraftForm
  saved: ManageDetail | null
  audience: AudienceInput
  errors: FieldErrors
  stepLabels: readonly string[]
  goTo: (step: number) => void
  onSave: () => void
  onPublish: () => void
  busy: boolean
}

/** The last step of a new notification: what will be sent, a checklist, and "Lưu nháp" / "Đăng". */
export default function ReviewStep({ form, saved, audience, errors, stepLabels, goTo, onSave, onPublish, busy }: ReviewStepProps) {
  const estimate = useAudienceEstimate(audience)
  const series = useManageSeries()
  const tags = useManageTags()
  const chosen = audience.audienceAll || audience.groupIds.length > 0 || audience.employeeCodes.length > 0 || audience.importId !== null
  const count = chosen ? estimate.data : 0
  const unused = form.variables.filter((v) => !form.bodyMd.includes(`:var[${v.key}]`)).map((v) => v.label || v.key)
  const seriesName = (series.data ?? []).find((s) => s.id === form.seriesId)?.name
  const selectedTags = (tags.data ?? []).filter((t) => form.tagIds.includes(t.id))

  const checks: Check[] = [
    { ok: form.title.trim() !== '', blocking: true, text: 'Có tiêu đề.', step: 0, stepLabel: stepLabels[0] },
    {
      ok: chosen && (count === undefined || count > 0),
      blocking: true,
      text: chosen ? (count === undefined ? 'Đang tính số người nhận…' : `Gửi đến ${formatNumber(count)} người nhận.`) : 'Chưa chọn người nhận nào.',
      step: 1,
      stepLabel: stepLabels[1],
    },
    { ok: form.bodyMd.trim() !== '', blocking: true, text: form.bodyMd.trim() !== '' ? 'Có nội dung.' : 'Nội dung đang trống.', step: 2, stepLabel: stepLabels[2] },
  ]
  if (unused.length > 0) {
    checks.push({
      ok: false,
      blocking: false,
      text: `Placeholder chưa dùng trong nội dung: ${unused.join(', ')}. Không sao nếu bạn không cần.`,
      step: 2,
      stepLabel: stepLabels[2],
    })
  }
  const serverIssues = Object.entries(errors).flatMap(([field, messages]) =>
    messages.map((m) => ({ ok: false, blocking: true, text: m, step: stepOfField(field), stepLabel: stepLabels[stepOfField(field)] }) as Check),
  )
  const all = [...checks, ...serverIssues]
  const blocked = all.some((c) => !c.ok && c.blocking)

  return (
    <Stack spacing={2} data-testid="review-step">
      <AcrylicCard sx={{ p: 2.5 }}>
        <SectionLabel>Kiểm tra trước khi đăng</SectionLabel>
        <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0, mt: 1.5 }} aria-label="Danh sách kiểm tra">
          {all.map((c, i) => (
            <Stack key={i} component="li" direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              {c.ok ? <CheckCircleOutlined color="success" fontSize="small" /> : <WarningAmberOutlined color={c.blocking ? 'error' : 'warning'} fontSize="small" />}
              <Typography variant="body2" sx={{ flex: 1 }}>
                {c.text}
                {!c.ok && (
                  <>
                    {' '}
                    <Link component="button" type="button" onClick={() => goTo(c.step)} sx={{ verticalAlign: 'baseline' }}>
                      Về bước “{c.stepLabel}”
                    </Link>
                  </>
                )}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </AcrylicCard>

      <AcrylicCard sx={{ p: 2.5 }}>
        <SectionLabel>Sẽ gửi đi</SectionLabel>
        <Box component="dl" sx={{ m: 0, mt: 1.5, display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 1 }}>
          <Typography component="dt" variant="body2" color="text.secondary">Tiêu đề</Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 700, overflowWrap: 'anywhere' }}>{form.title.trim() || '—'}</Typography>
          <Typography component="dt" variant="body2" color="text.secondary">Tóm tắt</Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>{form.summary.trim() || 'Lấy từ đoạn đầu của nội dung'}</Typography>
          <Typography component="dt" variant="body2" color="text.secondary">Người nhận</Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0 }}>{count === undefined ? '…' : formatNumber(count)}</Typography>
          <Typography component="dt" variant="body2" color="text.secondary">Chuỗi thông báo</Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0 }}>{seriesName ?? 'Không thuộc chuỗi nào'}</Typography>
          <Typography component="dt" variant="body2" color="text.secondary">Thẻ</Typography>
          <Stack component="dd" direction="row" sx={{ m: 0, gap: 0.75, flexWrap: 'wrap' }}>
            {selectedTags.length === 0 ? <Typography variant="body2">—</Typography> : selectedTags.map((t) => <TagChip key={t.id} tag={t} />)}
          </Stack>
          <Typography component="dt" variant="body2" color="text.secondary">Tệp đính kèm</Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0 }}>{formatNumber(saved?.attachments.length ?? 0)}</Typography>
        </Box>
      </AcrylicCard>

      <Typography variant="body2" color="text.secondary">
        “Lưu nháp” giữ thông báo lại để bạn sửa tiếp; chưa ai nhận được gì. “Đăng” gửi ngay đến người nhận đã chọn, bạn vẫn có thể sửa sau đó.
      </Typography>
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <Button variant="outlined" color="inherit" disabled={busy} onClick={onSave}>
          Lưu nháp
        </Button>
        <Button variant="contained" startIcon={<SendOutlined />} disabled={busy || blocked} onClick={onPublish} data-testid="review-publish">
          Đăng
        </Button>
      </Stack>
    </Stack>
  )
}

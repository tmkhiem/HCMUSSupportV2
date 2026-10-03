import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useState } from 'react'
import { AcrylicCard, SectionLabel } from '../../../ui'
import DateTimeField from './DateTimeField'
import { useManageSeries, useManageTags } from './manageQueries'
import type { DraftForm } from './manageTypes'

export interface SettingsPanelProps {
  form: DraftForm
  onChange: (patch: Partial<DraftForm>) => void
  /** A notification that already went out keeps its publish time; the expiry check needs it. */
  publishAt: Date | null
  errors: { expiresAt?: string; seriesId?: string; tagIds?: string }
  disabled?: boolean
  onManageTags: () => void
}

/** Series, tags, expiry. */
export default function SettingsPanel({ form, onChange, publishAt, errors, disabled, onManageTags }: SettingsPanelProps) {
  const [opened] = useState(() => new Date())
  const tags = useManageTags()
  const series = useManageSeries()
  const selectedTags = (tags.data ?? []).filter((t) => form.tagIds.includes(t.id))

  return (
    <AcrylicCard sx={{ p: 2.5 }} data-testid="settings-panel">
      <SectionLabel>Thiết lập</SectionLabel>
      <Stack spacing={2} sx={{ mt: 1.5 }}>
        <TextField
          select
          size="small"
          label="Chuỗi thông báo"
          value={(series.data ?? []).some((s) => s.id === form.seriesId) ? form.seriesId : ''}
          disabled={disabled}
          error={Boolean(errors.seriesId)}
          helperText={errors.seriesId ?? 'Gom các kỳ cùng loại để người nhận xem “Các kỳ trước”.'}
          onChange={(e) => onChange({ seriesId: e.target.value === '' ? null : Number(e.target.value) })}
        >
          <MenuItem value="">Không thuộc chuỗi nào</MenuItem>
          {(series.data ?? []).map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>

        <Box>
          <Autocomplete
            multiple
            size="small"
            disabled={disabled}
            options={tags.data ?? []}
            value={selectedTags}
            getOptionLabel={(t) => t.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, next) => onChange({ tagIds: next.map((t) => t.id) })}
            noOptionsText="Chưa có thẻ nào."
            renderValue={(items, getItemProps) =>
              items.map((t, index) => {
                const { key, ...props } = getItemProps({ index })
                return <Chip key={key} size="small" variant="tag" label={t.name} {...props} />
              })
            }
            renderInput={(params) => <TextField {...params} label="Thẻ" error={Boolean(errors.tagIds)} helperText={errors.tagIds} />}
          />
          <Button size="small" onClick={onManageTags} sx={{ mt: 0.5 }}>
            Quản lý thẻ và chuỗi
          </Button>
        </Box>

        <DateTimeField
          label="Hết hạn (không bắt buộc)"
          value={form.expiresAt}
          onChange={(expiresAt) => onChange({ expiresAt })}
          minDateTime={publishAt ?? opened}
          disabled={disabled}
          error={Boolean(errors.expiresAt)}
          helperText={errors.expiresAt ?? 'Sau thời điểm này thông báo biến khỏi hộp thư.'}
          testId="expires-at"
        />
      </Stack>
    </AcrylicCard>
  )
}

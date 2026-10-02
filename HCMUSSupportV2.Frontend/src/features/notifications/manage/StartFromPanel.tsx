import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { formatDate, joinParts } from '../../../lib/format'
import { AcrylicCard, SectionLabel, errorMessage } from '../../../ui'
import { cloneNotification, fetchManagePage } from './manageApi'
import { manageKeys, useManageSeries, useStoreDetail } from './manageQueries'
import { STATUS_LABEL } from './manageTypes'
import type { ManageDetail, ManageItem } from './manageTypes'
import { useDebounced } from './useDebounced'

/**
 * "Bắt đầu từ bài đã có": for a recurring notification (the yearly salary raise) copy last time's post, with its text,
 * variables, tags, series and audiences, into a new draft. Recipient sheets and attachments are not copied.
 */
export default function StartFromPanel({ onCloned }: { onCloned: (detail: ManageDetail) => void }) {
  const series = useManageSeries()
  const [seriesId, setSeriesId] = useState<number | null>(null)
  const [input, setInput] = useState('')
  const q = useDebounced(input.trim(), 300)
  const [picked, setPicked] = useState<ManageItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const storeDetail = useStoreDetail()

  const found = useQuery({
    queryKey: [...manageKeys.lists, 'start-from', seriesId, q] as const,
    queryFn: () => fetchManagePage({ status: '', tag: null, series: seriesId, q }, undefined),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })

  const clone = async () => {
    if (!picked) return
    setBusy(true)
    setError(null)
    try {
      const copy = await cloneNotification(picked.id)
      storeDetail(copy)
      onCloned(copy)
    } catch (e) {
      setError(errorMessage(e, 'Không sao chép được thông báo.'))
      setBusy(false)
    }
  }

  return (
    <AcrylicCard sx={{ p: 2.5 }} data-testid="start-from">
      <SectionLabel>Bắt đầu từ bài đã có</SectionLabel>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
        Chép nội dung của kỳ trước thành bản nháp mới, rồi chỉnh số liệu và tải danh sách mới.
      </Typography>
      <Stack spacing={1.5}>
        <TextField select size="small" label="Chuỗi" value={(series.data ?? []).some((s) => s.id === seriesId) ? seriesId : ''} onChange={(e) => setSeriesId(e.target.value === '' ? null : Number(e.target.value))}>
          <MenuItem value="">Tất cả chuỗi</MenuItem>
          {(series.data ?? []).map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>
        <Autocomplete
          size="small"
          options={found.data?.items ?? []}
          value={picked}
          loading={found.isFetching}
          filterOptions={(o) => o}
          getOptionLabel={(o) => o.title}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          inputValue={input}
          onInputChange={(_, v, reason) => (reason === 'reset' ? setInput(picked?.title ?? '') : setInput(v))}
          onChange={(_, next) => setPicked(next)}
          noOptionsText="Không tìm thấy thông báo."
          loadingText="Đang tìm…"
          renderOption={(props, o) => {
            const { key, ...rest } = props
            return (
              <li key={key} {...rest}>
                <Box>
                  <Typography sx={{ fontWeight: 600 }}>{o.title}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {joinParts([STATUS_LABEL[o.status], o.seriesName, formatDate(o.publishedAt ?? o.updatedAt)])}
                  </Typography>
                </Box>
              </li>
            )
          }}
          renderInput={(params) => <TextField {...params} label="Thông báo mẫu" placeholder="Tìm theo tiêu đề" />}
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button variant="outlined" startIcon={<ContentCopyOutlined />} disabled={!picked || busy} onClick={() => void clone()} sx={{ alignSelf: 'flex-start' }}>
          Sao chép thành bản nháp
        </Button>
      </Stack>
    </AcrylicCard>
  )
}

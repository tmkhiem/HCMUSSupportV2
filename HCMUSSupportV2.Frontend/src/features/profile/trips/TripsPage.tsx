import EventAvailableOutlined from '@mui/icons-material/EventAvailableOutlined'
import Box from '@mui/material/Box'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useMemo, useState } from 'react'
import PageHeader from '../../../ui/PageHeader'
import PageState from '../../../ui/PageState'
import StatCard from '../../../ui/StatCard'
import CareerBreadcrumb from '../CareerBreadcrumb'
import { useBusinessTrips } from '../educationApi'
import { tripStats } from '../educationFormat'
import TripsTable from './TripsTable'
import PngIcon from '../../../ui/PngIcon'

const pillSx = {
  borderRadius: 999,
  bgcolor: 'grey.100',
  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
  '& .MuiSelect-select': { borderRadius: 999 },
  minWidth: 160,
}

export function Component() {
  const { data, error, isPending, refetch } = useBusinessTrips()
  const [year, setYear] = useState<number | null>(null)
  const stats = useMemo(() => tripStats(data?.items ?? [], year), [data, year])
  const hint = year === null ? 'Tất cả các năm' : `Năm ${year}`

  return (
    <>
      <CareerBreadcrumb current="Đi công tác" />
      <PageHeader title="Đi công tác" subtitle="Các chuyến công tác trong và ngoài nước." />
      <Box sx={{ mt: 3 }}>
        <PageState
          error={error}
          loading={isPending}
          empty={!!data && data.items.length === 0}
          errorFallback="Không tải được danh sách đi công tác."
          emptyMessage="Chưa có thông tin đi công tác."
          onRetry={() => void refetch()}
        >
          {data && (
            <Stack spacing={3}>
              <Box
                data-testid="trip-stats"
                sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}
              >
                <StatCard
                  index={1}
                  icon={<PngIcon name="airplane-departure" size={28} />}
                  label="Số chuyến"
                  value={stats.tripCount}
                  hint={hint}
                />
                <StatCard
                  index={2}
                  icon={<EventAvailableOutlined color="primary" />}
                  label="Số ngày"
                  value={stats.totalDays}
                  hint={hint}
                />
              </Box>
              <Stack spacing={0.5} sx={{ alignSelf: 'flex-start' }}>
                <Typography variant="caption" color="text.secondary" id="trip-year-label" sx={{ pl: 1, fontWeight: 600 }}>
                  Năm
                </Typography>
                <Select
                  size="small"
                  displayEmpty
                  value={year === null ? '' : String(year)}
                  onChange={(e) => setYear(e.target.value === '' ? null : Number(e.target.value))}
                  labelId="trip-year-label"
                  renderValue={(v) => (v === '' ? 'Tất cả' : v)}
                  sx={pillSx}
                >
                  <MenuItem value="">Tất cả</MenuItem>
                  {data.years.map((y) => (
                    <MenuItem key={y} value={String(y)}>
                      {y}
                    </MenuItem>
                  ))}
                </Select>
              </Stack>
              <TripsTable rows={stats.rows} />
            </Stack>
          )}
        </PageState>
      </Box>
    </>
  )
}

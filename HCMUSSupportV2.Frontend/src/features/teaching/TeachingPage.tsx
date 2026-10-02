import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined'
import ClassOutlined from '@mui/icons-material/ClassOutlined'
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { formatNumber } from '../../lib/format'
import FlyIn from '../../ui/FlyIn'
import PageHeader from '../../ui/PageHeader'
import PageState from '../../ui/PageState'
import StatCard from '../../ui/StatCard'
import { useTeaching, useTeachingYears } from './teachingApi'
import { formatHours, orderedTerms, pickYear, sourceCaption } from './teachingFormat'
import TermGroup from './TermGroup'
import YearSelect from './YearSelect'

export function Component() {
  const years = useTeachingYears()
  const [wanted, setWanted] = useState<string | null>(null)
  const year = years.data ? pickYear(years.data, wanted) : null
  const teaching = useTeaching(year)
  const terms = teaching.data ? orderedTerms(teaching.data.terms) : []
  const caption = teaching.data ? sourceCaption(teaching.data) : null
  const stats = teaching.data?.stats

  return (
    <>
      <PageHeader
        title="Giảng dạy"
        subtitle="Khối lượng giảng dạy theo năm học, quy đổi ra giờ chuẩn."
        actions={years.data && year ? <YearSelect years={years.data} value={year} onChange={setWanted} /> : undefined}
      />
      <Box sx={{ mt: 3 }}>
        <PageState
          error={years.error}
          loading={years.isPending}
          empty={!!years.data && years.data.length === 0}
          errorFallback="Không tải được danh sách năm học giảng dạy."
          emptyMessage="Chưa có dữ liệu giảng dạy."
          onRetry={() => void years.refetch()}
        >
          <PageState
            error={teaching.error}
            loading={teaching.isPending}
            empty={terms.length === 0}
            errorFallback={`Không tải được khối lượng giảng dạy năm học ${year ?? ''}.`.replace(' .', '.')}
            emptyMessage={`Chưa có lớp giảng dạy nào trong năm học ${year ?? ''}.`.replace(' .', '.')}
            onRetry={() => void teaching.refetch()}
          >
            {stats && (
              <Box
                data-testid="teaching-stats"
                sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}
              >
                <StatCard
                  index={1}
                  icon={<AccessTimeOutlined color="primary" />}
                  label="Tổng giờ quy đổi"
                  value={formatHours(stats.totalStandardHours)}
                  hint={`Năm học ${year}`}
                />
                <StatCard
                  index={2}
                  icon={<ClassOutlined color="primary" />}
                  label="Số lớp"
                  value={formatNumber(stats.classes)}
                />
                <StatCard
                  index={3}
                  icon={<MenuBookOutlined color="primary" />}
                  label="Số môn"
                  value={formatNumber(stats.courses)}
                />
              </Box>
            )}
            <Stack data-testid="teaching-terms" sx={{ mt: 3, gap: 3 }}>
              {terms.map((term, i) => (
                <TermGroup key={term.term} term={term} index={4 + i} />
              ))}
            </Stack>
            {caption && (
              <FlyIn index={4 + terms.length} sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary" data-testid="teaching-source">
                  {caption}
                </Typography>
              </FlyIn>
            )}
          </PageState>
        </PageState>
      </Box>
    </>
  )
}

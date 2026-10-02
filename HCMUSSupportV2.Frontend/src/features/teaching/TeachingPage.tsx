import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import FlyIn from '../../ui/FlyIn'
import PageHeader from '../../ui/PageHeader'
import PageState from '../../ui/PageState'
import { useTeaching, useTeachingYears } from './teachingApi'
import ProgramSection from './ProgramSection'
import { orderedPrograms, pickYear, sourceCaption } from './teachingFormat'
import YearSelect from './YearSelect'

export function Component() {
  const years = useTeachingYears()
  const [wanted, setWanted] = useState<string | null>(null)
  const year = years.data ? pickYear(years.data, wanted) : null
  const teaching = useTeaching(year)
  const programs = teaching.data ? orderedPrograms(teaching.data.programs) : []
  const caption = teaching.data ? sourceCaption(teaching.data) : null

  return (
    <>
      <PageHeader
        title="Giảng dạy"
        subtitle="Khối lượng giảng dạy theo năm học và bậc đào tạo, quy đổi ra giờ chuẩn."
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
            empty={programs.length === 0}
            errorFallback={`Không tải được khối lượng giảng dạy năm học ${year ?? ''}.`.replace(' .', '.')}
            emptyMessage={`Chưa có lớp giảng dạy nào trong năm học ${year ?? ''}.`.replace(' .', '.')}
            onRetry={() => void teaching.refetch()}
          >
            <Stack data-testid="teaching-programs" sx={{ gap: 4 }}>
              {programs.map((program, i) => (
                <ProgramSection key={program.program} program={program} year={year!} index={i * 6} />
              ))}
            </Stack>
            {caption && (
              <FlyIn index={programs.length * 6} sx={{ mt: 2 }}>
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

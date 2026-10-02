import Box from '@mui/material/Box'
import { useMemo } from 'react'
import PageHeader from '../../../ui/PageHeader'
import PageState from '../../../ui/PageState'
import CareerBreadcrumb from '../CareerBreadcrumb'
import { useTrainings } from '../educationApi'
import { groupTrainingsByYear } from '../educationFormat'
import TrainingTable from './TrainingTable'

export function Component() {
  const { data, error, isPending, refetch } = useTrainings()
  const groups = useMemo(() => (data ? groupTrainingsByYear(data) : []), [data])

  return (
    <>
      <CareerBreadcrumb current="Quá trình bồi dưỡng" />
      <PageHeader title="Quá trình bồi dưỡng" subtitle="Các khóa bồi dưỡng, tập huấn theo năm." />
      <Box sx={{ mt: 3 }}>
        <PageState
          error={error}
          loading={isPending}
          empty={!!data && data.length === 0}
          errorFallback="Không tải được quá trình bồi dưỡng."
          emptyMessage="Chưa có thông tin bồi dưỡng."
          onRetry={() => void refetch()}
        >
          <TrainingTable groups={groups} />
        </PageState>
      </Box>
    </>
  )
}

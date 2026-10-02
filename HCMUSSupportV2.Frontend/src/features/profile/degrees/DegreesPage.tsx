import Box from '@mui/material/Box'
import { useMemo } from 'react'
import PageHeader from '../../../ui/PageHeader'
import PageState from '../../../ui/PageState'
import CareerBreadcrumb from '../CareerBreadcrumb'
import { useDegrees } from '../educationApi'
import { sortDegrees } from '../educationFormat'
import DegreeCards from './DegreeCards'

export function Component() {
  const { data, error, isPending, refetch } = useDegrees()
  const sorted = useMemo(() => (data ? sortDegrees(data) : []), [data])

  return (
    <>
      <CareerBreadcrumb current="Quá trình đào tạo" />
      <PageHeader title="Quá trình đào tạo" subtitle="Các văn bằng và chứng chỉ, mới nhất trước." />
      <Box sx={{ mt: 3 }}>
        <PageState
          error={error}
          loading={isPending}
          empty={!!data && data.length === 0}
          errorFallback="Không tải được quá trình đào tạo."
          emptyMessage="Chưa có thông tin đào tạo."
          onRetry={() => void refetch()}
        >
          <DegreeCards items={sorted} />
        </PageState>
      </Box>
    </>
  )
}

import Box from '@mui/material/Box'
import { joinParts } from '../../../lib/format'
import PageHeader from '../../../ui/PageHeader'
import PageState from '../../../ui/PageState'
import { usePositions } from '../careerApi'
import { formatTenure } from '../careerFormat'
import CareerBreadcrumb from '../CareerBreadcrumb'
import PositionTimeline from './PositionTimeline'

export function Component() {
  const { data, error, isPending, refetch } = usePositions()
  const cur = data?.current

  return (
    <>
      <CareerBreadcrumb current="Chức vụ" />
      <PageHeader
        title="Chức vụ"
        subtitle={
          cur
            ? joinParts([cur.title, `đảm nhiệm ${formatTenure(cur.tenureYears, cur.tenureMonths)}`])
            : 'Các chức vụ bạn đã và đang đảm nhiệm.'
        }
      />
      <Box sx={{ mt: 3 }}>
        <PageState
          error={error}
          loading={isPending}
          empty={!!data && data.items.length === 0}
          errorFallback="Không tải được danh sách chức vụ."
          emptyMessage="Chưa có thông tin chức vụ."
          onRetry={() => void refetch()}
        >
          {data && <PositionTimeline items={data.items} index={1} />}
        </PageState>
      </Box>
    </>
  )
}

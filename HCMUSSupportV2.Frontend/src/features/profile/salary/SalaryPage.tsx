import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined'
import EventRepeatOutlined from '@mui/icons-material/EventRepeatOutlined'
import LayersOutlined from '@mui/icons-material/LayersOutlined'
import PercentOutlined from '@mui/icons-material/PercentOutlined'
import TrendingUpOutlined from '@mui/icons-material/TrendingUpOutlined'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { formatDate, formatDecimal } from '../../../lib/format'
import PageHeader from '../../../ui/PageHeader'
import PageState from '../../../ui/PageState'
import StatCard from '../../../ui/StatCard'
import { useSalary } from '../careerApi'
import { formatMonthsToRaise } from '../careerFormat'
import CareerBreadcrumb from '../CareerBreadcrumb'
import SalaryChart from './SalaryChart'
import SalaryTimeline from './SalaryTimeline'

/** A raise within this many months gets the warm emphasis tint. */
const SOON_MONTHS = 3

export function Component() {
  const { data, error, isPending, refetch } = useSalary()
  const empty = !!data && data.current == null && data.history.length === 0
  const cur = data?.current

  return (
    <>
      <CareerBreadcrumb current="Quá trình lương" />
      <PageHeader title="Quá trình lương" subtitle="Ngạch, bậc, hệ số và các quyết định lương của bạn." />
      <Box sx={{ mt: 3 }}>
        <PageState
          error={error}
          loading={isPending}
          empty={empty}
          errorFallback="Không tải được quá trình lương."
          emptyMessage="Chưa có thông tin lương."
          onRetry={() => void refetch()}
        >
          {data && (
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' },
                }}
                data-testid="salary-stats"
              >
                <StatCard
                  index={1}
                  icon={<AccountTreeOutlined color="primary" />}
                  label="Ngạch"
                  value={
                    cur?.gradeName ? (
                      <Typography variant="h6" component="span" sx={{ overflowWrap: 'anywhere', lineHeight: 1.3, display: 'block' }}>
                        {cur.gradeName}
                      </Typography>
                    ) : null
                  }
                  hint={cur?.gradeCode ? `Mã ngạch ${cur.gradeCode}` : undefined}
                />
                <StatCard index={2} icon={<LayersOutlined color="primary" />} label="Bậc" value={cur?.step} />
                <StatCard
                  index={3}
                  icon={<TrendingUpOutlined color="primary" />}
                  label="Hệ số"
                  value={cur?.coefficient == null ? null : formatDecimal(cur.coefficient)}
                  hint={cur?.effectiveFrom ? `Hưởng từ ${formatDate(cur.effectiveFrom)}` : undefined}
                />
                <StatCard
                  index={4}
                  icon={<PercentOutlined color="primary" />}
                  label="Vượt khung"
                  value={cur?.overGradePct == null ? null : `${formatDecimal(cur.overGradePct, 0)}%`}
                />
                <StatCard
                  index={5}
                  icon={<EventRepeatOutlined color="warning" />}
                  label="Kỳ nâng lương"
                  value={cur?.monthsToNextRaise == null ? null : formatMonthsToRaise(cur.monthsToNextRaise)}
                  hint={cur?.nextRaiseOn ? `Dự kiến ${formatDate(cur.nextRaiseOn)}` : undefined}
                  emphasis={cur?.monthsToNextRaise != null && cur.monthsToNextRaise <= SOON_MONTHS}
                />
              </Box>
              <SalaryChart history={data.history} index={6} />
              {data.history.length > 0 && <SalaryTimeline history={data.history} index={7} />}
            </Box>
          )}
        </PageState>
      </Box>
    </>
  )
}

import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import PageHeader from '../../../ui/PageHeader'
import PageState from '../../../ui/PageState'
import { useProfileOverview } from '../api'
import { NO_PROFILE_MESSAGE, isNotFound } from '../profileStates'
import HeroCard from './HeroCard'
import {
  BusinessTripsCard,
  CommendationsCard,
  DegreesCard,
  DetailedCard,
  GeneralCard,
  PositionsCard,
  SalaryCard,
  TrainingCard,
} from './SummaryCards'

/** `/ho-so`: hero plus 8 summary cards in a 3 / 2 / 1 column grid. */
export function Component() {
  const q = useProfileOverview()
  const o = q.data
  const noProfile = isNotFound(q.error) || (o !== undefined && !o.hasProfile)

  return (
    <Stack spacing={4}>
      {(!o || noProfile) && <PageHeader title="Hồ sơ cá nhân" />}
      <PageState
        error={isNotFound(q.error) ? undefined : q.error}
        loading={q.isPending && !q.error}
        empty={noProfile}
        emptyMessage={NO_PROFILE_MESSAGE}
        errorFallback="Không tải được hồ sơ cá nhân."
        onRetry={() => void q.refetch()}
      >
        {o && (
          <>
            <HeroCard hero={o.hero} />
            <Box
              sx={{
                display: 'grid',
                gap: 3,
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
              }}
            >
              <GeneralCard index={1} />
              <DetailedCard index={2} />
              <SalaryCard index={3} salary={o.salary} />
              <CommendationsCard index={4} commendations={o.commendations} />
              <PositionsCard index={5} positions={o.positions} />
              <DegreesCard index={6} degrees={o.degrees} />
              <TrainingCard index={7} count={o.trainingCount} />
              <BusinessTripsCard index={8} count={o.businessTripCount} />
            </Box>
          </>
        )}
      </PageState>
    </Stack>
  )
}

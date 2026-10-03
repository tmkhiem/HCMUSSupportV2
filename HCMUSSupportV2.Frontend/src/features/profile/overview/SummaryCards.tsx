import Typography from '@mui/material/Typography'
import { formatDate, formatDecimal, joinParts } from '../../../lib/format'
import { formatPartialDate } from '../../../lib/partialDate'
import { useDetailedProfile, useGeneralProfile } from '../api'
import type { ProfileOverview } from '../api'
import { isNotFound } from '../profileStates'
import SummaryCardFrame, { CardEmpty, CardFact, CardFigure } from './SummaryCardFrame'
import PngIcon from '../../../ui/PngIcon'

/** The eight cards of `/profile`, one component each. Indices continue after the hero (0). */

type Props = { index: number }

export function GeneralCard({ index }: Props) {
  const q = useGeneralProfile()
  const g = q.data
  return (
    <SummaryCardFrame title="Thông tin chung" icon={<PngIcon name="person" size={28} />} to="/profile/general" index={index}>
      {g ? (
        <>
          <CardFact label="Ngày sinh" value={formatPartialDate(g.dateOfBirth)} />
          <CardFact label="Giới tính" value={g.gender ?? '—'} />
          <CardFact label="Dân tộc" value={g.ethnicity ?? '—'} />
          <CardFact label="Tôn giáo" value={g.religion ?? '—'} />
        </>
      ) : q.isPending ? (
        <CardEmpty>Đang tải…</CardEmpty>
      ) : isNotFound(q.error) ? (
        <CardEmpty />
      ) : (
        <CardEmpty>Không tải được thông tin chung.</CardEmpty>
      )}
    </SummaryCardFrame>
  )
}

export function DetailedCard({ index }: Props) {
  const q = useDetailedProfile()
  const d = q.data
  return (
    <SummaryCardFrame title="Thông tin chi tiết" icon={<PngIcon name="document-alt" size={28} />} to="/profile/detailed" index={index}>
      {d ? (
        <>
          <CardFact label="Đơn vị" value={d.unit ?? '—'} />
          <CardFact label="Học hàm" value={d.academicRank ?? '—'} />
          <CardFact label="Học vị" value={d.degree ?? '—'} />
          <CardFact label="Đảng viên" value={d.party.isMember ? 'Có' : 'Không'} />
        </>
      ) : q.isPending ? (
        <CardEmpty>Đang tải…</CardEmpty>
      ) : isNotFound(q.error) ? (
        <CardEmpty />
      ) : (
        <CardEmpty>Không tải được thông tin chi tiết.</CardEmpty>
      )}
    </SummaryCardFrame>
  )
}

export function SalaryCard({ index, salary }: Props & { salary: ProfileOverview['salary'] }) {
  const has = salary.step != null || salary.coefficient != null || salary.gradeName
  return (
    <SummaryCardFrame title="Quá trình lương" icon={<PngIcon name="money-salary" size={28} />} to="/profile/salary" index={index}>
      {has ? (
        <>
          <CardFigure
            value={joinParts([salary.step != null && `Bậc ${salary.step}`, salary.coefficient != null && formatDecimal(salary.coefficient)])}
            caption={salary.gradeName ?? undefined}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Nâng lương kế tiếp: <strong>{formatDate(salary.nextRaiseOn)}</strong>
          </Typography>
        </>
      ) : (
        <CardEmpty />
      )}
    </SummaryCardFrame>
  )
}

export function CommendationsCard({ index, commendations }: Props & { commendations: ProfileOverview['commendations'] }) {
  const none = commendations.awards === 0 && commendations.titles === 0
  return (
    <SummaryCardFrame title="Khen thưởng" icon={<PngIcon name="cup" size={28} />} to="/profile/commendations" index={index}>
      {none ? (
        <CardEmpty />
      ) : (
        <>
          <CardFact label="Khen thưởng" value={commendations.awards} />
          <CardFact label="Danh hiệu" value={commendations.titles} />
        </>
      )}
    </SummaryCardFrame>
  )
}

export function PositionsCard({ index, positions }: Props & { positions: ProfileOverview['positions'] }) {
  return (
    <SummaryCardFrame title="Chức vụ" icon={<PngIcon name="briefcase" size={28} />} to="/profile/positions" index={index}>
      {positions.currentTitle || positions.count > 0 ? (
        <CardFigure
          value={<Typography variant="h6" component="span">{positions.currentTitle ?? '—'}</Typography>}
          caption={`${positions.count} chức vụ đã giữ`}
        />
      ) : (
        <CardEmpty />
      )}
    </SummaryCardFrame>
  )
}

export function DegreesCard({ index, degrees }: Props & { degrees: ProfileOverview['degrees'] }) {
  return (
    <SummaryCardFrame title="Quá trình đào tạo" icon={<PngIcon name="graduation-hat" size={28} />} to="/profile/degrees" index={index}>
      {degrees.count > 0 ? (
        <CardFigure
          value={<Typography variant="h6" component="span">{joinParts([degrees.latestDegreeType, degrees.latestMajor])}</Typography>}
          caption={`${degrees.count} văn bằng`}
        />
      ) : (
        <CardEmpty />
      )}
    </SummaryCardFrame>
  )
}

export function TrainingCard({ index, count }: Props & { count: number }) {
  return (
    <SummaryCardFrame title="Quá trình bồi dưỡng" icon={<PngIcon name="book-open" size={28} />} to="/profile/training" index={index}>
      {count > 0 ? <CardFigure value={count} caption="khóa bồi dưỡng" /> : <CardEmpty />}
    </SummaryCardFrame>
  )
}

export function BusinessTripsCard({ index, count }: Props & { count: number }) {
  return (
    <SummaryCardFrame title="Đi công tác" icon={<PngIcon name="airplane-departure" size={28} />} to="/profile/business-trips" index={index}>
      {count > 0 ? <CardFigure value={count} caption="chuyến công tác" /> : <CardEmpty />}
    </SummaryCardFrame>
  )
}

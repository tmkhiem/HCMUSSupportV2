import EmojiEventsOutlined from '@mui/icons-material/EmojiEventsOutlined'
import FlightTakeoffOutlined from '@mui/icons-material/FlightTakeoffOutlined'
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined'
import PersonOutlineOutlined from '@mui/icons-material/PersonOutlineOutlined'
import SchoolOutlined from '@mui/icons-material/SchoolOutlined'
import TextSnippetOutlined from '@mui/icons-material/TextSnippetOutlined'
import WorkOutlineOutlined from '@mui/icons-material/WorkOutlineOutlined'
import Typography from '@mui/material/Typography'
import { formatDate, formatDecimal, joinParts } from '../../../lib/format'
import { formatPartialDate } from '../../../lib/partialDate'
import { useDetailedProfile, useGeneralProfile } from '../api'
import type { ProfileOverview } from '../api'
import { isNotFound } from '../ProfileFields'
import SummaryCardFrame, { CardEmpty, CardFact, CardFigure } from './SummaryCardFrame'

/** The eight cards of `/ho-so`, one component each. Indices continue after the hero (0). */

type Props = { index: number }

export function GeneralCard({ index }: Props) {
  const q = useGeneralProfile()
  const g = q.data
  return (
    <SummaryCardFrame title="Thông tin chung" icon={<PersonOutlineOutlined color="primary" />} to="/ho-so/thong-tin-chung" index={index}>
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
    <SummaryCardFrame title="Thông tin chi tiết" icon={<TextSnippetOutlined color="primary" />} to="/ho-so/thong-tin-chi-tiet" index={index}>
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
    <SummaryCardFrame title="Quá trình lương" icon={<PaymentsOutlined color="primary" />} to="/ho-so/luong" index={index}>
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
    <SummaryCardFrame title="Khen thưởng" icon={<EmojiEventsOutlined color="primary" />} to="/ho-so/khen-thuong" index={index}>
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
    <SummaryCardFrame title="Chức vụ" icon={<WorkOutlineOutlined color="primary" />} to="/ho-so/chuc-vu" index={index}>
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
    <SummaryCardFrame title="Quá trình đào tạo" icon={<SchoolOutlined color="primary" />} to="/ho-so/dao-tao" index={index}>
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
    <SummaryCardFrame title="Quá trình bồi dưỡng" icon={<MenuBookOutlined color="primary" />} to="/ho-so/boi-duong" index={index}>
      {count > 0 ? <CardFigure value={count} caption="khóa bồi dưỡng" /> : <CardEmpty />}
    </SummaryCardFrame>
  )
}

export function BusinessTripsCard({ index, count }: Props & { count: number }) {
  return (
    <SummaryCardFrame title="Đi công tác" icon={<FlightTakeoffOutlined color="primary" />} to="/ho-so/cong-tac" index={index}>
      {count > 0 ? <CardFigure value={count} caption="chuyến công tác" /> : <CardEmpty />}
    </SummaryCardFrame>
  )
}

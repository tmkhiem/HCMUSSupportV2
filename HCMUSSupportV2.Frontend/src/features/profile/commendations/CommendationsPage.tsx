import MilitaryTechOutlined from '@mui/icons-material/MilitaryTechOutlined'
import Box from '@mui/material/Box'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import PageHeader from '../../../ui/PageHeader'
import PageState from '../../../ui/PageState'
import StatCard from '../../../ui/StatCard'
import { useCommendations } from '../careerApi'
import CareerBreadcrumb from '../CareerBreadcrumb'
import CommendationGroups from './CommendationGroups'
import PngIcon from '../../../ui/PngIcon'

type TabKey = 'award' | 'title'

export function Component() {
  const { data, error, isPending, refetch } = useCommendations()
  const [tab, setTab] = useState<TabKey>('award')
  const empty = !!data && data.awardCount === 0 && data.titleCount === 0 && data.awards.length === 0 && data.titles.length === 0
  const groups = data ? (tab === 'award' ? data.awards : data.titles) : []

  return (
    <>
      <CareerBreadcrumb current="Khen thưởng" />
      <PageHeader title="Khen thưởng" subtitle="Hình thức khen thưởng và danh hiệu thi đua theo năm học." />
      <Box sx={{ mt: 3 }}>
        <PageState
          error={error}
          loading={isPending}
          empty={empty}
          errorFallback="Không tải được danh sách khen thưởng."
          emptyMessage="Chưa có thông tin khen thưởng."
          onRetry={() => void refetch()}
        >
          {data && (
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                <StatCard
                  index={1}
                  icon={<PngIcon name="cup" size={28} />}
                  label="Khen thưởng"
                  value={data.awardCount}
                  hint="Số lần được khen thưởng"
                />
                <StatCard
                  index={2}
                  icon={<MilitaryTechOutlined color="primary" />}
                  label="Danh hiệu"
                  value={data.titleCount}
                  hint="Số danh hiệu thi đua"
                />
              </Box>
              <Box>
                <Tabs
                  value={tab}
                  onChange={(_, v: TabKey) => setTab(v)}
                  variant="scrollable"
                  scrollButtons="auto"
                  allowScrollButtonsMobile
                  aria-label="Loại khen thưởng"
                  sx={{ mb: 3 }}
                >
                  <Tab value="award" label={`Khen thưởng (${data.awardCount})`} id="tab-award" aria-controls="panel-commendations" />
                  <Tab value="title" label={`Danh hiệu (${data.titleCount})`} id="tab-title" aria-controls="panel-commendations" />
                </Tabs>
                <Box role="tabpanel" id="panel-commendations" aria-labelledby={`tab-${tab}`}>
                  {groups.length === 0 ? (
                    <Typography color="text.secondary">
                      {tab === 'award' ? 'Chưa có khen thưởng nào.' : 'Chưa có danh hiệu nào.'}
                    </Typography>
                  ) : (
                    <CommendationGroups key={tab} groups={groups} kind={tab} index={3} />
                  )}
                </Box>
              </Box>
            </Box>
          )}
        </PageState>
      </Box>
    </>
  )
}

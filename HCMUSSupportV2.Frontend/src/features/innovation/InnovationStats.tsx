import Box from '@mui/material/Box'
import { formatNumber } from '../../lib/format'
import StatCard from '../../ui/StatCard'
import type { InnovationStats as Stats } from './innovationApi'
import { typeBreakdown } from './innovationFormat'
import PngIcon from '../../ui/PngIcon'

/** The total plus one card per type, on a 1 / 2 / 3 column grid (xs / sm / md). */
export default function InnovationStats({ stats, index }: { stats: Stats; index: number }) {
  const types = typeBreakdown(stats)
  return (
    <Box
      data-testid="innovation-stats"
      sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' } }}
    >
      <StatCard
        index={index}
        icon={<PngIcon name="light-bulb" size={28} />}
        label="Tổng số sáng kiến"
        value={formatNumber(stats.count)}
        hint={stats.count === 1 ? '1 sáng kiến được công nhận' : `${stats.count} sáng kiến được công nhận`}
      />
      {types.map((t, i) => (
        <StatCard
          key={t.label}
          index={index + 1 + i}
          icon={<PngIcon name="category" size={28} />}
          label={t.label}
          value={formatNumber(t.count)}
          hint="sáng kiến"
        />
      ))}
    </Box>
  )
}

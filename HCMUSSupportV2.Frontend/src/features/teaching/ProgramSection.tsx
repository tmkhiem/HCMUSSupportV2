import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined'
import ClassOutlined from '@mui/icons-material/ClassOutlined'
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { formatNumber } from '../../lib/format'
import StatCard from '../../ui/StatCard'
import type { TeachingProgram } from './teachingApi'
import { formatHours, moduleLabel, orderedModules, orderedTerms, programLabel, termLabel } from './teachingFormat'
import TeachingGroup from './TeachingGroup'

/**
 * One training program: its heading, its own three stat cards (giờ chuẩn, số lớp, số môn) and its groups. Đại học groups
 * by học kỳ; Cao học and Tiến sĩ have no học kỳ and group by học phần / chuyên đề ("Chưa rõ học phần" when unknown).
 * `index` is the fly-in position of the first card.
 */
export default function ProgramSection({ program, year, index }: { program: TeachingProgram; year: string; index: number }) {
  const title = programLabel(program.program)
  const terms = program.program === 'dai_hoc' ? orderedTerms(program.terms) : []
  const modules = program.program === 'dai_hoc' ? [] : orderedModules(program.modules)
  const { stats } = program
  return (
    <Box component="section" aria-label={title} data-testid={`program-${program.program}`}>
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
        {title}
      </Typography>
      <Box
        data-testid={`program-${program.program}-stats`}
        sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}
      >
        <StatCard
          index={index}
          icon={<AccessTimeOutlined color="primary" />}
          label="Giờ quy đổi"
          value={formatHours(stats.totalStandardHours)}
          hint={`Năm học ${year}`}
        />
        <StatCard index={index + 1} icon={<ClassOutlined color="primary" />} label="Số lớp" value={formatNumber(stats.classes)} />
        <StatCard index={index + 2} icon={<MenuBookOutlined color="primary" />} label="Số môn" value={formatNumber(stats.courses)} />
      </Box>
      <Stack sx={{ mt: 2.5, gap: 3 }}>
        {terms.map((term, i) => (
          <TeachingGroup
            key={term.term}
            title={termLabel(term.term)}
            items={term.items}
            index={index + 3 + i}
            testId={`term-${term.term}`}
          />
        ))}
        {modules.map((group, i) => (
          <TeachingGroup
            key={group.module ?? ''}
            title={moduleLabel(group.module)}
            items={group.items}
            index={index + 3 + i}
            testId={`module-${program.program}-${i}`}
          />
        ))}
      </Stack>
    </Box>
  )
}

import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { isBlank, orDash } from '../../lib/format'
import { flyInSx } from '../../ui/flyInSx'
import type { TeachingEntry } from './teachingApi'
import { activityLabel, formatHours, groupSummary } from './teachingFormat'

export interface TeachingGroupProps {
  /** Divider title: "Học kỳ 1", "Học phần 3", "Chưa rõ học phần". */
  title: string
  items: TeachingEntry[]
  index: number
  testId: string
}

/** Hệ and activity as small chips (shown under the course name below `md`, where their columns are hidden). */
function Chips({ row }: { row: TeachingEntry }) {
  if (isBlank(row.track) && isBlank(row.activity)) return null
  return (
    <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', mt: 0.5, display: { xs: 'flex', md: 'none' } }}>
      {!isBlank(row.track) && <Chip size="small" variant="outlined" label={`Hệ ${row.track}`} />}
      {!isBlank(row.activity) && <Chip size="small" label={activityLabel(row.activity)} />}
    </Stack>
  )
}

/**
 * One group of teaching lines (a học kỳ of Đại học, or a học phần / chuyên đề of Cao học and Tiến sĩ): a divider that docks
 * at the top of the scroll container and is pushed off by the next group's divider, then its table. Plain
 * `position: sticky` on a block divider inside its own `<section>` (sticky does not work on table cells), so the browser
 * does the push-off and nothing flickers.
 */
export default function TeachingGroup({ title, items, index, testId }: TeachingGroupProps) {
  return (
    <Box component="section" aria-label={title} data-testid={testId} sx={flyInSx(index)}>
      <Stack
        direction="row"
        data-sticky-divider
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          columnGap: 2,
          alignItems: 'baseline',
          flexWrap: 'wrap',
          px: 2,
          py: 1.25,
          bgcolor: 'grey.100',
          borderRadius: 1,
          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        }}
      >
        <Typography variant="body2" component="h3" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {groupSummary(items)}
        </Typography>
      </Stack>
      <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
        <Table size="small" aria-label={title}>
          <TableHead>
            <TableRow>
              <TableCell>Môn học</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Lớp</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Hệ</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Hoạt động</TableCell>
              <TableCell align="right">Số tiết</TableCell>
              <TableCell align="right">Giờ quy đổi</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                    {row.courseName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {orDash(row.courseCode)}
                    {/* Below sm the Lớp column is hidden, so the class code moves under the name. */}
                    <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                      {row.classCode ? ` · Lớp ${row.classCode}` : ''}
                    </Box>
                  </Typography>
                  <Chips row={row} />
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{orDash(row.classCode)}</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                  {isBlank(row.track) ? orDash(null) : <Chip size="small" variant="outlined" label={row.track} />}
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                  {isBlank(row.activity) ? orDash(null) : <Chip size="small" label={activityLabel(row.activity)} />}
                </TableCell>
                <TableCell align="right">{formatHours(row.periods)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  {formatHours(row.standardHours)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

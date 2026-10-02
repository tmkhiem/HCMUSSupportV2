import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { orDash } from '../../lib/format'
import { flyInSx } from '../../ui/flyInSx'
import type { TeachingTerm } from './teachingApi'
import { formatHours, termLabel, termSummary } from './teachingFormat'

/**
 * One học kỳ: a divider that docks at the top of the scroll container and is pushed off by the next học kỳ's divider,
 * then its table. Plain `position: sticky` on a block divider inside its own `<section>` (sticky does not work on table
 * cells), so the browser does the push-off and nothing flickers.
 */
export default function TermGroup({ term, index }: { term: TeachingTerm; index: number }) {
  const title = termLabel(term.term)
  return (
    <Box component="section" aria-label={title} data-testid={`term-${term.term}`} sx={flyInSx(index)}>
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
        <Typography variant="body2" component="h2" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {termSummary(term)}
        </Typography>
      </Stack>
      <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
        <Table size="small" aria-label={title}>
          <TableHead>
            <TableRow>
              <TableCell>Môn học</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Lớp</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Bậc</TableCell>
              <TableCell align="right">Số tiết</TableCell>
              <TableCell align="right">Giờ quy đổi</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {term.items.map((row) => (
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
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{orDash(row.classCode)}</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{orDash(row.level)}</TableCell>
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

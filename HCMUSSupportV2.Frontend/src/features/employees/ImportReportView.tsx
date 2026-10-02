import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import type { ReactNode } from 'react'
import { SectionLabel } from '../../ui'
import { reasonLabel } from './employeesFormat'
import type { ImportReport } from './employeesTypes'

interface CountProps {
  label: string
  value: number
  tone?: 'success' | 'warning' | 'error' | 'info'
  testId: string
}

function Count({ label, value, tone, testId }: CountProps) {
  return (
    <Box
      data-testid={testId}
      sx={{
        p: 1.5,
        borderRadius: 1,
        border: 1,
        borderColor: (t) => (value > 0 && tone ? alpha(t.palette[tone].main, 0.4) : t.palette.divider),
        bgcolor: (t) => (value > 0 && tone ? alpha(t.palette[tone].main, 0.08) : 'transparent'),
      }}
    >
      <SectionLabel noWrap>{label}</SectionLabel>
      <Typography variant="h5" component="div">
        {value}
      </Typography>
    </Box>
  )
}

interface SectionProps {
  title: string
  count: number
  tone: 'success' | 'warning' | 'error' | 'info'
  defaultOpen?: boolean
  testId: string
  children: ReactNode
}

function Section({ title, count, tone, defaultOpen, testId, children }: SectionProps) {
  if (count === 0) return null
  return (
    <Accordion disableGutters defaultExpanded={defaultOpen} variant="outlined" data-testid={testId} sx={{ '&::before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Chip size="small" color={tone} label={count} />
          <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0 }}>
        <TableContainer sx={{ maxHeight: 320 }}>{children}</TableContainer>
      </AccordionDetails>
    </Accordion>
  )
}

const cellSx = { overflowWrap: 'anywhere', verticalAlign: 'top' } as const

/**
 * The import report (dry run or applied): counts, then one collapsible table per kind of finding. Blocking findings
 * (conflicts, unknown MSCB, invalid emails) are skipped on apply; warnings do not block.
 */
export default function ImportReportView({ report }: { report: ImportReport }) {
  return (
    <Stack spacing={2} data-testid="import-report">
      <Typography variant="body2" color="text.secondary">
        {report.rows} dòng dữ liệu · {report.employees} cán bộ
        {report.skippedEmptyRows > 0 ? ` · ${report.skippedEmptyRows} dòng thiếu MSCB hoặc email bị bỏ qua` : ''}
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1 }}>
        <Count testId="count-added" label="Thêm mới" value={report.addedCount} tone="success" />
        <Count testId="count-unchanged" label="Không đổi" value={report.unchangedCount} />
        <Count testId="count-removed" label="Gỡ bỏ" value={report.removedCount} tone="warning" />
        <Count testId="count-conflicts" label="Xung đột" value={report.conflictCount} tone="error" />
        <Count testId="count-unknown" label="MSCB không có" value={report.unknownCount} tone="error" />
        <Count testId="count-invalid" label="Không hợp lệ" value={report.invalidCount} tone="error" />
      </Box>

      {report.truncated && (
        <Alert severity="info">Báo cáo chỉ liệt kê tối đa 1.000 dòng cho mỗi nhóm; các con số ở trên là đầy đủ.</Alert>
      )}

      <Section title="Email sẽ được thêm" count={report.added.length} tone="success" testId="section-added" defaultOpen={report.conflictCount + report.unknownCount + report.invalidCount === 0}>
        <Table size="small" stickyHeader aria-label="Email thêm mới">
          <TableHead>
            <TableRow>
              <TableCell>Dòng</TableCell>
              <TableCell>MSCB</TableCell>
              <TableCell>Họ tên</TableCell>
              <TableCell>Email</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {report.added.map((a) => (
              <TableRow key={`${a.code}-${a.email}`}>
                <TableCell>{a.row}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{a.code}</TableCell>
                <TableCell sx={cellSx}>{a.fullName ?? '—'}</TableCell>
                <TableCell sx={cellSx}>
                  {a.email} {a.isPrimary && <Chip size="small" color="primary" label="Chính" sx={{ ml: 0.5 }} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Email sẽ bị gỡ" count={report.removed.length} tone="warning" testId="section-removed" defaultOpen>
        <Table size="small" stickyHeader aria-label="Email gỡ bỏ">
          <TableHead>
            <TableRow>
              <TableCell>Dòng</TableCell>
              <TableCell>MSCB</TableCell>
              <TableCell>Họ tên</TableCell>
              <TableCell>Email</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {report.removed.map((a) => (
              <TableRow key={`${a.code}-${a.email}`}>
                <TableCell>{a.row}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{a.code}</TableCell>
                <TableCell sx={cellSx}>{a.fullName ?? '—'}</TableCell>
                <TableCell sx={cellSx}>{a.email}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Xung đột: email đã thuộc MSCB khác (bị bỏ qua)" count={report.conflicts.length} tone="error" testId="section-conflicts" defaultOpen>
        <Table size="small" stickyHeader aria-label="Email xung đột">
          <TableHead>
            <TableRow>
              <TableCell>Dòng</TableCell>
              <TableCell>MSCB</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Lý do</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {report.conflicts.map((c) => (
              <TableRow key={`${c.row}-${c.email}`}>
                <TableCell>{c.row}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{c.code}</TableCell>
                <TableCell sx={cellSx}>{c.email}</TableCell>
                <TableCell sx={cellSx}>
                  {reasonLabel(c.reason)}
                  {c.ownerCode ? ` (${c.ownerCode}${c.ownerName ? ` · ${c.ownerName}` : ''})` : ''}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="MSCB không có trong danh bạ (bị bỏ qua)" count={report.unknown.length} tone="error" testId="section-unknown" defaultOpen>
        <Table size="small" stickyHeader aria-label="MSCB không có">
          <TableHead>
            <TableRow>
              <TableCell>Dòng</TableCell>
              <TableCell>MSCB</TableCell>
              <TableCell>Email</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {report.unknown.map((u) => (
              <TableRow key={`${u.row}-${u.code}`}>
                <TableCell>{u.row}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{u.code}</TableCell>
                <TableCell sx={cellSx}>{u.emails.join(', ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Email không hợp lệ (bị bỏ qua)" count={report.invalid.length} tone="error" testId="section-invalid" defaultOpen>
        <Table size="small" stickyHeader aria-label="Email không hợp lệ">
          <TableHead>
            <TableRow>
              <TableCell>Dòng</TableCell>
              <TableCell>MSCB</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Lý do</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {report.invalid.map((i, n) => (
              <TableRow key={`${i.row}-${i.email}-${n}`}>
                <TableCell>{i.row}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{i.code}</TableCell>
                <TableCell sx={cellSx}>{i.email ?? '—'}</TableCell>
                <TableCell sx={cellSx}>{reasonLabel(i.reason)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Cảnh báo (không chặn việc áp dụng)" count={report.warnings.length} tone="info" testId="section-warnings">
        <Table size="small" stickyHeader aria-label="Cảnh báo">
          <TableHead>
            <TableRow>
              <TableCell>Dòng</TableCell>
              <TableCell>MSCB</TableCell>
              <TableCell>Nội dung</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {report.warnings.map((w, n) => (
              <TableRow key={`${w.row}-${w.reason}-${n}`}>
                <TableCell>{w.row}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{w.code}</TableCell>
                <TableCell sx={cellSx}>{w.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </Stack>
  )
}

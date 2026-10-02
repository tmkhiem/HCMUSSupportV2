import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import { alpha, useTheme } from '@mui/material/styles'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import Paper from '@mui/material/Paper'
import { AcrylicCard } from '../../ui'
import { emailSummary, statusLabel } from './employeesFormat'
import type { ManagedEmployee } from './employeesTypes'

export interface EmployeeListProps {
  items: ManagedEmployee[]
  selectedCode: string | null
  onOpen: (code: string) => void
}

function StatusChip({ status }: { status: string }) {
  if (status === 'active') return null
  return <Chip size="small" variant="outlined" color={status === 'retired' ? 'default' : 'warning'} label={statusLabel(status)} />
}

/** The email cell: the primary address, `+N` for the rest, or a muted "Chưa có email". */
function EmailCell({ employee }: { employee: ManagedEmployee }) {
  const { first, more } = emailSummary(employee)
  if (!first) {
    return <Chip size="small" variant="outlined" color="warning" label="Chưa có email" />
  }
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
        {first}
      </Typography>
      {more > 0 && <Chip size="small" label={`+${more}`} aria-label={`và ${more} email khác`} />}
      {employee.hasHrmConflict && (
        <Chip size="small" color="warning" variant="outlined" icon={<WarningAmberIcon />} label="Cần kiểm tra" />
      )}
    </Stack>
  )
}

/**
 * The directory: a table from `md` up, stacked cards below. A row opens the email drawer (`onOpen`); the whole row is
 * the target, with Enter and Space on the focused row.
 */
export default function EmployeeList({ items, selectedCode, onOpen }: EmployeeListProps) {
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true })

  if (!isDesktop) {
    return (
      <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label="Danh sách nhân sự">
        {items.map((e) => (
          <li key={e.code}>
            <AcrylicCard
              onClick={() => onOpen(e.code)}
              aria-label={`${e.fullName}, ${e.code}`}
              data-testid="employee-row"
              data-code={e.code}
              sx={{ p: 1.5, bgcolor: e.code === selectedCode ? alpha(theme.palette.primary.main, 0.1) : undefined }}
            >
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{e.fullName}</Typography>
                <Chip size="small" label={e.code} sx={{ fontWeight: 700, flexShrink: 0 }} />
              </Stack>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.75 }}>
                {[e.unit, e.positionTitle].filter(Boolean).join(' · ') || '—'}
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <EmailCell employee={e} />
                <StatusChip status={e.status} />
              </Stack>
            </AcrylicCard>
          </li>
        ))}
      </Stack>
    )
  }

  return (
    <TableContainer component={Paper} variant="acrylic" sx={{ overflow: 'auto' }}>
      <Table size="small" aria-label="Danh sách nhân sự">
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 110 }}>MSCB</TableCell>
            <TableCell>Họ tên</TableCell>
            <TableCell>Đơn vị</TableCell>
            <TableCell>Email</TableCell>
            <TableCell sx={{ width: 150 }}>Trạng thái</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((e) => (
            <TableRow
              key={e.code}
              hover
              selected={e.code === selectedCode}
              tabIndex={0}
              role="button"
              aria-label={`Quản lý email của ${e.fullName}, ${e.code}`}
              data-testid="employee-row"
              data-code={e.code}
              onClick={() => onOpen(e.code)}
              onKeyDown={(ev) => {
                if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) {
                  ev.preventDefault()
                  onOpen(e.code)
                }
              }}
              sx={{ cursor: 'pointer', '& td': { verticalAlign: 'top', py: 1.25 } }}
            >
              <TableCell sx={{ fontWeight: 700 }}>{e.code}</TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {e.fullName}
                </Typography>
                {e.positionTitle && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {e.positionTitle}
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                {e.unit ?? (
                  <Box component="span" sx={{ color: 'text.disabled' }}>
                    —
                  </Box>
                )}
              </TableCell>
              <TableCell>
                <EmailCell employee={e} />
              </TableCell>
              <TableCell>
                <StatusChip status={e.status} />
                {e.status === 'active' && (
                  <Typography variant="body2" color="text.secondary">
                    {statusLabel('active')}
                  </Typography>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

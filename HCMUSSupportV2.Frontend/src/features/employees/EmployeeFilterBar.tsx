import ClearIcon from '@mui/icons-material/Clear'
import MailOutlinedIcon from '@mui/icons-material/MailOutlined'
import SearchIcon from '@mui/icons-material/Search'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import { alpha, useTheme } from '@mui/material/styles'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import Box from '@mui/material/Box'
import { useEffect, useRef, useState } from 'react'
import { STATUS_LABEL } from './employeesFormat'
import type { EmployeeFilters, EmployeeStatus } from './employeesTypes'

export const SEARCH_DEBOUNCE_MS = 400

export interface EmployeeFilterBarProps {
  filters: EmployeeFilters
  /** `replace` is true for keystroke-driven changes (search), so they do not fill the history. */
  onChange: (next: EmployeeFilters, replace?: boolean) => void
}

/**
 * Acrylic filter bar of the directory: debounced search (MSCB, name without accents, or part of an email), status,
 * "Chưa có email" and "Cần kiểm tra" (an email that conflicts with HRM). The URL is the state of record.
 */
export default function EmployeeFilterBar({ filters, onChange }: EmployeeFilterBarProps) {
  const theme = useTheme()

  // Typing is local; the URL gets the value 400 ms after the last keystroke.
  const [draft, setDraft] = useState(filters.q)
  const committed = useRef(filters.q)
  useEffect(() => {
    // Back/forward or "Xóa bộ lọc" changed the URL: adopt it (but not our own debounced write).
    if (filters.q !== committed.current) {
      committed.current = filters.q
      setDraft(filters.q)
    }
  }, [filters.q])
  const latest = useRef({ filters, onChange })
  useEffect(() => {
    latest.current = { filters, onChange }
  })
  useEffect(() => {
    const value = draft.trim()
    if (value === committed.current) return
    const timer = setTimeout(() => {
      committed.current = value
      latest.current.onChange({ ...latest.current.filters, q: value }, true)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft])

  const commitNow = (q: string) => {
    committed.current = q
    onChange({ ...filters, q }, true)
  }

  return (
    <Paper
      variant="acrylic"
      component="section"
      aria-label="Bộ lọc nhân sự"
      sx={{
        p: { xs: 1.5, md: 2 },
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        borderColor: alpha(theme.palette.primary.main, 0.2),
      }}
    >
      <TextField
        fullWidth
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commitNow(draft.trim())}
        placeholder="Tìm theo MSCB, họ tên hoặc email…"
        slotProps={{
          htmlInput: { 'aria-label': 'Tìm kiếm nhân sự', enterKeyHint: 'search' },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ opacity: 0.5 }} />
              </InputAdornment>
            ),
            endAdornment: draft ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  aria-label="Xóa nội dung tìm kiếm"
                  onClick={() => {
                    setDraft('')
                    commitNow('')
                  }}
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        <TextField
          select
          size="small"
          label="Trạng thái"
          value={filters.status}
          onChange={(e) => onChange({ ...filters, status: e.target.value as '' | EmployeeStatus })}
          sx={{ minWidth: 180, flex: { xs: '1 1 100%', sm: '0 0 auto' }, bgcolor: 'common.white', borderRadius: 1 }}
        >
          <MenuItem value="">Tất cả trạng thái</MenuItem>
          {(Object.keys(STATUS_LABEL) as EmployeeStatus[]).map((s) => (
            <MenuItem key={s} value={s}>
              {STATUS_LABEL[s]}
            </MenuItem>
          ))}
        </TextField>
        <ToggleButton
          value="noEmail"
          size="small"
          selected={filters.noEmail}
          onChange={() => onChange({ ...filters, noEmail: !filters.noEmail })}
          aria-label="Chỉ hiện người chưa có email"
          sx={{ height: 40, px: 1.5, gap: 0.75, whiteSpace: 'nowrap' }}
        >
          <MailOutlinedIcon fontSize="small" />
          Chưa có email
        </ToggleButton>
        <ToggleButton
          value="flagged"
          size="small"
          selected={filters.flagged}
          onChange={() => onChange({ ...filters, flagged: !filters.flagged })}
          aria-label="Chỉ hiện email trùng với HRM"
          sx={{ height: 40, px: 1.5, gap: 0.75, whiteSpace: 'nowrap' }}
        >
          <WarningAmberIcon fontSize="small" />
          Cần kiểm tra
        </ToggleButton>
      </Box>
    </Paper>
  )
}

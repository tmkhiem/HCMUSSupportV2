import ClearIcon from '@mui/icons-material/Clear'
import FilterListOutlined from '@mui/icons-material/FilterListOutlined'
import MarkEmailUnreadOutlined from '@mui/icons-material/MarkEmailUnreadOutlined'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import { useTheme } from '@mui/material/styles'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import useMediaQuery from '@mui/material/useMediaQuery'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { viVN } from '@mui/x-date-pickers/locales'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import 'dayjs/locale/vi'
import { useEffect, useRef, useState } from 'react'
import { toggleTag } from './inboxFilters'
import type { InboxFilters } from './inboxFilters'
import type { InboxTag } from './inboxTypes'
import PngIcon from '../../../ui/PngIcon'

export const SEARCH_DEBOUNCE_MS = 400

const DAY_FORMAT = 'YYYY-MM-DD'
const MIN_YEAR = 1990
const MAX_YEAR = 2100
const toDayjs = (day: string): Dayjs | null => (day ? dayjs(day, DAY_FORMAT) : null)

const localeText = viVN.components.MuiLocalizationProvider.defaultProps.localeText

export interface InboxFilterBarProps {
  filters: InboxFilters
  tags: InboxTag[]
  activeCount: number
  /** `replace` is true for keystroke-driven changes (search), so they do not fill the history. */
  onChange: (next: InboxFilters, replace?: boolean) => void
}

/**
 * Sticky acrylic filter bar: debounced search, tag chips (multi-select), Từ ngày / Đến ngày and "Chưa đọc".
 * The state of record is the URL (`inboxFilters.ts`); this component only edits it. Below `md` the tags and dates
 * fold behind a "Bộ lọc" button.
 */
export default function InboxFilterBar({ filters, tags, activeCount, onChange }: InboxFilterBarProps) {
  const theme = useTheme()
  // noSsr: read the real viewport on the first render, so the tags and dates do not mount, collapse and re-mount.
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true })
  const [expanded, setExpanded] = useState(false)
  const showMore = isDesktop || expanded

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
  // The timer must see the filters and callback of the moment it fires, not those of the keystroke.
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
      aria-label="Bộ lọc thông báo"
      sx={{
        p: { xs: 1.5, md: 2.5 },
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 1.25, md: 2 },
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <TextField
          fullWidth
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commitNow(draft.trim())}
          placeholder="Tìm thông báo…"
          slotProps={{
            htmlInput: { 'aria-label': 'Tìm kiếm thông báo', enterKeyHint: 'search' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <PngIcon name="search" size={20} />
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
        <ToggleButton
          value="unread"
          size="small"
          selected={filters.unread}
          onChange={() => onChange({ ...filters, unread: !filters.unread })}
          aria-label="Chỉ hiện thông báo chưa đọc"
          sx={{ flexShrink: 0, height: 40, px: 1.5, gap: 0.75, whiteSpace: 'nowrap' }}
        >
          <MarkEmailUnreadOutlined fontSize="small" />
          Chưa đọc
        </ToggleButton>
        {!isDesktop && (
          <IconButton
            aria-label="Bộ lọc"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            sx={{ flexShrink: 0, bgcolor: 'action.hover', width: 40, height: 40 }}
          >
            <Badge color="primary" badgeContent={activeCount} invisible={activeCount === 0}>
              <FilterListOutlined />
            </Badge>
          </IconButton>
        )}
      </Stack>

      <Collapse in={showMore} unmountOnExit>
        <Stack spacing={{ xs: 1.5, md: 2 }}>
          {tags.length > 0 && (
            <Box role="group" aria-label="Lọc theo nhãn" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {tags.map((tag) => {
                const selected = filters.tags.includes(tag.id)
                return (
                  <Chip
                    key={tag.id}
                    label={tag.name}
                    size="small"
                    clickable
                    aria-pressed={selected}
                    color={selected ? 'primary' : 'default'}
                    variant={selected ? 'filled' : 'outlined'}
                    onClick={() => onChange({ ...filters, tags: toggleTag(filters.tags, tag.id) })}
                    sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.8125rem' }}
                  />
                )
              })}
            </Box>
          )}

          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="vi" localeText={localeText}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: { xs: 1.5, md: 2 } }}>
              <DateFilter label="Từ ngày" value={filters.from} max={filters.to} onChange={(from) => onChange({ ...filters, from })} />
              <DateFilter label="Đến ngày" value={filters.to} min={filters.from} onChange={(to) => onChange({ ...filters, to })} />
            </Box>
          </LocalizationProvider>
        </Stack>
      </Collapse>
    </Paper>
  )
}

interface DateFilterProps {
  label: string
  /** `yyyy-MM-dd` or empty. */
  value: string
  min?: string
  max?: string
  onChange: (day: string) => void
}

function DateFilter({ label, value, min, max, onChange }: DateFilterProps) {
  // The picker needs its own value to follow every keystroke (a controlled value that ignores onChange wipes the
  // other sections), while the URL only receives complete, plausible dates.
  const [draft, setDraft] = useState<Dayjs | null>(() => toDayjs(value))
  const committed = useRef(value)
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value
      setDraft(toDayjs(value))
    }
  }, [value])

  const commit = (day: string) => {
    committed.current = day
    onChange(day)
  }

  return (
    <DatePicker
      value={draft}
      minDate={min ? (toDayjs(min) ?? undefined) : undefined}
      maxDate={max ? (toDayjs(max) ?? undefined) : undefined}
      format="DD/MM/YYYY"
      label={label}
      onChange={(next: Dayjs | null) => {
        setDraft(next)
        // While a year is typed, 0002 and 0202 are valid dates too; they must not reach the URL.
        if (next === null) commit('')
        else if (next.isValid() && next.year() >= MIN_YEAR && next.year() <= MAX_YEAR) commit(next.format(DAY_FORMAT))
      }}
      slotProps={{
        field: { clearable: true, onClear: () => commit('') },
        textField: { fullWidth: true, size: 'small' },
      }}
    />
  )
}

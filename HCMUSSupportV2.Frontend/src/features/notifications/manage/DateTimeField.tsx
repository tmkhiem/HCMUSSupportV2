import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { viVN } from '@mui/x-date-pickers/locales'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import 'dayjs/locale/vi'
import { useEffect, useRef, useState } from 'react'

const localeText = viVN.components.MuiLocalizationProvider.defaultProps.localeText

export interface DateTimeFieldProps {
  label: string
  /** ISO instant or null. */
  value: string | null
  onChange: (value: string | null) => void
  minDateTime?: Date
  disabled?: boolean
  helperText?: string
  error?: boolean
  testId?: string
}

/**
 * Date and time in the viewer's local time (dd/MM/yyyy HH:mm). It keeps its own draft while typing: the parent only
 * receives complete, valid instants (or null when cleared), so half-typed values never reach the form.
 */
export default function DateTimeField({ label, value, onChange, minDateTime, disabled, helperText, error, testId }: DateTimeFieldProps) {
  const [draft, setDraft] = useState<Dayjs | null>(() => (value ? dayjs(value) : null))
  const committed = useRef(value)
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value
      setDraft(value ? dayjs(value) : null)
    }
  }, [value])

  const commit = (next: string | null) => {
    committed.current = next
    onChange(next)
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="vi" localeText={localeText}>
      <div data-testid={testId}>
      <DateTimePicker
        label={label}
        value={draft}
        disabled={disabled}
        ampm={false}
        format="DD/MM/YYYY HH:mm"
        minDateTime={minDateTime ? dayjs(minDateTime) : undefined}
        onChange={(next: Dayjs | null) => {
          setDraft(next)
          if (next === null) commit(null)
          else if (next.isValid() && next.year() >= 2000 && next.year() <= 2100) commit(next.toDate().toISOString())
        }}
        slotProps={{
          field: { clearable: true, onClear: () => commit(null) },
          textField: { fullWidth: true, size: 'small', helperText, error },
        }}
      />
      </div>
    </LocalizationProvider>
  )
}

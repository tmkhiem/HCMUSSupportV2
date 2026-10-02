import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useId } from 'react'

const pillSx = {
  borderRadius: 999,
  bgcolor: 'grey.100',
  minWidth: 160,
  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
  '& .MuiSelect-select': { borderRadius: 999, fontWeight: 600 },
}

/** The pill filter select of UI-STYLE-GUIDE §4.6: filled pill, no outline, label as a caption above it. */
export default function YearSelect({
  years,
  value,
  onChange,
}: {
  years: readonly string[]
  value: string
  onChange: (year: string) => void
}) {
  const labelId = useId()
  return (
    <Stack spacing={0.5}>
      <Typography id={labelId} variant="caption" color="text.secondary" sx={{ pl: 1, fontWeight: 600 }}>
        Năm học
      </Typography>
      <Select
        size="small"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={pillSx}
        labelId={labelId}
        data-testid="year-select"
      >
        {years.map((y) => (
          <MenuItem key={y} value={y}>
            {y}
          </MenuItem>
        ))}
      </Select>
    </Stack>
  )
}

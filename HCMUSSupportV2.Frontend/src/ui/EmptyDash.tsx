import Box from '@mui/material/Box'
import { DASH } from '../lib/format'

/** `—` for a missing value, with a screen-reader label so it is not read as a pause. */
export default function EmptyDash() {
  return (
    <Box component="span" aria-label="Không có dữ liệu" sx={{ color: 'text.disabled' }}>
      {DASH}
    </Box>
  )
}

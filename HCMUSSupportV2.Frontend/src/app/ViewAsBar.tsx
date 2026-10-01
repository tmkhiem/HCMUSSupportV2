import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import { useState } from 'react'
import type { ActingAs } from '../auth/types'
import { joinParts } from '../lib/format'

export interface ViewAsBarProps {
  actingAs: ActingAs
  onExit: () => Promise<void> | void
}

/** Fixed warning strip shown while an admin is viewing the app as another employee (read-only, audited). */
export default function ViewAsBar({ actingAs, onExit }: ViewAsBarProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Box
      role="status"
      sx={{
        flexShrink: 0,
        zIndex: (t) => t.zIndex.appBar + 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        px: 2,
        minHeight: 44,
        py: 0.5,
        bgcolor: '#FFC107',
        color: 'text.primary',
      }}
    >
      <VisibilityOutlined fontSize="small" aria-hidden />
      <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 0 }} noWrap>
        Đang xem với tư cách {joinParts([actingAs.fullName, actingAs.code])}
      </Typography>
      <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'inline' }, opacity: 0.8 }}>
        Chỉ đọc
      </Typography>
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onExit()
          } finally {
            setBusy(false)
          }
        }}
        sx={{ flexShrink: 0, py: 0, bgcolor: 'rgba(255,255,255,.5)', borderColor: 'rgba(0,0,0,.4)' }}
      >
        Thoát
      </Button>
    </Box>
  )
}

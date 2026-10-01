import LogoutIcon from '@mui/icons-material/Logout'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import ListItemIcon from '@mui/material/ListItemIcon'
import MenuItem from '@mui/material/MenuItem'
import MenuList from '@mui/material/MenuList'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useId, useState } from 'react'
import { useCurrentUser, useAuth } from '../auth/authContext'
import { ROLE_LABELS } from '../auth/types'
import type { RoleName } from '../auth/types'
import { joinParts } from '../lib/format'
import SectionLabel from '../ui/SectionLabel'
import { useSystemInfo } from './useSystemInfo'

function initial(fullName: string): string {
  const last = fullName.trim().split(/\s+/).at(-1) ?? ''
  return last.charAt(0).toUpperCase()
}

/** Round avatar button that opens the acrylic account menu (name, MSCB, roles, version, red logout). */
export default function AccountMenu({ size = 44 }: { size?: number }) {
  const me = useCurrentUser()
  const { logout } = useAuth()
  const info = useSystemInfo()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const menuId = useId()
  const open = Boolean(anchor)

  const roles: RoleName[] = me.roles

  return (
    <>
      <ButtonBase
        aria-label="Tài khoản"
        aria-haspopup="true"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open ? 'true' : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={(t) => ({
          width: size,
          height: size,
          borderRadius: '50%',
          border: '2px solid #fff',
          bgcolor: '#fff',
          boxShadow: t.custom.shadow.blocky,
          transition: `transform ${t.custom.motion.flyInMs}ms ${t.custom.motion.ease}`,
          '&:hover': { transform: 'scale(1.05)' },
          '&:active': { transform: 'scale(0.95)' },
        })}
      >
        <Avatar
          src={me.photoUrl ?? undefined}
          alt=""
          slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
          sx={{ width: '100%', height: '100%', bgcolor: 'secondary.main', color: 'primary.main', fontSize: size * 0.4 }}
        >
          {initial(me.fullName)}
        </Avatar>
      </ButtonBase>

      <Popover
        id={menuId}
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 1.5, width: 264, overflow: 'hidden' } } }}
      >
        <Box sx={{ px: 2.5, py: 2 }}>
          <Typography noWrap title={me.fullName} sx={{ fontSize: 14, color: 'text.primary', fontWeight: 600 }}>
            {me.fullName}
          </Typography>
          <Typography noWrap variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
            {joinParts([me.code, me.unit])}
          </Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, mt: 1.25 }}>
            {roles.map((r) => (
              <Chip key={r} size="small" variant="tag" label={ROLE_LABELS[r]} />
            ))}
          </Stack>
        </Box>
        <Divider sx={{ mx: 2.5 }} />
        <SectionLabel sx={{ px: 2.5, py: 1.5, fontSize: 10, opacity: 0.75 }}>
          Phiên bản {info.data?.version ?? '—'}
        </SectionLabel>
        <Divider sx={{ mx: 2.5 }} />
        <MenuList autoFocusItem sx={{ py: 0 }}>
          <MenuItem
            onClick={() => {
              setAnchor(null)
              void logout()
            }}
            sx={{ px: 2.5, py: 1.75, color: 'error.main', fontWeight: 700, '&:hover': { bgcolor: 'rgba(211,47,47,.08)' } }}
          >
            <ListItemIcon sx={{ color: 'error.main', minWidth: 32 }}>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            Đăng xuất
          </MenuItem>
        </MenuList>
      </Popover>
    </>
  )
}

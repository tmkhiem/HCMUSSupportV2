import CloseIcon from '@mui/icons-material/Close'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { Link, useLocation } from 'react-router-dom'
import { useCurrentUser } from '../auth/authContext'
import { activeNavIndex, visibleNav } from './nav'
import { useNavBadges } from './useNavBadges'

export interface SidebarNavProps {
  /** Mobile drawer variant: bigger brand, close button, 16 px breathing room above the list. */
  mobile?: boolean
  onNavigate?: () => void
  onClose?: () => void
}

/**
 * Brand + nav list with one sliding "sunken tab" indicator that follows the active row (300 ms ease).
 * Shared by the permanent desktop drawer and the mobile drawer.
 */
export default function SidebarNav({ mobile, onNavigate, onClose }: SidebarNavProps) {
  const theme = useTheme()
  const { navRowHeight } = theme.custom.layout
  const { sidebar, motion } = theme.custom
  const me = useCurrentUser()
  const { pathname } = useLocation()
  const badges = useNavBadges()

  const entries = visibleNav(me)
  const active = activeNavIndex(entries, pathname)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', background: sidebar.gradient }}>
      {mobile ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 3, borderBottom: 1, borderColor: 'divider' }}>
          <Typography
            component="span"
            sx={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', color: 'primary.main', textShadow: sidebar.glow, whiteSpace: 'nowrap' }}
          >
            Support HCMUS
          </Typography>
          <IconButton aria-label="Đóng menu" onClick={onClose} sx={{ ml: 1, flexShrink: 0 }}>
            <CloseIcon />
          </IconButton>
        </Box>
      ) : (
        <Box sx={{ px: 4, pt: 5, pb: 5, mb: 1 }}>
          <Typography
            component="span"
            sx={{ fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.01em', color: 'primary.main', textShadow: sidebar.glow, whiteSpace: 'nowrap' }}
          >
            Support HCMUS
          </Typography>
        </Box>
      )}

      <Box
        component="nav"
        aria-label="Điều hướng chính"
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', py: mobile ? 2 : 0, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
      >
        <Box sx={{ position: 'relative' }}>
          <Box
            aria-hidden
            data-testid="nav-indicator"
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: navRowHeight,
              zIndex: 0,
              pointerEvents: 'none',
              boxSizing: 'border-box',
              bgcolor: sidebar.sunkenBackground,
              boxShadow: sidebar.sunkenShadow,
              borderTop: 1,
              borderBottom: 1,
              borderColor: 'grey.100',
              borderLeft: 4,
              borderLeftColor: 'primary.main',
              borderLeftStyle: 'solid',
              opacity: active < 0 ? 0 : 1,
              transform: `translateY(${Math.max(active, 0) * navRowHeight}px)`,
              transition: `transform ${motion.flyInMs}ms ${motion.ease}, opacity 200ms`,
            }}
          />
          <List disablePadding sx={{ position: 'relative', zIndex: 1 }}>
            {entries.map((entry, i) => {
              const isActive = i === active
              const Icon = entry.icon
              const count = entry.badge ? badges[entry.badge] : undefined
              return (
                <ListItemButton
                  key={entry.id}
                  component={Link}
                  to={entry.to}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={onNavigate}
                  disableRipple
                  sx={{
                    height: navRowHeight,
                    boxSizing: 'border-box',
                    px: 4,
                    gap: 2.5,
                    borderLeft: 4,
                    borderLeftStyle: 'solid',
                    borderLeftColor: 'transparent',
                    '&:hover': { bgcolor: 'transparent' },
                    '&:hover .nav-icon': { transform: 'scale(1.1)', opacity: 1 },
                  }}
                >
                  <Box sx={{ width: 32, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                    <Badge badgeContent={count} color="error" max={99} overlap="circular">
                      <Icon
                        className="nav-icon"
                        sx={{
                          fontSize: 26,
                          color: isActive ? 'primary.main' : 'text.secondary',
                          opacity: isActive ? 1 : 0.7,
                          transform: isActive ? 'scale(1.1)' : 'scale(1)',
                          transition: `transform ${motion.flyInMs}ms ${motion.ease}, color ${motion.flyInMs}ms, opacity ${motion.flyInMs}ms`,
                        }}
                      />
                    </Badge>
                  </Box>
                  <Typography
                    variant="sectionLabel"
                    noWrap
                    sx={{
                      color: isActive ? 'text.primary' : 'text.secondary',
                      transition: `color ${motion.flyInMs}ms`,
                    }}
                  >
                    {entry.label}
                  </Typography>
                </ListItemButton>
              )
            })}
          </List>
        </Box>
      </Box>
    </Box>
  )
}

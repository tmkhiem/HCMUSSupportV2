import MenuIcon from '@mui/icons-material/Menu'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useMatches } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import AccountMenu from './AccountMenu'
import SidebarNav from './SidebarNav'
import ViewAsBar from './ViewAsBar'
import Watermark from './Watermark'

const APP_NAME = 'Support HCMUS'

/** Title of the deepest matched route that declares `handle: { title }`. */
function useRouteTitle(): string | undefined {
  const matches = useMatches()
  for (let i = matches.length - 1; i >= 0; i--) {
    const title = (matches[i].handle as { title?: string } | undefined)?.title
    if (title) return title
  }
  return undefined
}

/** Routes that share a scroll position (a list and the dialog over it) declare the same `handle.scrollGroup`. */
function useScrollKey(pathname: string): string {
  const matches = useMatches()
  for (let i = matches.length - 1; i >= 0; i--) {
    const group = (matches[i].handle as { scrollGroup?: string } | undefined)?.scrollGroup
    if (group) return group
  }
  return pathname
}

/**
 * The signed-in shell (PLAN §7.2). `lg`+: permanent 288 px sidebar and a floating avatar. Below `lg`: 64 px top bar
 * and a 90 vw (max 450) drawer over a dark acrylic scrim. The page scrolls inside `<main>`, not the body.
 */
export default function AppLayout() {
  const theme = useTheme()
  const { sidebarWidth, topBarHeight, avatarSize } = theme.custom.layout
  const { me, exitViewAs } = useAuth()
  const { pathname } = useLocation()
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'))
  const [drawerOpen, setDrawerOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const title = useRouteTitle()
  const scrollKey = useScrollKey(pathname)

  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
  }, [title])

  // New page -> back to the top of the content pane (not when a dialog opens over its list).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [scrollKey])

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
      <Link
        href="#main-content"
        sx={{
          position: 'absolute',
          left: 8,
          top: -48,
          zIndex: theme.zIndex.tooltip,
          bgcolor: 'background.paper',
          px: 2,
          py: 1,
          borderRadius: 999,
          '&:focus': { top: 8 },
        }}
      >
        Bỏ qua điều hướng
      </Link>

      {me?.actingAs && <ViewAsBar actingAs={me.actingAs} onExit={exitViewAs} />}

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* lg and up: permanent sidebar */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', lg: 'block' },
            width: sidebarWidth,
            flexShrink: 0,
            zIndex: 20,
            '& .MuiDrawer-paper': {
              position: 'relative',
              width: sidebarWidth,
              boxSizing: 'border-box',
              border: 'none',
              boxShadow: '6px 0 32px -12px rgba(0,0,0,.22)',
              background: theme.custom.sidebar.gradient,
            },
          }}
        >
          <SidebarNav />
        </Drawer>

        {/* below lg: slide-in drawer */}
        <Drawer
          variant="temporary"
          open={drawerOpen && !isDesktop}
          onClose={() => setDrawerOpen(false)}
          transitionDuration={350}
          sx={{ display: { lg: 'none' } }}
          slotProps={{
            paper: {
              sx: {
                width: '90vw',
                maxWidth: 450,
                boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)',
                background: theme.custom.sidebar.gradient,
              },
            },
          }}
        >
          <SidebarNav mobile onNavigate={() => setDrawerOpen(false)} onClose={() => setDrawerOpen(false)} />
        </Drawer>

        <Box component="main" sx={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Watermark />

          {/* below lg: top bar */}
          <Box
            component="header"
            sx={{
              display: { xs: 'flex', lg: 'none' },
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              height: topBarHeight,
              px: 3,
              gap: 2,
              bgcolor: '#fff',
              boxShadow: '0 1px 2px rgba(0,0,0,.05)',
              position: 'relative',
              zIndex: 50,
            }}
          >
            <IconButton aria-label="Mở menu" edge="start" onClick={() => setDrawerOpen(true)}>
              <MenuIcon />
            </IconButton>
            <Typography variant="sectionLabel" noWrap sx={{ flex: 1, textAlign: 'center', color: 'text.primary', fontSize: 15 }}>
              {title ?? APP_NAME}
            </Typography>
            <AccountMenu size={40} />
          </Box>

          {/* lg and up: floating avatar, top-right */}
          <Box sx={{ display: { xs: 'none', lg: 'block' }, position: 'absolute', top: 24, right: 32, zIndex: 150 }}>
            <AccountMenu size={avatarSize} />
          </Box>

          <Box
            ref={scrollRef}
            id="main-content"
            tabIndex={-1}
            sx={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative', zIndex: 1, outline: 'none' }}
          >
            <Box sx={{ maxWidth: 1152, mx: 'auto', px: { xs: 2, md: 5 }, py: { xs: 2, md: 3 }, minHeight: '100%' }}>
              <Outlet />
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

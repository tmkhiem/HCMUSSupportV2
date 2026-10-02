import ArticleOutlined from '@mui/icons-material/ArticleOutlined'
import BiotechOutlined from '@mui/icons-material/BiotechOutlined'
import Box from '@mui/material/Box'
import { Link as RouterLink } from 'react-router-dom'
import { flyInSx } from '../../ui/flyInSx'

export type ResearchTab = 'de-tai' | 'bai-bao'

const labelSx = {
  position: 'relative',
  zIndex: 1,
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 1.5,
  py: { xs: 2, sm: 1.5 },
  px: 1,
  minWidth: 0,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  textDecoration: 'none',
  transition: 'color 300ms',
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.dark', outlineOffset: -4, borderRadius: 999 },
} as const

/**
 * The build's skewed pill switcher between Đề tài and Bài báo. Two route links (`/nckh/de-tai`, `/nckh/bai-bao`); the
 * primary parallelogram (`skewX(-15deg)`) sits under the active one. Labels shorten below `sm` ("Đề tài" / "Bài báo").
 */
export default function ResearchSwitcher({ active }: { active: ResearchTab }) {
  const tabs = [
    { key: 'de-tai', to: '/nckh/de-tai', short: 'Đề tài', long: 'Đề tài nghiên cứu', icon: <BiotechOutlined fontSize="small" /> },
    { key: 'bai-bao', to: '/nckh/bai-bao', short: 'Bài báo', long: 'Bài báo khoa học', icon: <ArticleOutlined fontSize="small" /> },
  ] as const
  return (
    <Box
      component="nav"
      aria-label="Nghiên cứu khoa học"
      sx={[
        flyInSx(0, 'top'),
        (t) => ({
          position: 'relative',
          display: 'flex',
          overflow: 'hidden',
          mx: 'auto',
          width: '100%',
          maxWidth: 520,
          p: 0.5,
          borderRadius: 999,
          border: 1,
          borderColor: 'grey.100',
          bgcolor: 'rgba(255,255,255,0.9)',
          boxShadow: t.custom.shadow.blocky,
        }),
      ]}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: '60%',
          left: active === 'de-tai' ? '-5%' : '45%',
          bgcolor: 'primary.main',
          transform: 'skewX(-15deg)',
          transition: 'left 500ms cubic-bezier(0.16, 1, 0.3, 1)',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      />
      {tabs.map((tab) => {
        const selected = tab.key === active
        return (
          <Box
            key={tab.key}
            component={RouterLink}
            to={tab.to}
            replace
            aria-current={selected ? 'page' : undefined}
            sx={[labelSx, { color: selected ? '#fff' : 'text.secondary', '&:hover': { color: selected ? '#fff' : 'text.primary' } }]}
          >
            {tab.icon}
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              {tab.long}
            </Box>
            <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
              {tab.short}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

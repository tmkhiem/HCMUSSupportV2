import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { useEffect, useRef } from 'react'

export interface LoadMoreProps {
  loading: boolean
  onLoadMore: () => void
}

/**
 * Infinite scroll: an observer on a sentinel inside the shell's scroll pane (`#main-content`) loads the next page
 * shortly before it is reached. The "Tải thêm" button is the fallback (no IntersectionObserver, keyboard users).
 */
export default function LoadMore({ loading, onLoadMore }: LoadMoreProps) {
  const sentinel = useRef<HTMLDivElement>(null)
  const callback = useRef(onLoadMore)
  const busy = useRef(loading)
  useEffect(() => {
    callback.current = onLoadMore
    busy.current = loading
  })

  useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !busy.current) callback.current()
      },
      { root: document.getElementById('main-content'), rootMargin: '0px 0px 400px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
    // Re-observe after each page: a sentinel that stays in view fires again only when the observer is recreated.
  }, [loading])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pb: 3 }}>
      <div ref={sentinel} aria-hidden style={{ height: 1, width: '100%', marginBottom: 24 }} />
      <Button
        variant="outlined"
        color="inherit"
        onClick={onLoadMore}
        disabled={loading}
        startIcon={loading ? <CircularProgress size={16} /> : <ExpandMoreIcon />}
        sx={{ bgcolor: 'common.white', px: 4, borderColor: 'divider' }}
      >
        Tải thêm
      </Button>
    </Box>
  )
}

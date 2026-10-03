import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import { Outlet, useSearchParams } from 'react-router-dom'
import { PageHeader, PageState, errorMessage } from '../../../ui'
import InboxFilterBar from './InboxFilterBar'
import InboxRow from './InboxRow'
import LoadMore from './LoadMore'
import { countActiveFilters, EMPTY_FILTERS, hasActiveFilters, parseFilters, serializeFilters } from './inboxFilters'
import type { InboxFilters } from './inboxFilters'
import { useInboxList, useInboxTags } from './inboxQueries'

/** Rows that fly in on first paint; later pages appear without the entrance. */
const FLY_IN_ROWS = 10

/**
 * `/news`: the inbox. The filters live in the URL; the detail (`/news/:id`) is a nested route that renders its
 * Dialog through `<Outlet />` over this list, so the list (scroll position, loaded pages) stays mounted underneath.
 */
export function Component() {
  const theme = useTheme()
  const [params, setParams] = useSearchParams()
  const filters = parseFilters(params)
  const search = params.toString() ? `?${params.toString()}` : ''

  const setFilters = (next: InboxFilters, replace = false) =>
    setParams((prev) => serializeFilters(next, prev), { replace })

  const list = useInboxList(filters)
  const tags = useInboxTags()

  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const filtered = hasActiveFilters(filters)

  return (
    <>
      <PageHeader title="Tin tức" subtitle="Thông báo dành cho bạn" />

      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          mt: 1.5,
          py: 1,
          // The rows scroll under the bar; fade the page colour in behind it so they never peek through the gutter.
          background: `linear-gradient(to bottom, ${theme.palette.background.default} 75%, ${alpha(theme.palette.background.default, 0)})`,
        }}
      >
        <InboxFilterBar filters={filters} tags={tags.data ?? []} activeCount={countActiveFilters(filters)} onChange={setFilters} />
      </Box>

      <Box sx={{ mt: 1 }} aria-busy={list.isFetching} aria-live="polite">
        {list.isPending ? (
          <Stack spacing={1} aria-label="Đang tải danh sách" role="status">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} variant="rounded" height={56} sx={{ bgcolor: 'rgba(0,0,0,0.06)' }} />
            ))}
          </Stack>
        ) : (
          <PageState
            error={list.error && items.length === 0 ? list.error : undefined}
            errorFallback="Không tải được danh sách thông báo."
            onRetry={() => void list.refetch()}
          >
            {items.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography color="text.secondary">
                  {filtered ? 'Không tìm thấy thông báo nào phù hợp.' : 'Chưa có thông báo nào.'}
                </Typography>
                {filtered && (
                  <Button sx={{ mt: 1.5 }} onClick={() => setFilters(EMPTY_FILTERS)}>
                    Xóa bộ lọc
                  </Button>
                )}
              </Box>
            ) : (
              <>
                <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0, opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 150ms' }}>
                  {items.map((item, i) => (
                    <li key={item.id}>
                      <InboxRow item={item} index={i < FLY_IN_ROWS ? i : undefined} search={search} />
                    </li>
                  ))}
                </Stack>
                {list.isFetchNextPageError && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {errorMessage(list.error, 'Không tải thêm được thông báo. Vui lòng thử lại.')}
                  </Alert>
                )}
                {list.hasNextPage && <LoadMore loading={list.isFetchingNextPage} onLoadMore={() => void list.fetchNextPage()} />}
              </>
            )}
          </PageState>
        )}
      </Box>

      <Outlet />
    </>
  )
}

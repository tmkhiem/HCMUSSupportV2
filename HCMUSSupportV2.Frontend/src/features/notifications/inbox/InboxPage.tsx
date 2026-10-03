import DoneAllIcon from '@mui/icons-material/DoneAll'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import { Outlet, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../auth/authContext'
import { PageHeader, PageState, errorMessage } from '../../../ui'
import InboxFilterBar from './InboxFilterBar'
import InboxRow from './InboxRow'
import LoadMore from './LoadMore'
import { countActiveFilters, EMPTY_FILTERS, hasActiveFilters, parseFilters, serializeFilters } from './inboxFilters'
import type { InboxFilters } from './inboxFilters'
import { VIEW_AS_HINT } from './inboxTypes'
import { useInboxList, useInboxTags, useReadAll, useUnreadCount } from './inboxQueries'

/** Rows that fly in on first paint; later pages appear without the entrance. */
const FLY_IN_ROWS = 10

/**
 * `/tin-tuc`: the inbox. The filters live in the URL; the detail (`/tin-tuc/:id`) is a nested route that renders its
 * Dialog through `<Outlet />` over this list, so the list (scroll position, loaded pages) stays mounted underneath.
 */
export function Component() {
  const theme = useTheme()
  const { me } = useAuth()
  const viewingAs = Boolean(me?.actingAs)
  const [params, setParams] = useSearchParams()
  const filters = parseFilters(params)
  const search = params.toString() ? `?${params.toString()}` : ''

  const setFilters = (next: InboxFilters, replace = false) =>
    setParams((prev) => serializeFilters(next, prev), { replace })

  const list = useInboxList(filters)
  const tags = useInboxTags()
  const unread = useUnreadCount()
  const readAll = useReadAll()

  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const filtered = hasActiveFilters(filters)
  const unreadCount = unread.data ?? 0
  const canReadAll = !viewingAs && unreadCount > 0

  return (
    <>
      <PageHeader
        title="Tin tức"
        eyebrow="Thông báo"
        subtitle={unread.data === undefined ? 'Thông báo dành cho bạn' : unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : 'Bạn đã đọc hết thông báo'}
        actions={
          <Tooltip title={viewingAs ? VIEW_AS_HINT : ''} disableHoverListener={!viewingAs}>
            <span>
              <Button
                variant="outlined"
                startIcon={<DoneAllIcon />}
                disabled={!canReadAll || readAll.isPending}
                onClick={() => readAll.mutate()}
              >
                Đánh dấu tất cả đã đọc
              </Button>
            </span>
          </Tooltip>
        }
      />

      {readAll.isError && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => readAll.reset()}>
          {errorMessage(readAll.error, 'Không đánh dấu được tất cả là đã đọc. Vui lòng thử lại.')}
        </Alert>
      )}

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

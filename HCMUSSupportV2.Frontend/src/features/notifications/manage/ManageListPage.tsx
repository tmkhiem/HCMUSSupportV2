import AddIcon from '@mui/icons-material/Add'
import ClearIcon from '@mui/icons-material/Clear'
import LabelOutlined from '@mui/icons-material/LabelOutlined'
import SearchIcon from '@mui/icons-material/Search'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader, PageState, errorMessage } from '../../../ui'
import LoadMore from '../inbox/LoadMore'
import ConfirmDialog from './ConfirmDialog'
import ManageRow from './ManageRow'
import type { RowAction } from './ManageRow'
import TagsSeriesDialog from './TagsSeriesDialog'
import { archiveNotification, cloneNotification } from './manageApi'
import { EMPTY_MANAGE_FILTERS, hasManageFilters, parseManageFilters, serializeManageFilters, toListQuery } from './manageFilters'
import type { ManageFilters } from './manageFilters'
import { useDeleteNotification, useManageList, useManageSeries, useManageTags, useStoreDetail } from './manageQueries'
import { STATUS_LABEL, STATUS_ORDER } from './manageTypes'
import type { ManageItem } from './manageTypes'

const SEARCH_DEBOUNCE_MS = 400
const FLY_IN_ROWS = 10

/**
 * `/quan-ly/thong-bao`: every notification the editor can manage. Status chips, search, tag and series filters (all in
 * the URL), the read-rate bar per row, quick actions (copy, archive, delete) and the tag / series dialog.
 */
export function Component() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filters = parseManageFilters(params)
  const setFilters = (next: ManageFilters, replace = false) => setParams((prev) => serializeManageFilters(next, prev), { replace })

  const list = useManageList(toListQuery(filters))
  const tags = useManageTags()
  const series = useManageSeries()
  const items = list.data?.pages.flatMap((p) => p.items) ?? []

  const [dialog, setDialog] = useState<'tags' | 'series' | null>(null)
  const [pending, setPending] = useState<{ action: RowAction; item: ManageItem } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const storeDetail = useStoreDetail()
  const remove = useDeleteNotification()

  const run = async (action: RowAction, item: ManageItem) => {
    setBusy(true)
    setActionError(null)
    try {
      if (action === 'clone') {
        const copy = await cloneNotification(item.id)
        storeDetail(copy)
        void navigate(`/quan-ly/thong-bao/${copy.id}`)
      } else if (action === 'archive') {
        storeDetail(await archiveNotification(item.id))
      } else {
        await remove.mutateAsync(item.id)
      }
      setPending(null)
    } catch (e) {
      setActionError(errorMessage(e, 'Không thực hiện được thao tác. Vui lòng thử lại.'))
    } finally {
      setBusy(false)
    }
  }
  const onRowAction = (action: RowAction, item: ManageItem) => {
    if (action === 'clone') void run('clone', item)
    else {
      setActionError(null)
      setPending({ action, item })
    }
  }

  return (
    <>
      <PageHeader
        title="Quản lý thông báo"
        eyebrow="Biên tập"
        subtitle="Soạn, gửi và theo dõi thông báo đến nhân sự."
        actions={
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<LabelOutlined />} onClick={() => setDialog('tags')} sx={{ bgcolor: 'common.white' }}>
              Thẻ và chuỗi
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to="/quan-ly/thong-bao/moi">
              Soạn thông báo
            </Button>
          </Stack>
        }
      />

      <FilterBar filters={filters} onChange={setFilters} tags={tags.data ?? []} series={series.data ?? []} />

      {actionError && !pending && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      <Box sx={{ mt: 2 }} aria-busy={list.isFetching} aria-live="polite">
        {list.isPending ? (
          <Stack spacing={1} role="status" aria-label="Đang tải danh sách">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} variant="rounded" height={72} sx={{ bgcolor: 'rgba(0,0,0,0.06)' }} />
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
                  {hasManageFilters(filters) ? 'Không có thông báo nào phù hợp bộ lọc.' : 'Chưa có thông báo nào. Bấm “Soạn thông báo” để bắt đầu.'}
                </Typography>
                {hasManageFilters(filters) && (
                  <Button sx={{ mt: 1.5 }} onClick={() => setFilters(EMPTY_MANAGE_FILTERS)}>
                    Xóa bộ lọc
                  </Button>
                )}
              </Box>
            ) : (
              <>
                <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0, opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 150ms' }}>
                  {items.map((item, i) => (
                    <li key={item.id}>
                      <ManageRow item={item} index={i < FLY_IN_ROWS ? i : undefined} onAction={onRowAction} />
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

      <ConfirmDialog
        open={pending?.action === 'archive'}
        title="Lưu trữ thông báo?"
        confirmLabel="Lưu trữ"
        tone="error"
        busy={busy}
        error={actionError}
        onClose={() => setPending(null)}
        onConfirm={() => pending && void run('archive', pending.item)}
      >
        “{pending?.item.title}” sẽ biến mất khỏi hộp thư của người nhận. Dữ liệu đã gửi vẫn được giữ.
      </ConfirmDialog>
      <ConfirmDialog
        open={pending?.action === 'delete'}
        title="Xóa bản nháp?"
        confirmLabel="Xóa"
        tone="error"
        busy={busy}
        error={actionError}
        onClose={() => setPending(null)}
        onConfirm={() => pending && void run('delete', pending.item)}
      >
        Bản nháp “{pending?.item.title}” và các tệp đính kèm sẽ bị xóa vĩnh viễn.
      </ConfirmDialog>

      <TagsSeriesDialog open={dialog !== null} initialTab={dialog ?? 'tags'} onClose={() => setDialog(null)} />
    </>
  )
}

interface FilterBarProps {
  filters: ManageFilters
  onChange: (next: ManageFilters, replace?: boolean) => void
  tags: Array<{ id: number; name: string }>
  series: Array<{ id: number; name: string }>
}

function FilterBar({ filters, onChange, tags, series }: FilterBarProps) {
  const [draft, setDraft] = useState(filters.q)
  const committed = useRef(filters.q)
  useEffect(() => {
    if (filters.q !== committed.current) {
      committed.current = filters.q
      setDraft(filters.q)
    }
  }, [filters.q])
  const latest = useRef({ filters, onChange })
  useEffect(() => {
    latest.current = { filters, onChange }
  })
  useEffect(() => {
    const value = draft.trim()
    if (value === committed.current) return
    const timer = setTimeout(() => {
      committed.current = value
      latest.current.onChange({ ...latest.current.filters, q: value }, true)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft])

  return (
    <Paper variant="acrylic" component="section" aria-label="Bộ lọc thông báo" sx={{ mt: 2, p: { xs: 1.5, md: 2 }, display: 'grid', gap: 1.5 }}>
      <Box role="group" aria-label="Lọc theo trạng thái" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Chip
          label="Tất cả"
          size="small"
          clickable
          aria-pressed={filters.status === ''}
          color={filters.status === '' ? 'primary' : 'default'}
          variant={filters.status === '' ? 'filled' : 'outlined'}
          onClick={() => onChange({ ...filters, status: '' })}
          sx={{ bgcolor: filters.status === '' ? undefined : 'common.white' }}
        />
        {STATUS_ORDER.map((s) => (
          <Chip
            key={s}
            label={STATUS_LABEL[s]}
            size="small"
            clickable
            aria-pressed={filters.status === s}
            color={filters.status === s ? 'primary' : 'default'}
            variant={filters.status === s ? 'filled' : 'outlined'}
            onClick={() => onChange({ ...filters, status: filters.status === s ? '' : s })}
            sx={{ bgcolor: filters.status === s ? undefined : 'common.white' }}
          />
        ))}
      </Box>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' } }}>
        <TextField
          type="search"
          size="small"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              committed.current = draft.trim()
              onChange({ ...filters, q: draft.trim() }, true)
            }
          }}
          placeholder="Tìm theo tiêu đề hoặc nội dung…"
          slotProps={{
            htmlInput: { 'aria-label': 'Tìm thông báo' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ opacity: 0.5 }} />
                </InputAdornment>
              ),
              endAdornment: draft ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="Xóa nội dung tìm kiếm"
                    onClick={() => {
                      setDraft('')
                      committed.current = ''
                      onChange({ ...filters, q: '' }, true)
                    }}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
        <TextField select size="small" label="Thẻ" slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} value={tags.some((t) => t.id === filters.tag) ? filters.tag : ''} onChange={(e) => onChange({ ...filters, tag: e.target.value === '' ? null : Number(e.target.value) })}>
          <MenuItem value="">Tất cả thẻ</MenuItem>
          {tags.map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Chuỗi" slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} value={series.some((s) => s.id === filters.series) ? filters.series : ''} onChange={(e) => onChange({ ...filters, series: e.target.value === '' ? null : Number(e.target.value) })}>
          <MenuItem value="">Tất cả chuỗi</MenuItem>
          {series.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>
      </Box>
    </Paper>
  )
}

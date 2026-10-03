import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader, PageState } from '../../ui'
import EmailDrawer from './EmailDrawer'
import EmployeeFilterBar from './EmployeeFilterBar'
import EmployeeList from './EmployeeList'
import { countActiveFilters, filtersToParams, paramsToFilters } from './employeesFormat'
import { useEmployeeList } from './employeesQueries'
import { EMPTY_FILTERS } from './employeesTypes'
import type { EmployeeFilters } from './employeesTypes'
import ImportDialog from './ImportDialog'

const numberFormat = new Intl.NumberFormat('vi-VN')

/**
 * `/manage/employees`: "Nhân sự & email" (editor). The directory replaces the Google Sheet that mapped MSCB to emails:
 * search, filters, a drawer to add, remove and set the primary email of one person, and the bulk import with a dry run.
 * The filters and the open employee (`?ma=`) live in the URL, so a view can be shared and survives a reload.
 */
export function Component() {
  const theme = useTheme()
  const [params, setParams] = useSearchParams()
  const filters = paramsToFilters(params)
  const selected = params.get('ma')
  const [importOpen, setImportOpen] = useState(false)

  const setFilters = (next: EmployeeFilters, replace = false) =>
    setParams((prev) => filtersToParams(next, prev), { replace })
  const open = (code: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (code) next.set('ma', code)
        else next.delete('ma')
        return next
      },
      { replace: code === null },
    )

  const list = useEmployeeList(filters)
  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const total = list.data?.pages[0]?.total
  const active = countActiveFilters(filters)

  return (
    <>
      <PageHeader
        title="Nhân sự & email"
        eyebrow="Quản lý"
        subtitle={
          total === undefined
            ? 'Gắn MSCB với email đăng nhập của từng cán bộ'
            : `${numberFormat.format(total)} cán bộ${active > 0 ? ' phù hợp bộ lọc' : ''} · gắn MSCB với email đăng nhập`
        }
        actions={
          <Button variant="contained" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>
            Nhập từ tệp
          </Button>
        }
      />

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
        <EmployeeFilterBar filters={filters} onChange={setFilters} />
      </Box>

      <Box sx={{ mt: 1 }} aria-busy={list.isFetching} aria-live="polite">
        {list.isPending ? (
          <Stack spacing={1} role="status" aria-label="Đang tải danh sách">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} variant="rounded" height={52} sx={{ bgcolor: 'rgba(0,0,0,0.06)' }} />
            ))}
          </Stack>
        ) : (
          <PageState
            error={list.error && items.length === 0 ? list.error : undefined}
            errorFallback="Không tải được danh sách nhân sự."
            onRetry={() => void list.refetch()}
          >
            {items.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography color="text.secondary">
                  {active > 0 ? 'Không tìm thấy cán bộ nào phù hợp.' : 'Danh bạ nhân sự đang trống.'}
                </Typography>
                {active > 0 && (
                  <Button sx={{ mt: 1.5 }} onClick={() => setFilters(EMPTY_FILTERS)}>
                    Xóa bộ lọc
                  </Button>
                )}
              </Box>
            ) : (
              <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 150ms' }}>
                <EmployeeList items={items} selectedCode={selected} onOpen={open} />
                {list.hasNextPage && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                    <Button
                      variant="outlined"
                      color="inherit"
                      onClick={() => void list.fetchNextPage()}
                      disabled={list.isFetchingNextPage}
                      startIcon={list.isFetchingNextPage ? <CircularProgress size={16} /> : <ExpandMoreIcon />}
                      sx={{ px: 4 }}
                    >
                      Tải thêm
                    </Button>
                  </Box>
                )}
              </Box>
            )}
          </PageState>
        )}
      </Box>

      <EmailDrawer code={selected} onClose={() => open(null)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  )
}

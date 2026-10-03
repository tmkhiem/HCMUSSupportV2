import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { joinParts } from '../../lib/format'
import AcrylicCard from '../../ui/AcrylicCard'
import FlyIn from '../../ui/FlyIn'
import PageHeader from '../../ui/PageHeader'
import PageState from '../../ui/PageState'
import type { InnovationEntry } from './innovationApi'
import { recognitionYear, typeLabel } from './innovationFormat'
import InnovationDialog from './InnovationDialog'
import InnovationStats from './InnovationStats'
import { useInnovations } from './innovationApi'
import PngIcon from '../../ui/PngIcon'

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function InnovationRow({ entry, index, onOpen }: { entry: InnovationEntry; index: number; onOpen: () => void }) {
  return (
    <AcrylicCard index={index} onClick={onOpen} sx={{ p: 2, minWidth: 0 }} aria-label={entry.title}>
      <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{entry.title}</Typography>
      <Stack direction="row" sx={{ mt: 1, gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip size="small" color="primary" variant="outlined" label={typeLabel(entry.type)} />
        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {joinParts([entry.code, recognitionYear(entry)])}
        </Typography>
      </Stack>
    </AcrylicCard>
  )
}

export function Component() {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 350)
  const { data, error, isPending, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, isPlaceholderData } =
    useInnovations(q)
  const [selected, setSelected] = useState<InnovationEntry | null>(null)

  const items = data?.pages.flatMap((p) => p.items) ?? []
  const stats = data?.pages[0]?.stats
  const noneAtAll = !!stats && stats.count === 0

  return (
    <>
      <PageHeader title="Sáng kiến" subtitle="Các sáng kiến, giải pháp đã được công nhận của bạn." />
      <Box sx={{ mt: 3 }}>
        <PageState
          error={error}
          loading={isPending}
          empty={noneAtAll}
          errorFallback="Không tải được danh sách sáng kiến."
          emptyMessage="Chưa có sáng kiến nào được ghi nhận."
          onRetry={() => void refetch()}
        >
          {stats && <InnovationStats stats={stats} index={1} />}
          <FlyIn index={6} sx={{ mt: 3 }}>
            <TextField
              fullWidth
              size="small"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên, mã hoặc loại sáng kiến…"
              slotProps={{
                htmlInput: { 'aria-label': 'Tìm sáng kiến' },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <PngIcon name="search" size={20} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </FlyIn>
          <Stack
            data-testid="innovation-list"
            aria-busy={isPlaceholderData}
            sx={{ mt: 2, gap: 1.5, opacity: isPlaceholderData ? 0.6 : 1, transition: 'opacity 150ms' }}
          >
            {items.length === 0 ? (
              <Typography color="text.secondary" role="status">
                {`Không tìm thấy sáng kiến nào khớp với “${q}”.`}
              </Typography>
            ) : (
              items.map((entry, i) => (
                <InnovationRow key={entry.id} entry={entry} index={7 + Math.min(i, 8)} onOpen={() => setSelected(entry)} />
              ))
            )}
          </Stack>
          {hasNextPage && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button
                variant="outlined"
                startIcon={<ExpandMoreOutlined />}
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                Tải thêm sáng kiến
              </Button>
            </Box>
          )}
        </PageState>
      </Box>
      <InnovationDialog entry={selected} onClose={() => setSelected(null)} />
    </>
  )
}

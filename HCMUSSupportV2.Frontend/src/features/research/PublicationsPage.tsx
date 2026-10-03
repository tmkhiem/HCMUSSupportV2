import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined'
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCurrentUser } from '../../auth/authContext'
import AcrylicCard from '../../ui/AcrylicCard'
import PageHeader from '../../ui/PageHeader'
import PageState from '../../ui/PageState'
import ResearchSwitcher from './ResearchSwitcher'
import { usePublications } from './researchApi'
import type { Publication } from './researchApi'
import { coAuthors, doiUrl, publicationLink, venueLine } from './researchFormat'

function PublicationRow({ pub, index, myCode }: { pub: Publication; index: number; myCode: string }) {
  const others = coAuthors(pub, myCode)
  const link = publicationLink(pub)
  const isDoi = doiUrl(pub.doi) !== null
  return (
    <AcrylicCard index={index} sx={{ p: 2, minWidth: 0 }} component="article" aria-label={pub.title}>
      <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{pub.title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
        {venueLine(pub)}
      </Typography>
      {pub.details && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
          {pub.details}
        </Typography>
      )}
      <Typography variant="body2" sx={{ mt: 1, overflowWrap: 'anywhere' }}>
        <Box component="span" sx={{ fontWeight: 600 }}>
          Đồng tác giả:{' '}
        </Box>
        {others.length > 0 ? others.join(', ') : 'Không có (chỉ mình bạn trong hệ thống)'}
      </Typography>
      {link && (
        <Link
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          underline="hover"
          sx={{ mt: 1, display: 'inline-flex', alignItems: 'center', gap: 0.5, maxWidth: '100%', overflowWrap: 'anywhere' }}
        >
          {isDoi ? `DOI: ${link.replace('https://doi.org/', '')}` : 'Xem bài báo'}
          <OpenInNewOutlined sx={{ fontSize: 15, flexShrink: 0 }} aria-hidden />
        </Link>
      )}
    </AcrylicCard>
  )
}

export function Component() {
  const { data, error, isPending, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = usePublications()
  const me = useCurrentUser()
  const items = data?.pages.flatMap((p) => p.items) ?? []

  return (
    <>
      <ResearchSwitcher active="bai-bao" />
      <Box sx={{ mt: 3 }}>
        <PageHeader index={1} title="Bài báo khoa học" subtitle="Các bài báo, công bố khoa học của bạn." />
      </Box>
      <Box sx={{ mt: 3 }}>
        <PageState
          error={error}
          loading={isPending}
          empty={items.length === 0}
          errorFallback="Không tải được danh sách bài báo khoa học."
          emptyMessage="Chưa có bài báo khoa học nào được ghi nhận."
          onRetry={() => void refetch()}
        >
          <Stack data-testid="publication-list" sx={{ gap: 1.5 }}>
            {items.map((p, i) => (
              <PublicationRow key={p.id} pub={p} index={2 + Math.min(i, 8)} myCode={me.code} />
            ))}
          </Stack>
          {hasNextPage && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button
                variant="outlined"
                startIcon={<ExpandMoreOutlined />}
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                Tải thêm bài báo
              </Button>
            </Box>
          )}
        </PageState>
      </Box>
    </>
  )
}

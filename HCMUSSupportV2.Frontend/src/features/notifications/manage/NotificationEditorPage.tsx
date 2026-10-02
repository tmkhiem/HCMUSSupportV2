import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../../api/http'
import { FlyIn, PageState } from '../../../ui'
import EditorWorkspace from './EditorWorkspace'
import { useManageDetail } from './manageQueries'

/**
 * `/quan-ly/thong-bao/:id`: the editor. `moi` is a notification that does not exist yet (the first "Lưu" creates the
 * draft and the URL becomes its id). A saved one is loaded here and handed to `EditorWorkspace`, which owns the form.
 */
export function Component() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'moi'
  // The draft this page created: its URL changes from `moi` to the id, but the form (and the preview picker) must survive.
  const [created, setCreated] = useState<string | null>(null)
  const sameSession = isNew || id === created
  const detail = useManageDetail(isNew ? undefined : id)

  const notFound = detail.error instanceof ApiError && detail.error.status === 404

  return (
    <>
      <FlyIn index={0} from="top" sx={{ mb: 1.5, pr: { lg: 8 } }}>
        <Breadcrumbs aria-label="Đường dẫn" sx={{ fontSize: '0.8125rem' }}>
          <Link component={RouterLink} to="/quan-ly/thong-bao" underline="hover" color="text.secondary">
            Quản lý thông báo
          </Link>
          <Typography color="text.primary" sx={{ fontSize: 'inherit', fontWeight: 600 }}>
            {sameSession && isNew ? 'Soạn thông báo mới' : 'Soạn thông báo'}
          </Typography>
        </Breadcrumbs>
      </FlyIn>

      {sameSession ? (
        <EditorWorkspace key="session" initial={null} onCreated={setCreated} />
      ) : notFound ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography color="text.secondary">Không tìm thấy thông báo này. Có thể nó đã bị xóa.</Typography>
          <Button sx={{ mt: 1.5 }} onClick={() => void navigate('/quan-ly/thong-bao')}>
            Về danh sách
          </Button>
        </Box>
      ) : detail.isPending ? (
        <Box role="status" aria-label="Đang tải thông báo">
          <Skeleton variant="rounded" height={64} sx={{ bgcolor: 'rgba(0,0,0,0.06)', mb: 2 }} />
          <Skeleton variant="rounded" height={420} sx={{ bgcolor: 'rgba(0,0,0,0.06)' }} />
        </Box>
      ) : detail.data ? (
        <EditorWorkspace key={detail.data.id} initial={detail.data} />
      ) : (
        <PageState error={detail.error} errorFallback="Không tải được thông báo." onRetry={() => void detail.refetch()}>
          <Alert severity="error">Không tải được thông báo.</Alert>
        </PageState>
      )}
    </>
  )
}

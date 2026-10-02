import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined'
import DownloadOutlined from '@mui/icons-material/DownloadOutlined'
import ImageOutlined from '@mui/icons-material/ImageOutlined'
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined'
import TableChartOutlined from '@mui/icons-material/TableChartOutlined'
import Box from '@mui/material/Box'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { formatBytes, formatDate, joinParts } from '../../../lib/format'
import SectionLabel from '../../../ui/SectionLabel'
import { attachmentUrl } from './inboxApi'
import type { InboxAttachment, InboxSeries } from './inboxTypes'

function fileIcon(contentType: string) {
  if (contentType === 'application/pdf') return <PictureAsPdfOutlined />
  if (contentType.startsWith('image/')) return <ImageOutlined />
  if (contentType.includes('spreadsheet') || contentType.includes('excel')) return <TableChartOutlined />
  return <DescriptionOutlined />
}

const sectionSx = { mt: 3.5 } as const
const listSx = { border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'common.white', py: 0, overflow: 'hidden' } as const

/** Download links (`GET /api/notifications/{id}/attachments/{fileId}`, authorised per delivery). */
export function AttachmentList({ notificationId, attachments }: { notificationId: string; attachments: InboxAttachment[] }) {
  if (attachments.length === 0) return null
  return (
    <Box component="section" aria-label="Tệp đính kèm" sx={sectionSx}>
      <SectionLabel sx={{ mb: 1 }}>Tệp đính kèm</SectionLabel>
      <List disablePadding sx={listSx} data-testid="attachment-list">
        {attachments.map((file) => (
          <ListItemButton
            key={file.fileId}
            component="a"
            href={attachmentUrl(notificationId, file.fileId)}
            download={file.fileName}
            divider
          >
            <ListItemIcon sx={{ minWidth: 40, color: 'primary.main' }}>{fileIcon(file.contentType)}</ListItemIcon>
            <ListItemText
              primary={file.fileName}
              secondary={formatBytes(file.sizeBytes)}
              slotProps={{ primary: { sx: { fontWeight: 600, overflowWrap: 'anywhere' } } }}
            />
            <DownloadOutlined fontSize="small" aria-label="Tải xuống" sx={{ color: 'text.secondary' }} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  )
}

/** "Các kỳ trước": earlier posts of the same series that this employee also received. Links keep the list's query. */
export function SeriesPrevious({ series }: { series: InboxSeries | null }) {
  const location = useLocation()
  if (!series || series.previous.length === 0) return null
  return (
    <Box component="section" aria-label="Các kỳ trước" sx={sectionSx}>
      <SectionLabel sx={{ mb: 1 }}>Các kỳ trước · {series.name}</SectionLabel>
      <List disablePadding sx={listSx} data-testid="series-previous">
        {series.previous.map((p) => (
          <ListItemButton
            key={p.id}
            component={RouterLink}
            to={{ pathname: `/tin-tuc/${p.id}`, search: location.search }}
            state={location.state}
            replace
            divider
          >
            <ListItemText
              primary={p.title}
              secondary={joinParts([p.publishedAt ? formatDate(p.publishedAt) : null])}
              slotProps={{ primary: { sx: { fontWeight: 600, color: 'primary.main' } } }}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  )
}

import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useId, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { formatNumber } from '../../../lib/format'
import { flyInSx } from '../../../ui'
import TagChip from '../TagChip'
import StatusChip from './StatusChip'
import { rowDateLabel } from './labels'
import type { ManageItem } from './manageTypes'
import PngIcon from '../../../ui/PngIcon'

export type RowAction = 'clone' | 'archive' | 'delete'

export interface ManageRowProps {
  item: ManageItem
  index?: number
  onAction: (action: RowAction, item: ManageItem) => void
}

/**
 * One notification in the editor's list: title, status, series and tags, the recipient count (for notifications that
 * reached people) and a "⋮" menu with the quick actions. The title is the link to the editor.
 */
export default function ManageRow({ item, index, onAction }: ManageRowProps) {
  const menuId = useId()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const sent = (item.status === 'published' || item.status === 'archived') && item.recipientCount > 0
  const canArchive = item.status === 'published' || item.status === 'scheduled'
  const [firstTag, ...otherTags] = item.tags
  const pick = (action: RowAction) => {
    setAnchor(null)
    onAction(action, item)
  }

  return (
    <Paper
      variant="acrylic"
      data-testid="manage-row"
      data-status={item.status}
      sx={[index !== undefined && flyInSx(index), { position: 'relative', px: { xs: 2, md: 2.5 }, py: 1.5, display: 'flex', gap: 1.5, alignItems: { md: 'center' }, flexDirection: { xs: 'column', md: 'row' } }]}
    >
      <Box sx={{ flex: 1, minWidth: 0, pr: { xs: 5, md: 0 } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
          <StatusChip status={item.status} />
          <Typography
            component="h3"
            noWrap
            title={item.title}
            sx={{ fontSize: '1rem', fontWeight: 700, minWidth: 0, flex: 1 }}
          >
            <Box
              component={RouterLink}
              to={`/manage/notifications/${item.id}`}
              sx={{ color: 'text.primary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: 2 } }}
            >
              {item.title || 'Chưa có tiêu đề'}
            </Box>
          </Typography>
        </Stack>
        <Stack direction="row" sx={{ mt: 0.75, flexWrap: 'wrap', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
          {item.seriesName && <Chip size="small" variant="outlined" label={item.seriesName} />}
          {firstTag && <TagChip tag={firstTag} />}
          {otherTags.length > 0 && (
            <Chip size="small" variant="outlined" label={`+${otherTags.length}`} title={otherTags.map((t) => t.name).join(', ')} />
          )}
          <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', ml: 0.5 }}>
            {rowDateLabel(item)}
          </Typography>
        </Stack>
      </Box>

      <Box sx={{ width: { xs: '100%', md: 220 }, flexShrink: 0 }}>
        {sent ? (
          <Typography variant="caption" color="text.secondary">
            {formatNumber(item.recipientCount)} người nhận
          </Typography>
        ) : (
          <Typography variant="caption" color="text.secondary">
            {item.status === 'draft' ? 'Chưa gửi cho ai' : item.audienceAll ? 'Gửi cho tất cả nhân sự' : 'Chưa có người nhận'}
          </Typography>
        )}
      </Box>

      <IconButton
        aria-label={`Thao tác với “${item.title}”`}
        aria-haspopup="menu"
        aria-controls={anchor ? menuId : undefined}
        aria-expanded={anchor ? true : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ position: { xs: 'absolute', md: 'static' }, top: 6, right: 6, flexShrink: 0 }}
      >
        <MoreVertIcon />
      </IconButton>
      <Menu id={menuId} anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        <MenuItem component={RouterLink} to={`/manage/notifications/${item.id}`}>
          <ListItemIcon>
            <EditOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText>Mở và sửa</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => pick('clone')}>
          <ListItemIcon>
            <ContentCopyOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText>Sao chép thành bản nháp</ListItemText>
        </MenuItem>
        {canArchive && (
          <MenuItem onClick={() => pick('archive')}>
            <ListItemIcon>
              <PngIcon name="inventory" size={20} />
            </ListItemIcon>
            <ListItemText>Lưu trữ</ListItemText>
          </MenuItem>
        )}
        {item.status === 'draft' && (
          <MenuItem onClick={() => pick('delete')} sx={{ color: 'error.main' }}>
            <ListItemIcon>
              <DeleteOutlineIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText>Xóa bản nháp</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </Paper>
  )
}

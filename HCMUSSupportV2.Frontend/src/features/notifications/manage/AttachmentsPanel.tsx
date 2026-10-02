import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import { useRef, useState } from 'react'
import { formatBytes } from '../../../lib/format'
import { AcrylicCard, SectionLabel, errorMessage } from '../../../ui'
import { deleteAttachment, uploadAttachment } from './manageApi'
import type { ManageAttachment } from './manageTypes'

export interface AttachmentsPanelProps {
  notificationId: string | null
  attachments: ManageAttachment[]
  /** Called with the new list after an upload or a delete. */
  onChange: (next: ManageAttachment[]) => void
  /** Saves a new draft first so there is an id to attach to. Resolves to the id, or null when saving failed. */
  ensureSaved: () => Promise<string | null>
}

const MAX_FILES = 20

/** Files that travel with the notification (pdf, docx, xlsx, png, jpg up to 20 MB, at most 20). */
export default function AttachmentsPanel({ notificationId, attachments, onChange, ensureSaved }: AttachmentsPanelProps) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const id = notificationId ?? (await ensureSaved())
      if (!id) return
      const added = await uploadAttachment(id, file)
      onChange([...attachments, added])
    } catch (e) {
      setError(errorMessage(e, 'Không tải được tệp lên.'))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const remove = async (a: ManageAttachment) => {
    if (!notificationId) return
    setBusy(true)
    setError(null)
    try {
      await deleteAttachment(notificationId, a.id)
      onChange(attachments.filter((x) => x.id !== a.id))
    } catch (e) {
      setError(errorMessage(e, 'Không xóa được tệp.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AcrylicCard sx={{ p: 2.5 }} data-testid="attachments-panel">
      <SectionLabel>Tệp đính kèm</SectionLabel>
      {attachments.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Chưa có tệp đính kèm. Nhận pdf, docx, xlsx, png, jpg, mỗi tệp tối đa 20 MB.
        </Typography>
      ) : (
        <List dense disablePadding sx={{ mt: 0.5 }} aria-label="Tệp đính kèm">
          {attachments.map((a) => (
            <ListItem
              key={a.id}
              disableGutters
              secondaryAction={
                <IconButton edge="end" aria-label={`Xóa tệp ${a.fileName}`} disabled={busy} onClick={() => void remove(a)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              }
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                <AttachFileOutlined fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={a.fileName} secondary={formatBytes(a.sizeBytes)} slotProps={{ primary: { noWrap: true } }} />
            </ListItem>
          ))}
        </List>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Button
        sx={{ mt: 1 }}
        size="small"
        variant="outlined"
        disabled={busy || attachments.length >= MAX_FILES}
        startIcon={busy ? <CircularProgress size={14} /> : <UploadFileOutlined />}
        onClick={() => input.current?.click()}
      >
        Thêm tệp
      </Button>
      <input
        ref={input}
        type="file"
        hidden
        accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
        data-testid="attachment-file"
        aria-label="Tệp đính kèm"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void upload(file)
        }}
      />
    </AcrylicCard>
  )
}

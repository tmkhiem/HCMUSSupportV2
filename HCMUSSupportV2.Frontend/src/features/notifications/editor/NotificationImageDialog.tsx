import { closeImageDialog$, imageDialogState$, saveImage$, useCellValue, usePublisher } from '@mdxeditor/editor'
import type { EditingImageDialogState } from '@mdxeditor/editor'
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRef, useState } from 'react'

function ImageForm({ editing }: { editing: EditingImageDialogState | null }) {
  const save = usePublisher(saveImage$)
  const close = usePublisher(closeImageDialog$)
  const input = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<FileList | null>(null)
  const [alt, setAlt] = useState(editing?.initialValues.altText ?? '')

  const canSave = editing !== null || (files !== null && files.length > 0)
  const submit = () => {
    if (editing) save({ src: editing.initialValues.src, altText: alt, title: editing.initialValues.title ?? '' })
    else if (files) save({ file: files, altText: alt, title: '' })
  }

  return (
    <>
      <DialogTitle>{editing ? 'Sửa ảnh' : 'Chèn ảnh'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        {!editing && (
          <div>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              hidden
              data-testid="image-file-input"
              onChange={(e) => setFiles(e.target.files)}
            />
            <Button variant="outlined" startIcon={<FileUploadOutlined />} onClick={() => input.current?.click()}>
              Chọn ảnh từ máy
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {files?.[0]?.name ?? 'Ảnh được tải lên hệ thống; không thể dùng ảnh từ địa chỉ bên ngoài.'}
            </Typography>
          </div>
        )}
        <TextField
          label="Mô tả ảnh (cho người dùng đọc màn hình)"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          size="small"
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => close()}>Hủy</Button>
        <Button variant="contained" disabled={!canSave} onClick={submit}>
          {editing ? 'Lưu' : 'Chèn'}
        </Button>
      </DialogActions>
    </>
  )
}

/**
 * Replaces MDXEditor's image dialog, which also accepts any image URL. The contract allows `/api/files/{uuid}` only, so
 * this dialog can upload (through `onUploadImage`) and edit the alt text, nothing else.
 */
export default function NotificationImageDialog() {
  const state = useCellValue(imageDialogState$)
  const close = usePublisher(closeImageDialog$)
  return (
    <Dialog open={state.type !== 'inactive'} onClose={() => close()} fullWidth maxWidth="xs">
      {state.type !== 'inactive' && <ImageForm editing={state.type === 'editing' ? state : null} />}
    </Dialog>
  )
}

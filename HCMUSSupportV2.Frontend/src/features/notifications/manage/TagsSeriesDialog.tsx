import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import { useTheme } from '@mui/material/styles'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import TagChip from '../TagChip'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useState } from 'react'
import { PageState, errorMessage } from '../../../ui'
import { useDeleteSeries, useDeleteTag, useManageSeries, useManageTags, useSaveSeries, useSaveTag } from './manageQueries'
import type { ManageSeries, ManageTag } from './manageTypes'

export interface TagsSeriesDialogProps {
  open: boolean
  onClose: () => void
  /** Which tab opens first. */
  initialTab?: 'tags' | 'series'
}

const TAG_COLORS = ['#303F9F', '#0288D1', '#00796B', '#558B2F', '#F9A825', '#E64A19', '#C2185B', '#6A1B9A', '#546E7A']

/** "Thẻ & chuỗi": create, rename and delete the tags and the series that notifications can be filed under. */
export default function TagsSeriesDialog({ open, onClose, initialTab = 'tags' }: TagsSeriesDialogProps) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [tab, setTab] = useState<'tags' | 'series'>(initialTab)

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen} aria-labelledby="tags-series-title">
      <DialogTitle id="tags-series-title" sx={{ pb: 0 }}>
        Thẻ và chuỗi thông báo
      </DialogTitle>
      <Tabs value={tab} onChange={(_, v: 'tags' | 'series') => setTab(v)} sx={{ px: 2 }} aria-label="Loại danh mục">
        <Tab value="tags" label="Thẻ" id="tab-tags" aria-controls="panel-tags" />
        <Tab value="series" label="Chuỗi thông báo" id="tab-series" aria-controls="panel-series" />
      </Tabs>
      <DialogContent dividers>
        {tab === 'tags' ? (
          <Box role="tabpanel" id="panel-tags" aria-labelledby="tab-tags">
            <TagsPanel />
          </Box>
        ) : (
          <Box role="tabpanel" id="panel-series" aria-labelledby="tab-series">
            <SeriesPanel />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
      </DialogActions>
    </Dialog>
  )
}

function Swatches({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  return (
    <Box role="radiogroup" aria-label="Màu thẻ" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
      {TAG_COLORS.map((c) => (
        <Box
          key={c}
          component="button"
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={`Màu ${c}`}
          onClick={() => onChange(value === c ? null : c)}
          sx={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            bgcolor: c,
            cursor: 'pointer',
            transition: 'transform 150ms',
            transform: value === c ? 'scale(1.3)' : 'none',
            boxShadow: value === c ? (t) => `0 0 0 3px ${t.palette.background.paper}, 0 0 0 5px ${c}` : 'none',
            p: 0,
            border: 0,
          }}
        />
      ))}
    </Box>
  )
}

function TagsPanel() {
  const tags = useManageTags()
  const save = useSaveTag()
  const remove = useDeleteTag()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const begin = (t: ManageTag | null) => {
    save.reset()
    setEditing(t ? t.id : 'new')
    setName(t?.name ?? '')
    setColor(t?.color ?? null)
  }
  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    save.mutate({ id: editing === 'new' ? null : editing, name: trimmed, color }, { onSuccess: () => setEditing(null) })
  }

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        Thẻ giúp người nhận lọc thông báo. Xóa một thẻ chỉ gỡ nó khỏi các thông báo, không xóa thông báo.
      </Typography>
      <PageState error={tags.error} loading={tags.isPending} errorFallback="Không tải được danh sách thẻ." onRetry={() => void tags.refetch()}>
        <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label="Danh sách thẻ">
          {(tags.data ?? []).map((t) => (
            <Box component="li" key={t.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 36 }}>
              {editing === t.id ? (
                <Editor name={name} onName={setName} onSubmit={submit} onCancel={() => setEditing(null)} busy={save.isPending} label="Tên thẻ">
                  <Swatches value={color} onChange={setColor} />
                </Editor>
              ) : (
                <>
                  <TagChip tag={t} />
                  <Box sx={{ flex: 1 }} />
                  {confirmId === t.id ? (
                    <>
                      <Typography variant="body2">Xóa thẻ này?</Typography>
                      <Button size="small" color="error" disabled={remove.isPending} onClick={() => remove.mutate(t.id, { onSettled: () => setConfirmId(null) })}>
                        Xóa
                      </Button>
                      <Button size="small" onClick={() => setConfirmId(null)}>
                        Hủy
                      </Button>
                    </>
                  ) : (
                    <>
                      <IconButton size="small" aria-label={`Sửa thẻ ${t.name}`} onClick={() => begin(t)}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" aria-label={`Xóa thẻ ${t.name}`} onClick={() => setConfirmId(t.id)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </>
                  )}
                </>
              )}
            </Box>
          ))}
        </Stack>
        {tags.data?.length === 0 && <Typography color="text.secondary">Chưa có thẻ nào.</Typography>}
      </PageState>
      {editing === 'new' ? (
        <Editor name={name} onName={setName} onSubmit={submit} onCancel={() => setEditing(null)} busy={save.isPending} label="Tên thẻ mới">
          <Swatches value={color} onChange={setColor} />
        </Editor>
      ) : (
        <Button startIcon={<AddIcon />} onClick={() => begin(null)} sx={{ alignSelf: 'flex-start' }}>
          Thêm thẻ
        </Button>
      )}
      {save.isError && <Alert severity="error">{errorMessage(save.error, 'Không lưu được thẻ.')}</Alert>}
      {remove.isError && <Alert severity="error">{errorMessage(remove.error, 'Không xóa được thẻ.')}</Alert>}
    </Stack>
  )
}

function SeriesPanel() {
  const series = useManageSeries()
  const save = useSaveSeries()
  const remove = useDeleteSeries()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const begin = (s: ManageSeries | null) => {
    save.reset()
    setEditing(s ? s.id : 'new')
    setName(s?.name ?? '')
    setDescription(s?.description ?? '')
  }
  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    save.mutate({ id: editing === 'new' ? null : editing, name: trimmed, description: description.trim() }, { onSuccess: () => setEditing(null) })
  }
  const descriptionField = (
    <TextField size="small" fullWidth label="Mô tả (không bắt buộc)" value={description} onChange={(e) => setDescription(e.target.value)} />
  )

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        Chuỗi gom các kỳ của cùng một loại thông báo (ví dụ “Nâng lương thường xuyên”). Người nhận thấy “Các kỳ trước” của chuỗi. Xóa một chuỗi vẫn giữ các thông báo của nó.
      </Typography>
      <PageState error={series.error} loading={series.isPending} errorFallback="Không tải được danh sách chuỗi." onRetry={() => void series.refetch()}>
        <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label="Danh sách chuỗi">
          {(series.data ?? []).map((s) => (
            <Box component="li" key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 36 }}>
              {editing === s.id ? (
                <Editor name={name} onName={setName} onSubmit={submit} onCancel={() => setEditing(null)} busy={save.isPending} label="Tên chuỗi">
                  {descriptionField}
                </Editor>
              ) : (
                <>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontWeight: 600 }}>{s.name}</Typography>
                    {s.description && (
                      <Typography variant="body2" color="text.secondary">
                        {s.description}
                      </Typography>
                    )}
                  </Box>
                  {confirmId === s.id ? (
                    <>
                      <Typography variant="body2">Xóa chuỗi này?</Typography>
                      <Button size="small" color="error" disabled={remove.isPending} onClick={() => remove.mutate(s.id, { onSettled: () => setConfirmId(null) })}>
                        Xóa
                      </Button>
                      <Button size="small" onClick={() => setConfirmId(null)}>
                        Hủy
                      </Button>
                    </>
                  ) : (
                    <>
                      <IconButton size="small" aria-label={`Sửa chuỗi ${s.name}`} onClick={() => begin(s)}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" aria-label={`Xóa chuỗi ${s.name}`} onClick={() => setConfirmId(s.id)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </>
                  )}
                </>
              )}
            </Box>
          ))}
        </Stack>
        {series.data?.length === 0 && <Typography color="text.secondary">Chưa có chuỗi nào.</Typography>}
      </PageState>
      {editing === 'new' ? (
        <Editor name={name} onName={setName} onSubmit={submit} onCancel={() => setEditing(null)} busy={save.isPending} label="Tên chuỗi mới">
          {descriptionField}
        </Editor>
      ) : (
        <Button startIcon={<AddIcon />} onClick={() => begin(null)} sx={{ alignSelf: 'flex-start' }}>
          Thêm chuỗi
        </Button>
      )}
      {save.isError && <Alert severity="error">{errorMessage(save.error, 'Không lưu được chuỗi.')}</Alert>}
      {remove.isError && <Alert severity="error">{errorMessage(remove.error, 'Không xóa được chuỗi.')}</Alert>}
    </Stack>
  )
}

interface EditorProps {
  name: string
  onName: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
  busy: boolean
  label: string
  children?: React.ReactNode
}

/** The inline form of one tag or series row: the name, an extra control, "Lưu" and "Hủy". */
function Editor({ name, onName, onSubmit, onCancel, busy, label, children }: EditorProps) {
  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}
    >
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <TextField size="small" autoFocus fullWidth label={label} value={name} onChange={(e) => onName(e.target.value)} />
        <IconButton type="submit" color="primary" aria-label="Lưu" disabled={busy || name.trim() === ''}>
          <CheckIcon />
        </IconButton>
        <IconButton aria-label="Hủy" onClick={onCancel}>
          <CloseIcon />
        </IconButton>
      </Stack>
      {children}
    </Box>
  )
}

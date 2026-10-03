import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import StarIcon from '@mui/icons-material/Star'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import Alert from '@mui/material/Alert'
import Popover from '@mui/material/Popover'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { PageState, SectionLabel, errorMessage } from '../../ui'
import { MAX_EMAILS, emailProblem, statusLabel } from './employeesFormat'
import { useAcceptHrmConflict, useAddEmail, useEmployee, useRemoveEmail, useSetPrimaryEmail } from './employeesQueries'
import type { ManagedEmail, ManagedEmployee } from './employeesTypes'

export interface EmailDrawerProps {
  /** MSCB of the open employee; null closes the drawer. */
  code: string | null
  onClose: () => void
}

const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' })

/** Click the "Trùng email HRM" chip: who the address belongs to in HRM, and the two ways to resolve it. */
function ConflictPopover({
  anchor,
  email,
  employeeCode,
  busy,
  onClose,
  onKeep,
  onRemove,
}: {
  anchor: HTMLElement | null
  email: ManagedEmail
  employeeCode: string
  busy: boolean
  onClose: () => void
  onKeep: () => void
  onRemove: () => void
}) {
  return (
    <Popover
      open={anchor !== null}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { sx: { mt: 1, p: 2, width: 340, maxWidth: '90vw', bgcolor: 'background.paper' } } }}
    >
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Email trùng với HRM
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
        {email.email} là email cá nhân trong HRM của:
      </Typography>
      <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0, my: 1 }} aria-label="Cán bộ trùng email">
        {email.hrmConflictOwners.length === 0 ? (
          <Typography component="li" variant="body2">
            một cán bộ khác
          </Typography>
        ) : (
          email.hrmConflictOwners.map((o) => (
            <Typography component="li" key={o.code} variant="body2" sx={{ fontWeight: 700 }}>
              {o.fullName} · {o.code}
            </Typography>
          ))
        )}
      </Stack>
      <Stack spacing={1} sx={{ mt: 1.5 }}>
        <Button variant="contained" size="small" disabled={busy} onClick={onKeep}>
          Giữ email này cho MSCB {employeeCode}
        </Button>
        <Button variant="outlined" color="error" size="small" disabled={busy} onClick={onRemove}>
          Gỡ email này
        </Button>
      </Stack>
    </Popover>
  )
}

function EmailRow({
  email,
  employeeCode,
  busy,
  onPrimary,
  onRemove,
  onKeepConflict,
}: {
  email: ManagedEmail
  employeeCode: string
  busy: boolean
  onPrimary: () => void
  onRemove: () => void
  onKeepConflict: () => void
}) {
  const [conflictAnchor, setConflictAnchor] = useState<HTMLElement | null>(null)
  return (
    <Stack
      component="li"
      direction="row"
      spacing={1}
      data-testid="email-row"
      sx={{ alignItems: 'flex-start', py: 1.25, minWidth: 0 }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
          {email.email}
        </Typography>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ mt: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
          {email.isPrimary && <Chip size="small" color="primary" label="Email chính" />}
          {email.hrmConflict && (
            <>
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                icon={<WarningAmberIcon />}
                label="Trùng email HRM"
                onClick={(e) => setConflictAnchor(e.currentTarget)}
                aria-haspopup="dialog"
              />
              <ConflictPopover
                anchor={conflictAnchor}
                email={email}
                employeeCode={employeeCode}
                busy={busy}
                onClose={() => setConflictAnchor(null)}
                onKeep={() => {
                  setConflictAnchor(null)
                  onKeepConflict()
                }}
                onRemove={() => {
                  setConflictAnchor(null)
                  onRemove()
                }}
              />
            </>
          )}
          {email.note && (
            <Typography variant="caption" color="text.secondary">
              {email.note}
            </Typography>
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {email.addedAt ? `Thêm ${dateFormat.format(email.addedAt)}` : 'Thêm từ trước'}
          {email.addedBy ? ` · bởi ${email.addedBy}` : ''}
        </Typography>
      </Box>
      <Tooltip title={email.isPrimary ? 'Đang là email chính' : 'Đặt làm email chính'}>
        <span>
          <IconButton
            size="small"
            aria-label={`Đặt ${email.email} làm email chính`}
            disabled={busy || email.isPrimary}
            onClick={onPrimary}
            color={email.isPrimary ? 'primary' : 'default'}
          >
            {email.isPrimary ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Gỡ email">
        <span>
          <IconButton size="small" aria-label={`Gỡ ${email.email}`} disabled={busy} onClick={onRemove} color="error">
            <DeleteOutlinedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  )
}

function Panel({ employee, onClose }: { employee: ManagedEmployee; onClose: () => void }) {
  const add = useAddEmail(employee.code)
  const remove = useRemoveEmail(employee.code)
  const setPrimary = useSetPrimaryEmail(employee.code)
  const keepConflict = useAcceptHrmConflict(employee.code)
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [primary, setPrimaryFlag] = useState(false)
  const [touched, setTouched] = useState(false)
  const [confirm, setConfirm] = useState<ManagedEmail | null>(null)

  const problem = emailProblem(email, employee.emails)
  const busy = add.isPending || remove.isPending || setPrimary.isPending || keepConflict.isPending
  const full = employee.emails.length >= MAX_EMAILS
  const lastOne = employee.emails.length === 1

  const submit = () => {
    setTouched(true)
    if (problem) return
    add.mutate(
      { email, isPrimary: primary || employee.emails.length === 0, note },
      {
        onSuccess: () => {
          setEmail('')
          setNote('')
          setPrimaryFlag(false)
          setTouched(false)
        },
      },
    )
  }

  const writeError = add.error ?? remove.error ?? setPrimary.error ?? keepConflict.error

  return (
    <>
      <Stack direction="row" sx={{ p: 2, alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <SectionLabel>Email của cán bộ</SectionLabel>
          <Typography variant="h6" component="h2" sx={{ overflowWrap: 'anywhere' }}>
            {employee.fullName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {employee.code}
            {employee.unit ? ` · ${employee.unit}` : ''}
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: 'wrap' }}>
            <Chip size="small" variant="outlined" color={employee.status === 'active' ? 'success' : 'warning'} label={statusLabel(employee.status)} />
            {employee.positionTitle && <Chip size="small" variant="outlined" label={employee.positionTitle} />}
          </Stack>
        </Box>
        <IconButton aria-label="Đóng" onClick={onClose} edge="end">
          <CloseIcon />
        </IconButton>
      </Stack>
      <Divider />

      <Box sx={{ p: 2, overflowY: 'auto', flex: 1 }}>
        {employee.status !== 'active' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Cán bộ này không ở trạng thái hoạt động nên chưa thể đăng nhập, dù đã có email.
          </Alert>
        )}

        {writeError && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            onClose={() => {
              add.reset()
              remove.reset()
              setPrimary.reset()
              keepConflict.reset()
            }}
          >
            {errorMessage(writeError, 'Không lưu được thay đổi. Vui lòng thử lại.')}
          </Alert>
        )}

        <SectionLabel sx={{ mb: 0.5 }}>Email đăng nhập ({employee.emails.length})</SectionLabel>
        {employee.emails.length === 0 ? (
          <Alert severity="warning" sx={{ my: 1 }}>
            Chưa có email nào, cán bộ này chưa thể đăng nhập.
          </Alert>
        ) : (
          <Stack component="ul" divider={<Divider component="li" />} sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label="Danh sách email">
            {employee.emails.map((m) => (
              <EmailRow
                key={m.email}
                email={m}
                employeeCode={employee.code}
                busy={busy}
                onPrimary={() => setPrimary.mutate(m.email)}
                onRemove={() => setConfirm(m)}
                onKeepConflict={() => keepConflict.mutate(m.email)}
              />
            ))}
          </Stack>
        )}

        <Divider sx={{ my: 2 }} />

        <SectionLabel sx={{ mb: 1 }}>Thêm email</SectionLabel>
        <Stack
          component="form"
          spacing={1.5}
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <TextField
            label="Địa chỉ email"
            type="email"
            size="small"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => email && setTouched(true)}
            error={touched && Boolean(problem)}
            helperText={touched && problem ? problem : 'Dùng đúng địa chỉ Google mà cán bộ đăng nhập.'}
            disabled={full || busy}
            fullWidth
            slotProps={{ htmlInput: { autoComplete: 'off', inputMode: 'email' } }}
          />
          <TextField
            label="Ghi chú (không bắt buộc)"
            size="small"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={full || busy}
            fullWidth
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
          {employee.emails.length > 0 && (
            <FormControlLabel
              control={<Checkbox checked={primary} onChange={(e) => setPrimaryFlag(e.target.checked)} disabled={full || busy} />}
              label="Đặt làm email chính"
            />
          )}
          {full && <Alert severity="info">Mỗi cán bộ có tối đa {MAX_EMAILS} email. Hãy gỡ bớt trước khi thêm.</Alert>}
          <Button
            type="submit"
            variant="contained"
            startIcon={add.isPending ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
            disabled={full || busy}
            sx={{ alignSelf: 'flex-start' }}
          >
            Thêm email
          </Button>
        </Stack>
      </Box>

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} aria-labelledby="remove-email-title">
        <DialogTitle id="remove-email-title">Gỡ email này?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ overflowWrap: 'anywhere' }}>
            {confirm?.email} sẽ không còn đăng nhập được vào tài khoản {employee.code}.
            {lastOne ? ' Đây là email cuối cùng của cán bộ này.' : ''}
            {confirm?.isPrimary && !lastOne ? ' Email cũ nhất còn lại sẽ trở thành email chính.' : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirm(null)}>
            Giữ lại
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              const target = confirm
              setConfirm(null)
              if (target) remove.mutate(target.email)
            }}
          >
            Gỡ email
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

/** Right-hand drawer (full width on phones) to manage one employee's emails: add, remove, set primary. */
export default function EmailDrawer({ code, onClose }: EmailDrawerProps) {
  // Keep showing the last employee while the drawer slides out.
  const [shown, setShown] = useState(code)
  if (code !== null && code !== shown) setShown(code)
  const query = useEmployee(code ?? shown)
  return (
    <Drawer
      anchor="right"
      open={code !== null}
      onClose={onClose}
      slotProps={{
        paper: {
          'aria-label': 'Quản lý email',
          sx: { width: { xs: '100%', sm: 480 }, maxWidth: '100%', display: 'flex', flexDirection: 'column' },
        },
      }}
    >
      {query.data ? (
        <Panel key={query.data.code} employee={query.data} onClose={onClose} />
      ) : (
        <Box sx={{ p: 2 }}>
          <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
            <IconButton aria-label="Đóng" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Stack>
          <PageState
            error={query.error}
            loading={query.isPending}
            errorFallback="Không tải được thông tin cán bộ."
            onRetry={() => void query.refetch()}
          />
        </Box>
      )}
    </Drawer>
  )
}

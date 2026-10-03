import AddOutlined from '@mui/icons-material/AddOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { CreateApiClientRequest } from '../../api/generated-client'
import type { ApiClientDto, ApiScopeDto } from '../../api/generated-client'
import { formatDateTime } from '../../lib/format'
import AcrylicCard from '../../ui/AcrylicCard'
import { errorMessage } from '../../ui/errorMessage'
import PageHeader from '../../ui/PageHeader'
import PageState from '../../ui/PageState'
import CopyButton from '../profile/general/CopyButton'
import { apiClientsClient } from './clients'

const MAX_NAME = 100

function CreateDialog({ scopes, onClose, onCreated }: { scopes: ApiScopeDto[]; onClose: () => void; onCreated: (name: string, token: string) => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const create = useMutation({
    mutationFn: () => apiClientsClient.create(new CreateApiClientRequest({ name: name.trim(), scopes: picked })),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'api-clients'] })
      onCreated(res.client?.name ?? name.trim(), res.token ?? '')
    },
  })
  const valid = name.trim().length > 0 && name.trim().length <= MAX_NAME && picked.length > 0
  const toggle = (scope: string) => setPicked((p) => (p.includes(scope) ? p.filter((s) => s !== scope) : [...p, scope]))

  return (
    <Dialog open onClose={create.isPending ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="create-client-title">
      <DialogTitle id="create-client-title">Tạo API client</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {create.error && <Alert severity="error">{errorMessage(create.error, 'Không tạo được API client.')}</Alert>}
          <TextField
            label="Tên"
            value={name}
            onChange={(e) => setName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: MAX_NAME } }}
            helperText="Ví dụ: sync-hrm. Giúp nhận ra client này dùng cho việc gì."
            autoFocus
            required
          />
          <FormGroup aria-label="Phạm vi quyền">
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Phạm vi quyền</Typography>
            {scopes.map((s) => (
              <FormControlLabel
                key={s.scope}
                sx={{ alignItems: 'flex-start', mb: 1 }}
                control={<Checkbox checked={picked.includes(s.scope!)} onChange={() => toggle(s.scope!)} sx={{ pt: 0.5 }} />}
                label={
                  <>
                    <Typography sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.scope}</Typography>
                    <Typography variant="body2" color="text.secondary">{s.description}</Typography>
                  </>
                }
              />
            ))}
          </FormGroup>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={create.isPending}>Hủy</Button>
        <Button variant="contained" disabled={!valid || create.isPending} onClick={() => create.mutate()}>Tạo</Button>
      </DialogActions>
    </Dialog>
  )
}

/** The only place the plain token is ever shown. It is held in state until this dialog closes. */
function TokenDialog({ name, token, onClose }: { name: string; token: string; onClose: () => void }) {
  return (
    <Dialog open fullWidth maxWidth="sm" onClose={() => undefined} aria-labelledby="token-title">
      <DialogTitle id="token-title">Token của “{name}”</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Token chỉ hiển thị một lần. Hãy sao chép và lưu vào nơi an toàn ngay bây giờ; sau khi đóng hộp thoại này sẽ không xem lại được.
        </Alert>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TextField
            label="Token"
            value={token}
            fullWidth
            slotProps={{ input: { readOnly: true, sx: { fontFamily: 'monospace' } }, htmlInput: { 'data-testid': 'api-token' } }}
            onFocus={(e) => e.target.select()}
          />
          <CopyButton text={token} label="token" />
        </Stack>
        <DialogContentText sx={{ mt: 2 }}>
          Dùng trong tiêu đề <code>Authorization: ApiKey &lt;token&gt;</code>. Đặt token vào cấu hình của công cụ Sync, không đưa vào git.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>Tôi đã lưu token</Button>
      </DialogActions>
    </Dialog>
  )
}

function RevokeDialog({ client, onClose }: { client: ApiClientDto; onClose: () => void }) {
  const qc = useQueryClient()
  const revoke = useMutation({
    mutationFn: () => apiClientsClient.revoke(client.id!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'api-clients'] })
      onClose()
    },
  })
  return (
    <Dialog open onClose={revoke.isPending ? undefined : onClose} aria-labelledby="revoke-title">
      <DialogTitle id="revoke-title">Thu hồi “{client.name}”?</DialogTitle>
      <DialogContent>
        {revoke.error && <Alert severity="error" sx={{ mb: 1 }}>{errorMessage(revoke.error, 'Không thu hồi được API client.')}</Alert>}
        <DialogContentText>Token của client này sẽ ngừng hoạt động ngay và không khôi phục được. Muốn dùng lại phải tạo client mới.</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={revoke.isPending}>Hủy</Button>
        <Button color="error" variant="contained" disabled={revoke.isPending} onClick={() => revoke.mutate()}>Thu hồi</Button>
      </DialogActions>
    </Dialog>
  )
}

export function Component() {
  const list = useQuery({ queryKey: ['admin', 'api-clients'], queryFn: () => apiClientsClient.list() })
  const scopes = useQuery({ queryKey: ['admin', 'api-scopes'], queryFn: () => apiClientsClient.scopes(), staleTime: Infinity })
  const [creating, setCreating] = useState(false)
  const [shown, setShown] = useState<{ name: string; token: string } | null>(null)
  const [revoking, setRevoking] = useState<ApiClientDto | null>(null)
  const rows = list.data ?? []

  return (
    <>
      <PageHeader
        title="API clients"
        eyebrow="Quản trị"
        subtitle="Khóa truy cập cho công cụ Sync và các hệ thống bên ngoài đẩy dữ liệu vào."
        actions={
          <Button variant="contained" startIcon={<AddOutlined />} disabled={!scopes.data} onClick={() => setCreating(true)}>
            Tạo API client
          </Button>
        }
      />
      {scopes.error && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage(scopes.error, 'Không tải được danh sách phạm vi quyền.')}</Alert>}
      <Stack sx={{ mt: 3 }}>
        <PageState error={list.error} loading={list.isPending} empty={rows.length === 0} emptyMessage="Chưa có API client nào." errorFallback="Không tải được danh sách API client." onRetry={() => list.refetch()}>
          <AcrylicCard sx={{ overflow: 'hidden' }}>
            <TableContainer>
              <Table size="small" aria-label="API clients">
                <TableHead>
                  <TableRow>
                    <TableCell>Tên</TableCell>
                    <TableCell>Phạm vi quyền</TableCell>
                    <TableCell>Tạo lúc</TableCell>
                    <TableCell>Dùng gần nhất</TableCell>
                    <TableCell>Trạng thái</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((c) => (
                    <TableRow key={c.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{c.name}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                          {(c.scopes ?? []).map((s) => <Chip key={s} size="small" label={s} sx={{ fontFamily: 'monospace' }} />)}
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(c.createdAt)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{c.lastUsedAt ? formatDateTime(c.lastUsedAt) : 'Chưa dùng'}</TableCell>
                      <TableCell>
                        {c.revokedAt ? (
                          <Chip size="small" color="default" label={`Đã thu hồi ${formatDateTime(c.revokedAt)}`} />
                        ) : (
                          <Chip size="small" color="success" label="Đang hoạt động" />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {!c.revokedAt && (
                          <Button size="small" color="error" onClick={() => setRevoking(c)} aria-label={`Thu hồi ${c.name}`}>Thu hồi</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </AcrylicCard>
        </PageState>
      </Stack>

      {creating && scopes.data && (
        <CreateDialog
          scopes={scopes.data}
          onClose={() => setCreating(false)}
          onCreated={(name, token) => { setCreating(false); setShown({ name, token }) }}
        />
      )}
      {shown && <TokenDialog name={shown.name} token={shown.token} onClose={() => setShown(null)} />}
      {revoking && <RevokeDialog client={revoking} onClose={() => setRevoking(null)} />}
    </>
  )
}

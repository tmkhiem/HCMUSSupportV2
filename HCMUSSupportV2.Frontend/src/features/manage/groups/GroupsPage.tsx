import AddOutlined from '@mui/icons-material/AddOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputAdornment from '@mui/material/InputAdornment'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useMatch, useNavigate } from 'react-router-dom'
import { CreateGroupRequest } from '../../../api/generated-client'
import { ApiError } from '../../../api/http'
import AcrylicCard from '../../../ui/AcrylicCard'
import { errorMessage } from '../../../ui/errorMessage'
import PageHeader from '../../../ui/PageHeader'
import PageState from '../../../ui/PageState'
import { groupsClient } from '../../admin/clients'
import { useDebounced } from '../../../lib/useDebounced'
import LoadMore from '../../admin/LoadMore'
import GroupEditor from './GroupEditor'
import { KIND_LABELS } from './groupKinds'
import RuleBuilder from './RuleBuilder'
import { emptyModel, modelComplete, ruleErrors, toRule } from './ruleModel'
import type { RuleModel } from './ruleModel'
import PngIcon from '../../../ui/PngIcon'

const KIND_FILTERS = [
  { value: '', label: 'Tất cả' },
  { value: 'static', label: 'Tĩnh' },
  { value: 'rule', label: 'Quy tắc' },
  { value: 'org_unit', label: 'Đơn vị' },
]

function CreateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<'static' | 'rule'>('static')
  const [model, setModel] = useState<RuleModel>(emptyModel)
  const [ruleIssues, setRuleIssues] = useState<Record<number, string[]>>({})

  const create = useMutation({
    mutationFn: () =>
      groupsClient.create(
        new CreateGroupRequest({
          name: name.trim(),
          description: description.trim() || undefined,
          kind,
          rule: kind === 'rule' ? toRule(model) : undefined,
        }),
      ),
    onSuccess: (g) => onCreated(g.id!),
    onError: (e) => {
      if (e instanceof ApiError && e.status === 400) setRuleIssues(ruleErrors(e.problem?.errors).byIndex)
    },
  })

  const valid = name.trim().length > 0 && (kind === 'static' || modelComplete(model))

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Tạo nhóm</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Tên nhóm" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <TextField label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} />
          <RadioGroup row value={kind} onChange={(e) => setKind(e.target.value as 'static' | 'rule')} aria-label="Loại nhóm">
            <FormControlLabel value="static" control={<Radio />} label="Tĩnh: chọn thành viên thủ công" />
            <FormControlLabel value="rule" control={<Radio />} label="Quy tắc: tự cập nhật theo điều kiện" />
          </RadioGroup>
          {kind === 'rule' && <RuleBuilder model={model} onChange={(m) => { setModel(m); setRuleIssues({}) }} errors={ruleIssues} />}
          {create.error && <Alert severity="error">{errorMessage(create.error, 'Không tạo được nhóm.')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="contained" disabled={!valid || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? 'Đang tạo…' : 'Tạo nhóm'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export function Component() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const match = useMatch('/manage/groups/:id')
  const selectedId = match?.params.id ? Number(match.params.id) : null
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [archived, setArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const dq = useDebounced(q)

  const list = useInfiniteQuery({
    queryKey: ['groups', 'list', dq, kind, archived],
    queryFn: ({ pageParam }) => groupsClient.list(dq || undefined, kind || undefined, archived, pageParam, 50),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const groups = list.data?.pages.flatMap((p) => p.items ?? []) ?? []

  return (
    <>
      <PageHeader
        title="Nhóm"
        eyebrow="Quản lý"
        subtitle="Nhóm người nhận thông báo: danh sách tĩnh, quy tắc tự cập nhật và nhóm theo đơn vị."
        actions={
          <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setCreating(true)}>
            Tạo nhóm
          </Button>
        }
      />
      <Box sx={{ mt: 3, display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '340px minmax(0, 1fr)' }, alignItems: 'start' }}>
        <Stack spacing={1.5} sx={{ display: { xs: selectedId ? 'none' : 'flex', md: 'flex' }, minWidth: 0 }}>
          <TextField
            size="small"
            label="Tìm nhóm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><PngIcon name="search" size={20} /></InputAdornment> } }}
          />
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }} role="group" aria-label="Lọc theo loại">
            {KIND_FILTERS.map((f) => (
              <Chip key={f.value} label={f.label} color={kind === f.value ? 'primary' : 'default'} variant={kind === f.value ? 'filled' : 'outlined'} onClick={() => setKind(f.value)} aria-pressed={kind === f.value} />
            ))}
          </Stack>
          <FormControlLabel control={<Switch size="small" checked={archived} onChange={(_, v) => setArchived(v)} />} label="Hiện nhóm đã lưu trữ" />
          <PageState error={list.error} loading={list.isPending} empty={groups.length === 0} emptyMessage="Không có nhóm nào." errorFallback="Không tải được danh sách nhóm." onRetry={() => list.refetch()}>
            <AcrylicCard sx={{ overflow: 'hidden' }}>
              <List disablePadding aria-label="Danh sách nhóm">
                {groups.map((g) => (
                  <ListItemButton key={g.id} selected={g.id === selectedId} onClick={() => navigate(`/manage/groups/${g.id}`)} divider>
                    <ListItemText
                      primary={g.name}
                      secondary={`${g.memberCount ?? 0} thành viên${g.archivedAt ? ' · đã lưu trữ' : ''}`}
                      slotProps={{ primary: { sx: { overflowWrap: 'anywhere' } } }}
                    />
                    <Chip size="small" variant="tag" label={KIND_LABELS[g.kind ?? ''] ?? g.kind} sx={{ ml: 1 }} />
                  </ListItemButton>
                ))}
              </List>
            </AcrylicCard>
            <Stack sx={{ mt: 1.5 }}>
              <LoadMore visible={Boolean(list.hasNextPage)} loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()} />
            </Stack>
          </PageState>
        </Stack>

        <Box sx={{ display: { xs: selectedId ? 'block' : 'none', md: 'block' }, minWidth: 0 }}>
          {selectedId && Number.isFinite(selectedId) ? (
            <GroupEditor key={selectedId} id={selectedId} />
          ) : (
            <AcrylicCard sx={{ p: 6, textAlign: 'center' }}>
              <PngIcon name="groups" size={56} sx={{ opacity: 0.5, mb: 1, mx: 'auto' }} />
              <Typography color="text.secondary">Chọn một nhóm ở danh sách để xem và chỉnh sửa.</Typography>
            </AcrylicCard>
          )}
        </Box>
      </Box>

      {creating && (
        <CreateDialog
          open
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            void qc.invalidateQueries({ queryKey: ['groups', 'list'] })
            navigate(`/manage/groups/${id}`)
          }}
        />
      )}
    </>
  )
}

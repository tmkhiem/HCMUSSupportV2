import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import RestoreOutlined from '@mui/icons-material/RestoreOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useBlocker, useNavigate } from 'react-router-dom'
import { PreviewRuleRequest, UpdateGroupRequest } from '../../../api/generated-client'
import type { GroupDto } from '../../../api/generated-client'
import { ApiError } from '../../../api/http'
import AcrylicCard from '../../../ui/AcrylicCard'
import { errorMessage } from '../../../ui/errorMessage'
import PageState from '../../../ui/PageState'
import SectionLabel from '../../../ui/SectionLabel'
import { groupsClient } from '../../admin/clients'
import { useDebounced } from '../../../lib/useDebounced'
import GroupMembers from './GroupMembers'
import { KIND_LABELS } from './groupKinds'
import RuleBuilder from './RuleBuilder'
import { fromRule, modelComplete, ruleErrors, toRule } from './ruleModel'
import type { RuleModel } from './ruleModel'

function RulePreview({ model, onErrors }: { model: RuleModel; onErrors: (e: Record<number, string[]>) => void }) {
  const complete = modelComplete(model)
  // Debounce the serialised rule: a fresh object each render would never settle.
  const key = useDebounced(JSON.stringify(toRule(model)), 500)
  const preview = useQuery({
    queryKey: ['groups', 'preview-rule', key],
    queryFn: async () => {
      try {
        const res = await groupsClient.previewRule(new PreviewRuleRequest({ rule: JSON.parse(key) as Record<string, unknown> }))
        onErrors({})
        return res
      } catch (e) {
        if (e instanceof ApiError && e.status === 400) onErrors(ruleErrors(e.problem?.errors).byIndex)
        throw e
      }
    },
    enabled: complete,
    retry: false,
  })

  if (!complete) return <Typography color="text.secondary">Điền đủ các điều kiện để xem trước kết quả.</Typography>
  const general = preview.error instanceof ApiError ? ruleErrors(preview.error.problem?.errors).general : []
  return (
    <PageState error={preview.error} loading={preview.isFetching && !preview.data} errorFallback="Quy tắc chưa hợp lệ." >
      {preview.data && (
        <Stack spacing={1} aria-live="polite">
          <Typography variant="h5" component="div">
            {new Intl.NumberFormat('vi-VN').format(preview.data.count ?? 0)} <Typography component="span" color="text.secondary">cán bộ khớp quy tắc</Typography>
          </Typography>
          {(preview.data.sample ?? []).map((s) => (
            <Typography key={s.code} variant="body2">
              {s.fullName} · {s.code}
              {s.unit ? <Typography component="span" variant="body2" color="text.secondary"> · {s.unit}</Typography> : null}
            </Typography>
          ))}
          {(preview.data.count ?? 0) > (preview.data.sample ?? []).length && (
            <Typography variant="caption" color="text.secondary">Hiển thị {(preview.data.sample ?? []).length} người đầu tiên theo MSCB.</Typography>
          )}
        </Stack>
      )}
      {general.map((m) => (
        <Alert key={m} severity="error">{m}</Alert>
      ))}
    </PageState>
  )
}

/** Edits one loaded group. Remounted (via `key`) whenever the server copy changes, which clears the draft. */
function Editor({ group }: { group: GroupDto }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const kind = group.kind ?? 'static'
  const archived = Boolean(group.archivedAt)

  const [name, setName] = useState(group.name ?? '')
  const [description, setDescription] = useState(group.description ?? '')
  const [includeDescendants, setIncludeDescendants] = useState(Boolean(group.includeDescendants))
  const initialModel = useMemo(() => (kind === 'rule' ? fromRule(group.rule) : null), [group.rule, kind])
  const [model, setModel] = useState<RuleModel | null>(initialModel)
  const [serverErrors, setServerErrors] = useState<Record<number, string[]>>({})

  const savedRule = useMemo(() => (initialModel ? JSON.stringify(toRule(initialModel)) : ''), [initialModel])
  const ruleDirty = kind === 'rule' && model !== null && JSON.stringify(toRule(model)) !== savedRule
  const dirty =
    name !== (group.name ?? '') ||
    description !== (group.description ?? '') ||
    (kind === 'org_unit' && includeDescendants !== Boolean(group.includeDescendants)) ||
    ruleDirty
  const valid = name.trim().length > 0 && (kind !== 'rule' || model === null || modelComplete(model))

  const save = useMutation({
    mutationFn: () =>
      groupsClient.update(
        group.id!,
        new UpdateGroupRequest({
          name: kind === 'org_unit' ? undefined : name.trim(),
          description: description.trim() || undefined,
          rule: kind === 'rule' && model ? toRule(model) : undefined,
          includeDescendants: kind === 'org_unit' ? includeDescendants : undefined,
        }),
      ),
    onSuccess: (g) => {
      qc.setQueryData(['groups', group.id, 'detail'], g)
      void qc.invalidateQueries({ queryKey: ['groups', 'list'] })
      void qc.invalidateQueries({ queryKey: ['groups', group.id, 'members'] })
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 400) setServerErrors(ruleErrors(e.problem?.errors).byIndex)
    },
  })
  const archive = useMutation({
    mutationFn: () => groupsClient.archive(group.id!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['groups'] })
      navigate('/manage/groups')
    },
  })
  const restore = useMutation({
    mutationFn: () => groupsClient.restore(group.id!),
    onSuccess: (g) => {
      qc.setQueryData(['groups', group.id, 'detail'], g)
      void qc.invalidateQueries({ queryKey: ['groups', 'list'] })
    },
  })

  const reset = () => {
    setName(group.name ?? '')
    setDescription(group.description ?? '')
    setIncludeDescendants(Boolean(group.includeDescendants))
    setModel(initialModel)
    setServerErrors({})
    save.reset()
  }

  // Leaving the page (another group, another menu item) with a draft asks first; closing the tab shows the browser prompt.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Button component={RouterLink} to="/manage/groups" startIcon={<ArrowBackOutlined />} sx={{ display: { md: 'none' } }}>
          Danh sách
        </Button>
        <Typography variant="h6" component="h2" sx={{ overflowWrap: 'anywhere' }}>{group.name}</Typography>
        <Chip size="small" variant="tag" label={KIND_LABELS[kind] ?? kind} />
        {archived && <Chip size="small" color="warning" label="Đã lưu trữ" />}
        <Typography variant="body2" color="text.secondary">{group.memberCount ?? 0} thành viên</Typography>
        <Box sx={{ flex: 1 }} />
        {archived ? (
          <Button startIcon={<RestoreOutlined />} onClick={() => restore.mutate()} disabled={restore.isPending}>Khôi phục</Button>
        ) : (
          kind !== 'org_unit' && (
            <Button color="error" startIcon={<ArchiveOutlined />} onClick={() => archive.mutate()} disabled={archive.isPending}>
              Lưu trữ
            </Button>
          )
        )}
      </Stack>
      {(archive.error || restore.error) && <Alert severity="error">{errorMessage(archive.error ?? restore.error, 'Không thực hiện được thao tác.')}</Alert>}

      <AcrylicCard sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <TextField
            label="Tên nhóm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={kind === 'org_unit' || archived}
            helperText={kind === 'org_unit' ? `Tên theo đơn vị${group.orgUnitName ? ` “${group.orgUnitName}”` : ''}` : undefined}
            required
          />
          <TextField label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} disabled={archived} />
          {kind === 'org_unit' && (
            <FormControlLabel
              control={<Switch checked={includeDescendants} onChange={(_, v) => setIncludeDescendants(v)} disabled={archived} />}
              label="Gồm cả cán bộ các đơn vị trực thuộc"
            />
          )}
        </Stack>
      </AcrylicCard>

      {kind === 'rule' && (
        <>
          <Box>
            <SectionLabel sx={{ mb: 1 }}>Quy tắc</SectionLabel>
            {model ? (
              <RuleBuilder model={model} onChange={(m) => { setModel(m); setServerErrors({}) }} errors={serverErrors} disabled={archived} />
            ) : (
              <Stack spacing={1}>
                <Alert severity="info">Quy tắc này dùng điều kiện lồng nhau nên chưa chỉnh sửa được bằng bộ dựng. Chỉ xem.</Alert>
                <Box component="pre" sx={{ m: 0, p: 2, borderRadius: 1, bgcolor: 'action.hover', overflow: 'auto', fontSize: 13 }}>
                  {JSON.stringify(group.rule, null, 2)}
                </Box>
              </Stack>
            )}
          </Box>
          {model && (
            <Box>
              <SectionLabel sx={{ mb: 1 }}>Xem trước</SectionLabel>
              <AcrylicCard sx={{ p: 2.5 }}>
                <RulePreview model={model} onErrors={setServerErrors} />
              </AcrylicCard>
            </Box>
          )}
        </>
      )}

      <Box>
        <SectionLabel sx={{ mb: 1 }}>Thành viên</SectionLabel>
        {kind !== 'static' && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Thành viên của nhóm này được hệ thống tính tự động nên không sửa tay được.
          </Typography>
        )}
        <GroupMembers groupId={group.id!} editable={kind === 'static' && !archived} />
      </Box>

      {save.error && !(save.error instanceof ApiError && save.error.status === 400 && Object.keys(serverErrors).length > 0) && (
        <Alert severity="error">{errorMessage(save.error, 'Không lưu được nhóm.')}</Alert>
      )}
      {save.error && Object.keys(serverErrors).length > 0 && <Alert severity="error">Quy tắc chưa hợp lệ, xem các điều kiện được đánh dấu.</Alert>}

      {dirty && (
        <Paper
          elevation={8}
          role="region"
          aria-label="Thay đổi chưa lưu"
          sx={{
            position: 'sticky',
            bottom: { xs: 12, md: 24 },
            alignSelf: 'center',
            zIndex: (t) => t.zIndex.snackbar,
            px: 2.5,
            py: 1.25,
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 2,
            maxWidth: '100%',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Bạn có thay đổi chưa lưu</Typography>
          <Button onClick={reset} disabled={save.isPending}>Hoàn tác</Button>
          <Button variant="contained" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            {save.isPending ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </Paper>
      )}

      <Dialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()}>
        <DialogTitle>Bỏ các thay đổi chưa lưu?</DialogTitle>
        <DialogContent>
          <DialogContentText>Nhóm này có thay đổi chưa lưu. Nếu rời trang, các thay đổi sẽ mất.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => blocker.reset?.()}>Ở lại</Button>
          <Button color="error" onClick={() => blocker.proceed?.()}>Bỏ thay đổi</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

export default function GroupEditor({ id }: { id: number }) {
  const q = useQuery({ queryKey: ['groups', id, 'detail'], queryFn: () => groupsClient.get(id) })
  return (
    <PageState error={q.error} loading={q.isPending} errorFallback="Không tải được nhóm." onRetry={() => q.refetch()}>
      {q.data && <Editor key={`${q.data.id}-${q.data.updatedAt?.toString()}-${q.data.archivedAt?.toString()}`} group={q.data} />}
    </PageState>
  )
}


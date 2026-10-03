import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import SaveOutlined from '@mui/icons-material/SaveOutlined'
import SendOutlined from '@mui/icons-material/SendOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import { useTheme } from '@mui/material/styles'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { formatDateTime } from '../../../lib/format'
import { AcrylicCard, PageHeader, SectionLabel, errorMessage } from '../../../ui'
import LazyNotificationMarkdownEditor from '../editor/LazyNotificationMarkdownEditor'
import AttachmentsPanel from './AttachmentsPanel'
import ConfirmDialog from './ConfirmDialog'
import ImportDialog from './ImportDialog'
import PreviewPanel from './PreviewPanel'
import ReviewStep from './ReviewStep'
import RevisionsDialog from './RevisionsDialog'
import SettingsPanel from './SettingsPanel'
import StartFromPanel from './StartFromPanel'
import StatsPanel from './StatsPanel'
import StatusChip from './StatusChip'
import StepFlow from './StepFlow'
import type { StepDef } from './StepFlow'
import TagsSeriesDialog from './TagsSeriesDialog'
import TargetingPanel from './TargetingPanel'
import PlaceholderHelp from './PlaceholderHelp'
import { EMPTY_DRAFT, applyRevision, conflictVersion, fieldErrorsOf, formFromDetail, isDirty, splitBodyIssue, toWriteRequest, variableKeyError } from './draft'
import type { FieldErrors } from './draft'
import { cloneNotification, createNotification, publishNotification, updateNotification, uploadBodyImage } from './manageApi'
import { useDeleteNotification, useStoreDetail } from './manageQueries'
import type { DraftForm, EmployeeRef, ManageAttachment, ManageDetail, ManageRevision } from './manageTypes'
import PngIcon from '../../../ui/PngIcon'

/** The steps of a new notification, each with the help shown above it. */
const STEPS: readonly StepDef[] = [
  {
    label: 'Bắt đầu',
    help: 'Đặt tiêu đề và tóm tắt. Muốn tiết kiệm công, chọn một thông báo cũ trong cùng chuỗi để lấy sẵn nội dung và placeholder, rồi chỉnh lại.',
  },
  {
    label: 'Người nhận',
    help: 'Chọn ai sẽ nhận. Muốn mỗi người thấy giá trị riêng (ví dụ hệ số lương mới), tải tệp Excel lên trước: các ô ở dòng đầu của tệp trở thành placeholder dùng ở bước sau.',
  },
  {
    label: 'Nội dung',
    help: 'Soạn nội dung, chèn placeholder bằng nút “Chèn biến” và xem kết quả ở khung bên phải. Chọn một người nhận để xem đúng những gì họ sẽ thấy.',
  },
  {
    label: 'Thiết lập',
    help: 'Gắn thông báo vào một chuỗi để người nhận xem “Các kỳ trước”, thêm thẻ và tệp đính kèm. Có thể bỏ qua bước này.',
  },
  {
    label: 'Xem lại và đăng',
    help: 'Kiểm tra lần cuối rồi lưu nháp hoặc đăng. Thông báo sẽ được gửi ngay đến người nhận đã chọn.',
  },
]

type Dialog = 'publish' | 'delete' | 'revisions' | 'import' | 'tags' | null

/**
 * The form of one notification. `initial` is the saved notification (null for a new one). The workspace keeps the draft,
 * the saved copy and its version; the first "Lưu" of a new draft creates it, later saves send the version so a
 * concurrent edit is reported (409) instead of overwritten.
 */
export default function EditorWorkspace({ initial, onCreated }: { initial: ManageDetail | null; onCreated?: (id: string) => void }) {
  const theme = useTheme()
  const isLg = useMediaQuery(theme.breakpoints.up('lg'), { noSsr: true })
  const navigate = useNavigate()
  const qc = useQueryClient()
  const storeDetail = useStoreDetail()
  const removeDraft = useDeleteNotification()

  const [saved, setSaved] = useState<ManageDetail | null>(initial)
  const [baseline, setBaseline] = useState<DraftForm | null>(() => (initial ? formFromDetail(initial) : null))
  const [form, setForm] = useState<DraftForm>(() => (initial ? formFromDetail(initial) : EMPTY_DRAFT))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [conflict, setConflict] = useState<number | null | undefined>(undefined)
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [previewAs, setPreviewAs] = useState<EmployeeRef | null>(null)
  const [pane, setPane] = useState<'edit' | 'preview'>('edit')
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  // A notification that is not loaded from the server (a new one) is written step by step.
  const wizard = initial === null
  const [step, setStep] = useState(0)

  const dirty = isDirty(form, baseline)
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  })

  // Unsaved changes: warn on reload / tab close and when leaving through the router.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyRef.current && currentLocation.pathname !== nextLocation.pathname)

  const patch = (p: Partial<DraftForm>) => setForm((f) => ({ ...f, ...p }))
  const status = saved?.status ?? 'draft'
  const live = status === 'published'
  const audience = {
    audienceAll: form.audienceAll,
    groupIds: form.groups.map((g) => g.id),
    employeeCodes: form.employees.map((e) => e.code),
    importId: saved?.import?.status === 'applied' ? saved.import.importId : null,
  }
  const validVariables = useMemo(
    () => form.variables.filter((v, i) => variableKeyError(v.key, form.variables.filter((_, j) => j !== i).map((o) => o.key)) === null).map((v) => ({ key: v.key.trim(), label: v.label.trim() || v.key.trim() })),
    [form.variables],
  )

  /** The server's copy is the truth after save, publish and import. */
  const adopt = (detail: ManageDetail) => {
    const next = formFromDetail(detail)
    setSaved(detail)
    setBaseline(next)
    setForm(next)
    setErrors({})
    setBanner(null)
    setConflict(undefined)
    storeDetail(detail)
    void qc.invalidateQueries({ queryKey: ['manage', 'preview'] })
  }

  const fail = (e: unknown, fallback: string) => {
    setErrors(fieldErrorsOf(e))
    const v = conflictVersion(e)
    if (v !== undefined) setConflict(v)
    setBanner(errorMessage(e, fallback))
  }

  /** Saves the draft (creates it the first time). Resolves to the saved notification, or null when it failed. */
  const save = async (overrideVersion?: number): Promise<ManageDetail | null> => {
    setBusy('save')
    setBanner(null)
    setErrors({})
    try {
      const detail = saved
        ? await updateNotification(saved.id, toWriteRequest(form, overrideVersion ?? saved.version))
        : await createNotification(toWriteRequest(form))
      const created = saved === null
      adopt(detail)
      if (created) {
        // The URL becomes the saved draft's id; the page keeps this workspace (same key), so nothing is lost.
        dirtyRef.current = false
        onCreated?.(detail.id)
        void navigate(`/manage/notifications/${detail.id}`, { replace: true })
      }
      setToast(created ? 'Đã tạo bản nháp.' : 'Đã lưu.')
      return detail
    } catch (e) {
      fail(e, 'Không lưu được thông báo. Vui lòng thử lại.')
      return null
    } finally {
      setBusy(null)
    }
  }

  /** Saves pending changes, so that publish, upload and import act on what is on screen. Resolves to the id. */
  const ensureSaved = async (): Promise<string | null> => {
    if (saved && !dirty) return saved.id
    const detail = await save()
    return detail ? detail.id : null
  }

  const lifecycle = async (kind: 'publish', run: (id: string) => Promise<ManageDetail>) => {
    setDialogError(null)
    setBusy(kind)
    try {
      const id = await ensureSaved()
      if (!id) {
        setDialog(null)
        return
      }
      const detail = await run(id)
      setDialog(null)
      adopt(detail)
      setToast('Đã đăng thông báo.')
    } catch (e) {
      setDialogError(errorMessage(e, 'Không thực hiện được. Vui lòng thử lại.'))
      setErrors(fieldErrorsOf(e))
    } finally {
      setBusy(null)
    }
  }

  const clone = async () => {
    if (!saved) return
    setMenu(null)
    try {
      const copy = await cloneNotification(saved.id)
      storeDetail(copy)
      dirtyRef.current = false
      void navigate(`/manage/notifications/${copy.id}`)
    } catch (e) {
      setBanner(errorMessage(e, 'Không sao chép được thông báo.'))
    }
  }

  const deleteDraft = async () => {
    if (!saved) return
    setDialogError(null)
    try {
      await removeDraft.mutateAsync(saved.id)
      dirtyRef.current = false
      void navigate('/manage/notifications', { replace: true })
    } catch (e) {
      setDialogError(errorMessage(e, 'Không xóa được thông báo.'))
    }
  }

  const openImport = async () => {
    const id = await ensureSaved()
    if (id) setDialog('import')
  }

  const bodyIssues = (errors.bodyMd ?? []).map(splitBodyIssue)
  const title = form.title.trim() || (saved ? 'Thông báo chưa có tiêu đề' : 'Soạn thông báo mới')
  const canPublish = status === 'draft'
  const savedHint = saved ? `Phiên bản ${saved.version} · lưu ${formatDateTime(saved.updatedAt)}` : 'Chưa lưu'

  const editorPane = (
    <Stack spacing={1.5} data-testid="editor-pane">
      <LazyNotificationMarkdownEditor
        value={form.bodyMd}
        variables={validVariables}
        diffMarkdown={baseline?.bodyMd ?? ''}
        onUploadImage={uploadBodyImage}
        minHeight={isLg ? 420 : 320}
        sx={{ bgcolor: 'transparent', boxShadow: 'none', backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
        onChange={(md, meta) => {
          if (meta.initialNormalize) {
            // MDXEditor rewrote the loaded text into its canonical form: that is the new baseline, not an edit.
            setBaseline((b) => (b ? { ...b, bodyMd: md } : b))
          }
          setForm((f) => ({ ...f, bodyMd: md }))
        }}
      />
      {bodyIssues.length > 0 && (
        <Alert severity="error" data-testid="body-errors">
          <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Nội dung chưa hợp lệ</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {bodyIssues.map((m, i) => (
              <li key={i}>{m.text}</li>
            ))}
          </Box>
        </Alert>
      )}
    </Stack>
  )

  // The sections of the form. A new notification shows them one step at a time; an existing one shows them all.
  const startFromNode = (
    <>
        {!saved && <StartFromPanel onCloned={(copy) => { dirtyRef.current = false; void navigate(`/manage/notifications/${copy.id}`) }} />}
    </>
  )
  const titleNode = (
        <AcrylicCard sx={{ p: 2.5 }} component="section" aria-label="Tiêu đề">
          <SectionLabel>Tiêu đề</SectionLabel>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Tiêu đề và tóm tắt hiện trong danh sách thông báo của người nhận. Tóm tắt là một dòng ngắn dưới tiêu đề.
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 1.5 }}>
            <TextField
              label="Tiêu đề"
              required
              fullWidth
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
              error={Boolean(errors.title)}
              helperText={errors.title?.[0]}
              slotProps={{ htmlInput: { maxLength: 500, 'data-testid': 'title-input' } }}
            />
            <TextField
              label="Tóm tắt"
              fullWidth
              value={form.summary}
              onChange={(e) => patch({ summary: e.target.value })}
              placeholder={saved && !saved.summaryIsCustom ? saved.summary : 'Không bắt buộc: để trống để lấy từ đoạn đầu của nội dung'}
              helperText={errors.summary?.[0]}
              error={Boolean(errors.summary)}
              slotProps={{ htmlInput: { maxLength: 1000, 'data-testid': 'summary-input' } }}
            />
          </Stack>
        </AcrylicCard>
  )
  const targetingNode = (
        <TargetingPanel
          value={{ audienceAll: form.audienceAll, groups: form.groups, employees: form.employees }}
          onChange={(t) => patch(t)}
          importSummary={saved?.import ?? null}
          notificationId={saved?.id ?? null}
          status={status}
          deliveredCount={saved?.recipientCount ?? 0}
          onUpload={() => void openImport()}
          uploading={busy === 'save'}
          error={errors.audience?.[0] ?? errors.groupIds?.[0] ?? errors.employeeCodes?.[0]}
        />
  )
  const contentNode = (
        <Stack spacing={2} component="section" aria-label="Nội dung thông báo">
          <Box sx={{ pt: 1 }}>
            <SectionLabel>Nội dung thông báo</SectionLabel>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Soạn nội dung bên trái, kết quả hiện bên phải. Chọn một người nhận ở khung kết quả để xem đúng những gì người đó sẽ thấy.
            </Typography>
          </Box>

          {/* One card: the Markdown template on the left, the live preview on the right. */}
          <AcrylicCard sx={{ overflow: 'hidden' }}>
            {!isLg && (
              <ToggleButtonGroup exclusive size="small" value={pane} onChange={(_, v: 'edit' | 'preview' | null) => v && setPane(v)} aria-label="Chế độ hiển thị" sx={{ m: 2, mb: 0 }}>
                <ToggleButton value="edit">Soạn thảo</ToggleButton>
                <ToggleButton value="preview" data-testid="pane-preview">Kết quả</ToggleButton>
              </ToggleButtonGroup>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 1fr)' }, alignItems: 'stretch' }}>
              <Box sx={{ display: isLg || pane === 'edit' ? 'block' : 'none', minWidth: 0, p: 1.5 }}>{editorPane}</Box>
              <Box sx={{ display: isLg || pane === 'preview' ? 'block' : 'none', minWidth: 0, p: 2.5, bgcolor: 'rgba(38, 50, 56, 0.04)' }}>
                <PreviewPanel markdown={form.bodyMd} notificationId={saved?.id ?? null} version={saved?.version} employee={previewAs} onEmployee={setPreviewAs} audience={audience} />
              </Box>
            </Box>
          </AcrylicCard>

          <PlaceholderHelp variables={form.variables} serverErrors={errors.variables} />
        </Stack>
  )
  const settingsNode = (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' }, alignItems: 'start' }}>
          <SettingsPanel
            form={form}
            onChange={patch}
            errors={{ seriesId: errors.seriesId?.[0], tagIds: errors.tagIds?.[0] }}
            onManageTags={() => setDialog('tags')}
          />
          <Stack spacing={2}>
            <AttachmentsPanel
              notificationId={saved?.id ?? null}
              attachments={saved?.attachments ?? []}
              ensureSaved={ensureSaved}
              onChange={(attachments: ManageAttachment[]) => setSaved((s) => (s ? { ...s, attachments } : s))}
            />
            {saved && live && <StatsPanel notificationId={saved.id} />}
          </Stack>
        </Box>
  )
  const reviewNode = (
    <ReviewStep
      form={form}
      saved={saved}
      audience={audience}
      errors={errors}
      stepLabels={STEPS.map((x) => x.label)}
      goTo={setStep}
      onSave={() => void save()}
      onPublish={() => {
        setDialogError(null)
        setDialog('publish')
      }}
      busy={busy !== null}
    />
  )

  /** "Tiếp": saves what was entered (the first time this creates the draft), then moves on. A failed save stays put. */
  const next = async () => {
    if (step === 0 || dirty) {
      const detail = await save()
      if (!detail) return
    }
    setStep((i) => Math.min(i + 1, STEPS.length - 1))
  }

  return (
    <>
      <PageHeader
        title={title}
        eyebrow={saved ? 'Chỉnh sửa thông báo' : 'Thông báo mới'}
        subtitle={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusChip status={status} />
            <span>{savedHint}</span>
            {dirty && (
              <Typography component="span" variant="body2" color="warning.dark" sx={{ fontWeight: 700 }} data-testid="dirty-flag">
                Có thay đổi chưa lưu
              </Typography>
            )}
          </Stack>
        }
        actions={
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: { xs: 'flex-start', sm: 'flex-end' }, rowGap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={busy === 'save' ? <CircularProgress size={16} /> : <SaveOutlined />}
              disabled={busy !== null || (!dirty && saved !== null)}
              onClick={() => void save()}
              sx={{ bgcolor: 'common.white' }}
            >
              Lưu
            </Button>
            {canPublish && !wizard && (
              <Button variant="contained" size="small" startIcon={<SendOutlined />} disabled={busy !== null} onClick={() => { setDialogError(null); setDialog('publish') }}>
                Đăng
              </Button>
            )}
            <IconButton aria-label="Thêm thao tác" aria-haspopup="menu" onClick={(e) => setMenu(e.currentTarget)}>
              <MoreVertIcon />
            </IconButton>
            <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
              <MenuItem disabled={!saved} onClick={() => { setMenu(null); setDialog('revisions') }}>
                <ListItemIcon><PngIcon name="history" size={20} /></ListItemIcon>
                <ListItemText>Lịch sử chỉnh sửa</ListItemText>
              </MenuItem>
              <MenuItem disabled={!saved} onClick={() => void clone()}>
                <ListItemIcon><ContentCopyOutlined fontSize="small" /></ListItemIcon>
                <ListItemText>Sao chép thành bản nháp</ListItemText>
              </MenuItem>
              {saved && (
                <MenuItem sx={{ color: 'error.main' }} onClick={() => { setMenu(null); setDialogError(null); setDialog('delete') }}>
                  <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
                  <ListItemText>{status === 'draft' ? 'Xóa bản nháp' : 'Xóa thông báo'}</ListItemText>
                </MenuItem>
              )}
            </Menu>
          </Stack>
        }
      />

      <Stack spacing={2} sx={{ mt: 2 }}>
        {banner && (
          <Alert
            severity="error"
            onClose={() => setBanner(null)}
            action={
              conflict !== undefined ? (
                <Button color="inherit" size="small" disabled={busy !== null} onClick={() => void (conflict !== null ? save(conflict) : save())}>
                  Lưu đè
                </Button>
              ) : undefined
            }
          >
            {banner}
            {conflict !== undefined && ' Bấm “Lưu đè” để ghi đè bằng bản của bạn.'}
          </Alert>
        )}
        {status === 'published' && (
          <Alert severity="info">
            Thông báo đã đăng. Thêm người nhận sẽ gửi tiếp (họ thấy thông báo khi đăng nhập, vẫn hiển thị theo ngày đăng gốc); bỏ người nhận sẽ gỡ thông báo khỏi trang thông báo của họ.
          </Alert>
        )}

        {wizard ? (
          <StepFlow
            steps={STEPS}
            step={step}
            onStep={setStep}
            panels={[
              <Stack key="start" spacing={2}>
                {startFromNode}
                {titleNode}
              </Stack>,
              targetingNode,
              contentNode,
              settingsNode,
              reviewNode,
            ]}
            onBack={() => setStep((i) => Math.max(i - 1, 0))}
            onNext={() => void next()}
            busy={busy !== null}
          />
        ) : (
          <>
            {startFromNode}
            {titleNode}
            {targetingNode}
            {contentNode}
            {settingsNode}
          </>
        )}
      </Stack>

      {/* dialogs */}
      <ConfirmDialog
        open={dialog === 'publish'}
        title="Đăng thông báo?"
        confirmLabel="Đăng"
        busy={busy === 'publish'}
        error={dialogError}
        onClose={() => setDialog(null)}
        onConfirm={() => void lifecycle('publish', publishNotification)}
      >
        Thông báo sẽ được gửi ngay đến người nhận đã chọn{dirty ? ' (các thay đổi chưa lưu sẽ được lưu trước)' : ''}. Bạn vẫn có thể sửa sau đó.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'delete'}
        title={status === 'draft' ? 'Xóa bản nháp?' : 'Xóa thông báo?'}
        confirmLabel="Xóa"
        tone="error"
        busy={removeDraft.isPending}
        error={dialogError}
        onClose={() => setDialog(null)}
        onConfirm={() => void deleteDraft()}
      >
        {status === 'draft' ? 'Bản nháp' : 'Thông báo'}, các tệp đính kèm và dữ liệu đã gửi sẽ bị xóa vĩnh viễn.
      </ConfirmDialog>
      {saved && dialog === 'revisions' && (
        <RevisionsDialog
          open
          notificationId={saved.id}
          currentVersion={saved.version}
          onClose={() => setDialog(null)}
          onRestore={(r: ManageRevision) => {
            setForm((f) => applyRevision(f, r))
            setDialog(null)
            setToast(`Đã nạp nội dung phiên bản ${r.version}. Bấm “Lưu” để áp dụng.`)
          }}
        />
      )}
      {saved && dialog === 'import' && (
        <ImportDialog
          open
          notificationId={saved.id}
          onClose={() => {
            setDialog(null)
            void qc.invalidateQueries({ queryKey: ['manage', 'preview'] })
          }}
          onApplied={(detail) => {
            adopt(detail)
            setDialog(null)
            setToast('Đã áp dụng danh sách người nhận.')
          }}
        />
      )}
      <TagsSeriesDialog open={dialog === 'tags'} onClose={() => setDialog(null)} />

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Rời khỏi trang?"
        confirmLabel="Rời đi, bỏ thay đổi"
        tone="error"
        onClose={() => blocker.state === 'blocked' && blocker.reset()}
        onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
      >
        Bạn có thay đổi chưa lưu. Rời khỏi trang sẽ mất chúng.
      </ConfirmDialog>

      <Snackbar open={toast !== null} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" variant="filled" onClose={() => setToast(null)} role="status">
          {toast}
        </Alert>
      </Snackbar>
    </>
  )
}

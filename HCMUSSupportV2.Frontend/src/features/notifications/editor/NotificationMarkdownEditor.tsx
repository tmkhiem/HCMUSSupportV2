import '@mdxeditor/editor/style.css'
import { MDXEditor } from '@mdxeditor/editor'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import type { SxProps, Theme } from '@mui/material/styles'
import TextField from '@mui/material/TextField'
import { Component, useEffect, useMemo, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { bodyStyles } from '../body/bodyStyles'
import { iconComponentFor } from './editorIcons'
import { createNotificationPlugins, notificationEditorOptions } from './notificationPlugins'
import { VariableCatalogContext } from './variables'
import type { NotificationVariable } from './variables'
import { viTranslation } from './viTranslation'

export type { NotificationVariable } from './variables'

export interface NotificationMarkdownEditorProps {
  /** The body (`body_md`). Controlled: a value that differs from what the editor last emitted replaces its content. */
  value: string
  /**
   * Called with the Markdown on every edit. `meta.initialNormalize` is true for the one call MDXEditor makes when it
   * rewrites the loaded text into its canonical form (bullets, table padding, ...): do not mark the draft dirty for it.
   */
  onChange: (markdown: string, meta: { initialNormalize: boolean }) => void
  /** The variables the notification declares: the "Chèn biến" menu lists them, chips for other keys are drawn as errors. */
  variables: NotificationVariable[]
  /** Uploads an image and resolves to its URL, which must be `/api/files/{uuid}`. Omit to hide the image button. */
  onUploadImage?: (file: File) => Promise<string>
  /** The saved version, shown by the "so sánh" (diff) mode. */
  diffMarkdown?: string
  readOnly?: boolean
  minHeight?: number | string
  sx?: SxProps<Theme>
}

const editorSx: SxProps<Theme> = (theme) => ({
  overflow: 'hidden',
  '& .notification-mdx': {
    '--accentBase': 'rgba(48, 63, 159, 0.04)',
    '--accentBgSubtle': 'rgba(48, 63, 159, 0.06)',
    '--accentBg': 'rgba(48, 63, 159, 0.1)',
    '--accentBgHover': 'rgba(48, 63, 159, 0.14)',
    '--accentBgActive': 'rgba(48, 63, 159, 0.18)',
    '--accentLine': 'rgba(48, 63, 159, 0.3)',
    '--accentBorder': 'rgba(48, 63, 159, 0.45)',
    '--accentBorderHover': 'rgba(48, 63, 159, 0.6)',
    '--accentSolid': theme.palette.primary.main,
    '--accentSolidHover': theme.palette.primary.dark,
    '--accentText': theme.palette.primary.main,
    '--accentTextContrast': theme.palette.primary.dark,
    '--baseBgSubtle': '#F5F7F9',
    '--baseBg': '#ECEFF1',
    '--baseBgHover': '#E3E8EB',
    '--baseBgActive': '#D8DFE3',
    '--baseLine': '#CFD8DC',
    '--baseBorder': '#B0BEC5',
    '--baseBorderHover': '#90A4AE',
    '--baseSolid': '#78909C',
    '--baseSolidHover': '#546E7A',
    '--baseText': theme.palette.text.secondary,
    '--baseTextContrast': theme.palette.text.primary,
    '--font-body': theme.typography.fontFamily,
    fontFamily: theme.typography.fontFamily,
    backgroundColor: 'transparent',
  },
  '& .notification-mdx [role="toolbar"]': {
    borderRadius: 0,
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    flexWrap: 'wrap',
    position: 'sticky',
    top: 0,
    zIndex: 2,
  },
  '& .notification-mdx-content': {
    ...bodyStyles(theme),
    px: 2.5,
    py: 2,
    outline: 'none',
    '& h1': { fontSize: '1.375rem' },
    '& h2': { fontSize: '1.2rem' },
    '& h3': { fontSize: '1.075rem' },
    '& h4': { fontSize: '0.975rem' },
    '& table': { borderCollapse: 'collapse', width: '100%' },
    '& table th': {
      backgroundColor: theme.palette.primary.main,
      color: theme.palette.primary.contrastText,
      fontWeight: 700,
      textAlign: 'left',
    },
    '& table th, & table td': { border: `1px solid ${theme.palette.divider}`, p: '6px 12px', fontSize: '0.875rem' },
    '& img': { maxWidth: '100%', height: 'auto', borderRadius: '5px' },
  },
})

interface BoundaryProps {
  onCrash: (message: string) => void
  children: ReactNode
}

/** MDXEditor throws (instead of calling `onError`) for constructs inside nested editors such as table cells. */
class CrashBoundary extends Component<BoundaryProps, { crashed: boolean }> {
  state = { crashed: false }
  static getDerivedStateFromError() {
    return { crashed: true }
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onCrash(error.message)
  }
  render() {
    return this.state.crashed ? null : this.props.children
  }
}

/** Shown when the body cannot be loaded into the rich editor (raw HTML, code blocks, ...): fix the text, then retry. */
function SourceFallback({
  error,
  text,
  onText,
  onRetry,
}: {
  error: string
  text: string
  onText: (text: string) => void
  onRetry: () => void
}) {
  return (
    <div data-testid="editor-fallback" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <Alert
        severity="warning"
        action={
          <Button color="inherit" size="small" onClick={onRetry}>
            Thử lại
          </Button>
        }
      >
        Nội dung có cú pháp mà trình soạn thảo không hỗ trợ (HTML thô, khối mã, ...). Sửa trong khung bên dưới rồi bấm
        “Thử lại”. {error}
      </Alert>
      <TextField
        multiline
        minRows={8}
        value={text}
        onChange={(e) => onText(e.target.value)}
        slotProps={{ htmlInput: { 'aria-label': 'Mã Markdown', style: { fontFamily: 'ui-monospace, Consolas, monospace' } } }}
      />
    </div>
  )
}

/**
 * The notification body editor: MDXEditor configured to the Markdown contract (docs/notification-markdown.md).
 * Import it through `LazyNotificationMarkdownEditor` so MDXEditor, CodeMirror and Lexical stay out of the main chunk.
 */
export default function NotificationMarkdownEditor({
  value,
  onChange,
  variables,
  onUploadImage,
  diffMarkdown,
  readOnly,
  minHeight = 320,
  sx,
}: NotificationMarkdownEditorProps) {
  const editor = useRef<MDXEditorMethods>(null)
  const last = useRef(value)
  const [mountKey, setMountKey] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [rawText, setRawText] = useState(value)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const uploadImage = useMemo(
    () =>
      onUploadImage &&
      (async (file: File) => {
        try {
          setUploadError(null)
          return await onUploadImage(file)
        } catch (e) {
          setUploadError(e instanceof Error ? e.message : 'Không tải được ảnh lên.')
          throw e
        }
      }),
    [onUploadImage],
  )
  const plugins = useMemo(
    () => createNotificationPlugins({ onUploadImage: uploadImage, diffMarkdown: diffMarkdown ?? value }),
    // The diff baseline is the saved version at mount time: do not rebuild the editor on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uploadImage],
  )

  // Controlled `value`: MDXEditor reads `markdown` on mount only.
  useEffect(() => {
    if (failure === null && value !== last.current) {
      last.current = value
      editor.current?.setMarkdown(value)
    }
  }, [value, failure])

  const fail = (message: string) => {
    setRawText(last.current)
    setFailure(message)
  }

  if (failure !== null) {
    return (
      <Paper variant="acrylic" sx={[editorSx, { '& .notification-mdx-content': { minHeight } }, ...(Array.isArray(sx) ? sx : [sx])]}>
        <SourceFallback
          error={failure}
          text={rawText}
          onText={(text) => {
            setRawText(text)
            last.current = text
            onChange(text, { initialNormalize: false })
          }}
          onRetry={() => {
            setFailure(null)
            setMountKey((k) => k + 1)
          }}
        />
      </Paper>
    )
  }

  return (
    <Paper variant="acrylic" data-testid="notification-editor" sx={[editorSx, { '& .notification-mdx-content': { minHeight } }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {uploadError && (
        <Alert severity="error" onClose={() => setUploadError(null)} sx={{ borderRadius: 0 }}>
          {uploadError}
        </Alert>
      )}
      <VariableCatalogContext value={variables}>
        <CrashBoundary key={mountKey} onCrash={fail}>
          <MDXEditor
            key={mountKey}
            ref={editor}
            markdown={last.current}
            readOnly={readOnly}
            className="notification-mdx"
            contentEditableClassName="notification-mdx-content"
            plugins={plugins}
            iconComponentFor={iconComponentFor}
            translation={viTranslation}
            spellCheck={false}
            {...notificationEditorOptions}
            onChange={(markdown, initialNormalize) => {
              last.current = markdown
              onChange(markdown, { initialNormalize })
            }}
            onError={({ error }) => fail(error)}
          />
        </CrashBoundary>
      </VariableCatalogContext>
    </Paper>
  )
}

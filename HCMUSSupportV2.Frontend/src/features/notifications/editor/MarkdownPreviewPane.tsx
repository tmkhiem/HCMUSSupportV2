import Typography from '@mui/material/Typography'
import NotificationBody from '../body/NotificationBody'
import type { VarsRow } from '../body/remarkVars'

export interface MarkdownPreviewPaneProps {
  /** The unsaved draft. */
  markdown: string
  /** The chosen recipient's rows (D09 fetches them for the MSCB picker). `null`/empty: every value shows as `—`. */
  vars?: VarsRow[] | null
  /** e.g. "Nguyễn Văn A · T0001", shown in the header so the editor knows whose values these are. */
  recipientLabel?: string
}

/** Live preview of a draft: the same `NotificationBody` the employee sees, fed with one recipient's values. */
export default function MarkdownPreviewPane({ markdown, vars, recipientLabel }: MarkdownPreviewPaneProps) {
  return (
    <div data-testid="markdown-preview" aria-label={recipientLabel} style={{ minHeight: 200 }}>
      {markdown.trim() === '' ? (
        <Typography color="text.secondary">Chưa có nội dung.</Typography>
      ) : (
        <NotificationBody markdown={markdown} vars={vars} />
      )}
    </div>
  )
}

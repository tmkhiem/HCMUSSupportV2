import Skeleton from '@mui/material/Skeleton'
import { Suspense, lazy } from 'react'
import type { NotificationMarkdownEditorProps } from './NotificationMarkdownEditor'

export type { NotificationMarkdownEditorProps, NotificationVariable } from './NotificationMarkdownEditor'

const Editor = lazy(() => import('./NotificationMarkdownEditor'))

/**
 * Use this, not `NotificationMarkdownEditor`, from pages: the editor (MDXEditor, Lexical, CodeMirror, ~1 MB) is a
 * separate chunk that only loads when an editor opens a draft, so the employee inbox never downloads it.
 */
export default function LazyNotificationMarkdownEditor(props: NotificationMarkdownEditorProps) {
  return (
    <Suspense fallback={<Skeleton variant="rounded" height={props.minHeight ?? 320} data-testid="editor-loading" />}>
      <Editor {...props} />
    </Suspense>
  )
}

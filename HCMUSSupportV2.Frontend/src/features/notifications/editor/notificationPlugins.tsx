import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  DiffSourceToggleWrapper,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  Separator,
  StrikeThroughSupSubToggles,
  UndoRedo,
  diffSourcePlugin,
  directivesPlugin,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from '@mdxeditor/editor'
import type { RealmPlugin } from '@mdxeditor/editor'
import { contractPlugin } from './contractPlugin'
import InsertVariableMenu from './InsertVariableMenu'
import NotificationImageDialog from './NotificationImageDialog'
import { unsupportedDirectiveDescriptor, varDirectiveDescriptor } from './varDirective'

/**
 * Props every notification MDXEditor must get next to `plugins`.
 *  - `suppressHtmlProcessing`: without it MDXEditor parses the body as MDX: `a<b` and a lone `<` are errors, `<b>`
 *    and `<u>` are silently converted, and `<https://x>` autolinks fail. With it `<` is plain text (exported as `\<`),
 *    raw HTML is a clean parse error, and autolinks work, which is how CommonMark (and Markdig) read the same text.
 *  - `bullet: '-'`: MDXEditor writes `*` bullets by default.
 */
export const notificationEditorOptions = {
  suppressHtmlProcessing: true,
  toMarkdownOptions: { bullet: '-' as const },
}

export interface NotificationPluginOptions {
  /** `(file) => Promise<"/api/files/<id>">`. Without it the image button is hidden and pasting/dropping files does nothing. */
  onUploadImage?: (file: File) => Promise<string>
  /** `false` for headless use (tests). The toolbar needs a DOM with layout. */
  toolbar?: boolean
  /** `false` for headless use: CodeMirror (source/diff mode) needs real layout APIs. */
  diffSource?: boolean
  /** The markdown the diff view compares against (the saved version). */
  diffMarkdown?: string
}

/**
 * The one MDXEditor configuration for notification bodies (docs/notification-markdown.md). Exactly the contract and
 * nothing else: no underline (MDXEditor writes `<u>`), no code blocks, no JSX/HTML plugin, no image resize (it writes `<img>`).
 */
export function createNotificationPlugins({
  onUploadImage,
  toolbar = true,
  diffSource = true,
  diffMarkdown = '',
}: NotificationPluginOptions = {}): RealmPlugin[] {
  const plugins: RealmPlugin[] = [
    contractPlugin(),
    headingsPlugin({ allowedHeadingLevels: [1, 2, 3, 4] }),
    listsPlugin(),
    quotePlugin(),
    thematicBreakPlugin(),
    linkPlugin(),
    linkDialogPlugin(),
    tablePlugin(),
    imagePlugin({
      imageUploadHandler: onUploadImage ?? null,
      disableImageResize: true,
      disableImageSettingsButton: true,
      allowSetImageDimensions: false,
      ImageDialog: NotificationImageDialog,
    }),
    directivesPlugin({ directiveDescriptors: [varDirectiveDescriptor, unsupportedDirectiveDescriptor] }),
    markdownShortcutPlugin(),
  ]
  if (diffSource) plugins.push(diffSourcePlugin({ viewMode: 'rich-text', diffMarkdown }))
  if (toolbar) {
    const richTextTools = (
      <>
        <UndoRedo />
        <Separator />
        <BlockTypeSelect />
        <Separator />
        <BoldItalicUnderlineToggles options={['Bold', 'Italic']} />
        <StrikeThroughSupSubToggles options={['Strikethrough']} />
        <Separator />
        <ListsToggle options={['bullet', 'number']} />
        <Separator />
        <CreateLink />
        {onUploadImage && <InsertImage />}
        <InsertTable />
        <InsertThematicBreak />
        <Separator />
        <InsertVariableMenu />
      </>
    )
    plugins.push(
      toolbarPlugin({
        toolbarContents: () => (diffSource ? <DiffSourceToggleWrapper>{richTextTools}</DiffSourceToggleWrapper> : richTextTools),
      }),
    )
  }
  return plugins
}

import {
  $createDirectiveNode,
  $isDirectiveNode,
  addExportVisitor$,
  addImportVisitor$,
  createActiveEditorSubscription$,
  realmPlugin,
} from '@mdxeditor/editor'
import type { LexicalExportVisitor, MdastImportVisitor } from '@mdxeditor/editor'
import { $isLineBreakNode, $isTextNode, TextNode } from 'lexical'
import type { ElementNode, LexicalEditor, LexicalNode } from 'lexical'
import type { TextDirective } from 'mdast-util-directive'
import { placeholderKey } from '../body/remarkVars'
import { BOLD, CHIP_FORMATS, ITALIC, STRIKETHROUGH, chipFormat } from './chipFormat'

const UNDERLINE = 8
const SUBSCRIPT = 32
const SUPERSCRIPT = 64
const HIGHLIGHT = 128

/** Formats the contract has no Markdown for: MDXEditor would write `<u>`, `<sub>`, `<sup>` or `==x==`. */
const FORBIDDEN_FORMATS = UNDERLINE | SUBSCRIPT | SUPERSCRIPT | HIGHLIGHT

interface MdNode {
  type: string
  name?: string
  value?: string
  data?: { format?: number } & Record<string, unknown>
  attributes?: Record<string, string | null | undefined> | null
  children?: MdNode[]
}

/**
 * Plain MDXEditor drops formatting around a directive: `**:var[X]**` comes back as `:var[X]`, because a directive is a
 * decorator node that cannot carry a text format. This visitor pair keeps it: on import the parent's format is copied
 * onto the directive node (`data.format`), on export the node is wrapped in strong / emphasis / delete again, reusing an
 * open wrapper so `**a :var[X] b**` stays one run.
 */
const varImportVisitor: MdastImportVisitor<TextDirective> = {
  priority: 100,
  testNode: (node) => placeholderKey(node) !== null,
  visitNode({ mdastNode, lexicalParent, actions }) {
    const format = actions.getParentFormatting() & CHIP_FORMATS
    const node = format ? { ...mdastNode, data: { ...mdastNode.data, format } } : mdastNode
    ;(lexicalParent as ElementNode).append($createDirectiveNode(node))
  },
}

const WRAPPERS: Array<{ format: number; type: string }> = [
  { format: ITALIC, type: 'emphasis' },
  { format: BOLD, type: 'strong' },
  { format: STRIKETHROUGH, type: 'delete' },
]

const varExportVisitor: LexicalExportVisitor<never, never> = {
  priority: 100,
  testLexicalNode: ((node: LexicalNode) =>
    $isDirectiveNode(node) && chipFormat(node.getMdastNode()) !== 0) as never,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    const mdast = (lexicalNode as never as { getMdastNode(): MdNode }).getMdastNode()
    const format = chipFormat(mdast)
    const { data: _data, ...plain } = mdast
    void _data
    let target = mdastParent as unknown as MdNode
    let used = 0
    for (;;) {
      const last = target.children?.at(-1)
      const wrapper = last && WRAPPERS.find((w) => format & w.format && !(used & w.format) && last.type === w.type)
      if (!wrapper) break
      used |= wrapper.format
      target = last
    }
    for (const w of WRAPPERS.filter((w) => format & w.format && !(used & w.format))) {
      target = actions.appendToParent(target as never, { type: w.type, children: [] } as never) as unknown as MdNode
    }
    actions.appendToParent(target as never, plain as never)
  },
}

/** A Lexical line break is a Markdown hard break (`\` + newline), not a bare newline, which CommonMark reads as a space. */
const hardBreakExportVisitor: LexicalExportVisitor<never, never> = {
  priority: 100,
  testLexicalNode: ((node: LexicalNode) => $isLineBreakNode(node)) as never,
  visitLexicalNode({ mdastParent, actions }) {
    actions.appendToParent(mdastParent, { type: 'break' } as never)
  },
}

/**
 * Enforces the notification Markdown contract inside the editor.
 *
 *  - keeps formatting around `:var[Key]` chips (see above);
 *  - exports line breaks as hard breaks;
 *  - strips underline, subscript, superscript and highlight from every text node (Ctrl+U, paste from Word or a web page,
 *    or `<u>` typed in source mode), because MDXEditor can only write them as raw HTML or `==x==`.
 */
export const contractPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addImportVisitor$]: varImportVisitor as never,
      [addExportVisitor$]: [varExportVisitor, hardBreakExportVisitor] as never,
      [createActiveEditorSubscription$]: (editor: LexicalEditor) =>
        editor.registerNodeTransform(TextNode, (node) => {
          if ($isTextNode(node) && node.getFormat() & FORBIDDEN_FORMATS) {
            node.setFormat(node.getFormat() & ~FORBIDDEN_FORMATS)
          }
        }),
    })
  },
})

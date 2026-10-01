import { useLexicalNodeRemove } from '@mdxeditor/editor'
import type { DirectiveEditorProps } from '@mdxeditor/editor'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import type { Directives, TextDirective } from 'mdast-util-directive'
import { use } from 'react'
import { placeholderKey } from '../body/remarkVars'
import { BOLD, ITALIC, STRIKETHROUGH, chipFormat } from './chipFormat'
import { VariableCatalogContext } from './variables'

const chipSx = {
  mx: 0.25,
  my: 0,
  height: 22,
  verticalAlign: 'baseline',
  cursor: 'default',
  userSelect: 'none',
  fontWeight: 600,
  fontSize: '0.8125rem',
} as const

/**
 * Inline atom for `:var[Key]`. Lexical treats a decorator node as one character: the caret cannot enter it, Backspace
 * and the delete icon remove it, and the stored markdown stays `:var[Key]` because the mdast node is never touched.
 */
export function VarChipEditor({ mdastNode }: DirectiveEditorProps<TextDirective>) {
  const catalog = use(VariableCatalogContext)
  const remove = useLexicalNodeRemove()
  const key = placeholderKey(mdastNode) ?? ''
  const known = catalog.find((v) => v.key === key)
  const format = chipFormat(mdastNode)
  const chip = (
    <Chip
      size="small"
      color={known ? 'primary' : 'error'}
      variant={known ? 'filled' : 'outlined'}
      label={key}
      onDelete={remove}
      contentEditable={false}
      data-var-key={key}
      sx={[
        chipSx,
        !!(format & BOLD) && { fontWeight: 900 },
        !!(format & ITALIC) && { fontStyle: 'italic' },
        !!(format & STRIKETHROUGH) && { textDecoration: 'line-through' },
      ]}
    />
  )
  return <Tooltip title={known ? known.label : `Biến “${key}” chưa được khai báo`}>{chip}</Tooltip>
}

/** Source text of a directive the contract does not allow, for display only. */
function describeDirective(node: Directives): string {
  const colons = node.type === 'textDirective' ? ':' : node.type === 'leafDirective' ? '::' : ':::'
  const label = (node.children as Array<{ type: string; value?: string }>)
    .map((c) => (c.type === 'text' ? (c.value ?? '') : '…'))
    .join('')
  return `${colons}${node.name}${label ? `[${label}]` : ''}${node.attributes && Object.keys(node.attributes).length ? '{…}' : ''}`
}

export function UnsupportedDirectiveEditor({ mdastNode }: DirectiveEditorProps<Directives>) {
  const remove = useLexicalNodeRemove()
  return (
    <Tooltip title="Cú pháp không được hỗ trợ. Nếu bạn muốn hiển thị dấu hai chấm, hãy gõ \: trong chế độ nguồn.">
      <Chip
        size="small"
        color="warning"
        variant="outlined"
        label={describeDirective(mdastNode)}
        onDelete={remove}
        contentEditable={false}
        sx={chipSx}
      />
    </Tooltip>
  )
}

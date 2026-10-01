import type { DirectiveDescriptor } from '@mdxeditor/editor'
import type { Directives, TextDirective } from 'mdast-util-directive'
import { placeholderKey } from '../body/remarkVars'
import { UnsupportedDirectiveEditor, VarChipEditor } from './directiveChips'

/** The only directive the contract knows: a text directive `var` whose label is exactly a valid key and has no attributes. */
export const varDirectiveDescriptor: DirectiveDescriptor<TextDirective> = {
  name: 'var',
  type: 'textDirective',
  testNode: (node: Directives) => placeholderKey(node) !== null,
  attributes: [],
  hasChildren: false,
  Editor: VarChipEditor,
}

/**
 * Fallback for every other directive that `remark-directive` finds in the markdown (`:b`, `:var[bad key]`, `::x`, ...).
 * Without a descriptor MDXEditor throws "Parsing of the following markdown structure failed" and drops the whole
 * document into its error view; with `escapeUnknownTextDirectives` it silently deletes the `[label]` and `{attrs}`.
 * This descriptor keeps the node untouched (so nothing is lost on export) and shows it as a deletable warning chip.
 * The server validator rejects it on save.
 */
export const unsupportedDirectiveDescriptor: DirectiveDescriptor<Directives> = {
  name: 'unsupported',
  testNode: (node: Directives) => placeholderKey(node) === null,
  attributes: [],
  hasChildren: false,
  Editor: UnsupportedDirectiveEditor,
}

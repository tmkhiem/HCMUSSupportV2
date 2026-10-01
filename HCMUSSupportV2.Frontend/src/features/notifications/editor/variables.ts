import type { TextDirective } from 'mdast-util-directive'
import { createContext } from 'react'

/** A variable a notification declares (`notifications.variables`): the key used in `:var[key]` and its human label. */
export interface NotificationVariable {
  key: string
  label: string
}

/** The variables the editor offers. Chips whose key is not in here are drawn as errors (the server rejects them). */
export const VariableCatalogContext = createContext<readonly NotificationVariable[]>([])

/** The directive node exactly as it is stored: `:var[Key]`, children = one text node, no attributes. */
export function variableDirectiveNode(key: string): TextDirective {
  return { type: 'textDirective', name: 'var', attributes: {}, children: [{ type: 'text', value: key }] }
}

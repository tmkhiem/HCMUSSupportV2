import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { Fragment } from 'react'
import type { ComponentProps, ElementType } from 'react'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import { bodySx } from './bodyStyles'
import remarkVars from './remarkVars'
import type { VarsRow } from './remarkVars'
import { isAllowedImageUrl, isSafeLinkUrl } from './urls'

export interface NotificationBodyProps {
  /** `body_md`: GFM with `:var[Key]` placeholders (docs/notification-markdown.md). */
  markdown: string
  /** The recipient's value rows. Several rows render one block per row; none renders the body once with every value `—`. */
  vars?: VarsRow[] | null
}

const HEADING_ELEMENT: Record<number, ElementType> = { 1: 'h2', 2: 'h3', 3: 'h4', 4: 'h5', 5: 'h6', 6: 'h6' }

/** Markdown `#` becomes `<h2>`: the page already owns the single `<h1>` (the notification title). */
const heading = (level: number): Components['h1'] =>
  function Heading({ children }) {
    return <Box component={HEADING_ELEMENT[level]}>{children}</Box>
  }

function alignOf(style: ComponentProps<'td'>['style']): ComponentProps<typeof TableCell>['align'] {
  const align = style?.textAlign
  return align === 'left' || align === 'right' || align === 'center' ? align : undefined
}

const components: Components = {
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  h5: heading(5),
  h6: heading(6),
  a({ href, children }) {
    // Unsafe or missing targets (e.g. `javascript:`) lose the link and keep the text.
    if (!isSafeLinkUrl(href)) return <span>{children}</span>
    return (
      <Link href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </Link>
    )
  },
  img({ src, alt, title }) {
    // Only files served by this app. Anything else (remote tracking pixels, data: URIs) is not rendered at all.
    if (!isAllowedImageUrl(typeof src === 'string' ? src : undefined)) return null
    return <img src={src as string} alt={alt ?? ''} title={title} loading="lazy" />
  },
  table({ children }) {
    return (
      <TableContainer sx={{ bgcolor: 'rgba(38, 50, 56, 0.04)', borderRadius: 1, maxWidth: '100%' }}>
        <Table size="small">{children}</Table>
      </TableContainer>
    )
  },
  thead: ({ children }) => <TableHead>{children}</TableHead>,
  tbody: ({ children }) => <TableBody>{children}</TableBody>,
  tr: ({ children }) => <TableRow>{children}</TableRow>,
  th: ({ children, style }) => <TableCell align={alignOf(style)}>{children}</TableCell>,
  td: ({ children, style }) => <TableCell align={alignOf(style)}>{children}</TableCell>,
  input({ checked, type }) {
    // GFM task list item: a read-only box, never interactive.
    return type === 'checkbox' ? <input type="checkbox" checked={!!checked} readOnly disabled /> : null
  },
}

/** Defence in depth: react-markdown's own URL pass uses the same allow-list as the `a` and `img` components. */
const urlTransform = (url: string) => (isSafeLinkUrl(url) ? url : '')

/**
 * Shared renderer for a notification body: inbox detail, editor preview and admin preview.
 *
 * Safety model (PLAN 3.3): raw HTML is skipped; `:var[key]` is replaced by a *text node* (a value is never re-parsed);
 * links are allow-listed and open in a new tab; images only from `/api/files/{uuid}`.
 */
export default function NotificationBody({ markdown, vars }: NotificationBodyProps) {
  const rows: Array<VarsRow | null> = vars && vars.length > 0 ? vars : [null]
  return (
    <Box data-testid="notification-body">
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 && <Divider sx={{ my: 3 }} data-testid="vars-row-divider" />}
          <Box sx={bodySx} data-testid="notification-body-block">
            <Markdown
              skipHtml
              components={components}
              remarkPlugins={[remarkGfm, remarkDirective, [remarkVars, { vars: row }]]}
              urlTransform={urlTransform}
            >
              {markdown}
            </Markdown>
          </Box>
        </Fragment>
      ))}
    </Box>
  )
}

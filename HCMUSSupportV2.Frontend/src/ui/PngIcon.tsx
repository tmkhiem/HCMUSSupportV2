import Box from '@mui/material/Box'
import type { BoxProps } from '@mui/material/Box'

/** Names of the PNGs under `public/icons/<size>/`. */
export type PngIconName =
  | 'access-time'
  | 'account-tree'
  | 'add'
  | 'admin-panel-settings'
  | 'airplane-departure'
  | 'apartment'
  | 'archive'
  | 'arrow-back'
  | 'arrow-drop-down'
  | 'arrow-outward'
  | 'article'
  | 'attach-file'
  | 'bell'
  | 'biotech'
  | 'book-open'
  | 'border-color'
  | 'briefcase'
  | 'calendar-month'
  | 'category'
  | 'check'
  | 'check-circle'
  | 'checklist'
  | 'class'
  | 'clear'
  | 'clock'
  | 'close'
  | 'code'
  | 'construction'
  | 'content-copy'
  | 'cup'
  | 'data-object'
  | 'delete'
  | 'description'
  | 'difference'
  | 'document'
  | 'document-alt'
  | 'done-all'
  | 'download'
  | 'edit'
  | 'edit-note'
  | 'emoji-events'
  | 'error-outline'
  | 'event-available'
  | 'event-repeat'
  | 'expand-less'
  | 'expand-more'
  | 'fact-check'
  | 'filter-list'
  | 'format-align-center'
  | 'format-align-justify'
  | 'format-align-left'
  | 'format-align-right'
  | 'format-bold'
  | 'format-clear'
  | 'format-color-text'
  | 'format-indent-decrease'
  | 'format-indent-increase'
  | 'format-italic'
  | 'format-list-bulleted'
  | 'format-list-numbered'
  | 'format-quote'
  | 'format-size'
  | 'format-underlined'
  | 'google'
  | 'graduation-hat'
  | 'groups'
  | 'history'
  | 'horizontal-rule'
  | 'image'
  | 'info'
  | 'inventory'
  | 'key'
  | 'keyboard-double-arrow-down'
  | 'keyboard-double-arrow-left'
  | 'keyboard-double-arrow-right'
  | 'keyboard-double-arrow-up'
  | 'label'
  | 'layers'
  | 'light-bulb'
  | 'link'
  | 'link-off'
  | 'lock'
  | 'logout'
  | 'mail'
  | 'mark-email-unread'
  | 'menu'
  | 'military-tech'
  | 'money'
  | 'money-bag'
  | 'money-salary'
  | 'more-horiz'
  | 'more-vert'
  | 'notifications'
  | 'open-in-new'
  | 'payments'
  | 'percent'
  | 'person'
  | 'person-add'
  | 'person-alt'
  | 'person-outline'
  | 'person-remove'
  | 'phone'
  | 'picture-as-pdf'
  | 'profile-card'
  | 'profile-card-alt'
  | 'push-pin'
  | 'redo'
  | 'restore'
  | 'save'
  | 'schedule-send'
  | 'school'
  | 'search'
  | 'search-off'
  | 'send'
  | 'settings'
  | 'star'
  | 'strikethrough'
  | 'subscript'
  | 'superscript'
  | 'sync'
  | 'table'
  | 'table-chart'
  | 'test-tube'
  | 'text-snippet'
  | 'trending-up'
  | 'undo'
  | 'upload'
  | 'verified-user'
  | 'visibility'
  | 'warning-amber'

const SIZES = [24, 32, 48, 64, 96] as const

/** Smallest shipped size that is at least `px` (the largest when `px` is bigger than all of them). */
function sizeFor(px: number): number {
  return SIZES.find((s) => s >= px) ?? SIZES[SIZES.length - 1]
}

const url = (name: PngIconName, px: number) => `${import.meta.env.BASE_URL}icons/${sizeFor(px)}/${name}.png`

export interface PngIconProps extends Omit<BoxProps<'img'>, 'component' | 'src' | 'srcSet' | 'children'> {
  name: PngIconName
  /** CSS pixel size (width and height). The 1x and 2x sources are picked from the shipped sizes. */
  size?: number
}

/**
 * A bitmap icon from `public/icons`. Decorative by default (`alt=""`); pass `alt` when it carries meaning.
 * `1x`/`2x` sources keep it sharp on high-density screens without shipping more than needed.
 */
export default function PngIcon({ name, size = 24, alt = '', sx, ...rest }: PngIconProps) {
  return (
    <Box
      component="img"
      src={url(name, size)}
      srcSet={`${url(name, size)} 1x, ${url(name, size * 2)} 2x`}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      {...rest}
      sx={[{ display: 'block', flexShrink: 0, width: size, height: size, objectFit: 'contain' }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  )
}

/** URL rules of the notification Markdown contract (docs/notification-markdown.md, "Links and images"). */

const SCHEME = /^([a-z][a-z0-9+.-]*):/i
const LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])
const FILE_IMAGE = /^\/api\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
// eslint-disable-next-line no-control-regex
const WHITESPACE_OR_CONTROL = /[\s\u0000-\u001f\u007f]/

/**
 * Link target allowed in a body: `http`, `https`, `mailto`, `tel`, a root-relative path (`/x`, not `//host`) or a
 * `#fragment`. Allow-list on purpose: `javascript:`, `data:`, `vbscript:`, `file:` and anything unknown are refused, as
 * is any URL with whitespace or control characters (browsers strip those, so `java\tscript:` would otherwise slip through).
 */
export function isSafeLinkUrl(url: string | undefined | null): url is string {
  if (!url || WHITESPACE_OR_CONTROL.test(url)) return false
  const scheme = SCHEME.exec(url)
  if (scheme) return LINK_SCHEMES.has(scheme[1].toLowerCase())
  if (url.startsWith('//')) return false
  return url.startsWith('/') || url.startsWith('#')
}

/** Image source allowed in a body: exactly `/api/files/{lowercase uuid}`. No query, no host, no other path. */
export function isAllowedImageUrl(url: string | undefined | null): url is string {
  return !!url && FILE_IMAGE.test(url)
}

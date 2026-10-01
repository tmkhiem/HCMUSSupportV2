/** Where the login flow sends the user afterwards. Only same-origin app paths are accepted (no open redirects). */
export function safeReturnUrl(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || !raw.startsWith('/')) return fallback
  // `//host` and `/\host` are protocol-relative / browser-normalised to another origin.
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  if (/^\/(dang-nhap|login)([?#]|$)/.test(raw)) return fallback
  return raw
}

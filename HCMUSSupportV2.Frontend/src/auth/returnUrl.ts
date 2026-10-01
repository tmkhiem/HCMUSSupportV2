/** Where the login flow sends the user afterwards. Only same-origin app paths are accepted (no open redirects). */
export function safeReturnUrl(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || !raw.startsWith('/')) return fallback
  // `//host` and `/\host` are protocol-relative / browser-normalised to another origin.
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  if (raw === '/dang-nhap' || raw.startsWith('/dang-nhap?') || raw.startsWith('/dang-nhap#')) return fallback
  return raw
}

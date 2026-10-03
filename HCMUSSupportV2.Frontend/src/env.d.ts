/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev only: `1` serves a synthetic signed-in user (T0001, editor + admin) so the shell can be viewed without a backend. */
  readonly VITE_MOCK_AUTH?: string
}

/** Content hash of `public/bg-logo.svg` (vite.config.ts), appended as `?v=` so a replaced logo is never served from a stale cache. */
declare const __BG_LOGO_VERSION__: string

interface ImportMeta {
  readonly env: ImportMetaEnv
}

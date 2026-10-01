/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev only: `1` serves a synthetic signed-in user (T0001, editor + admin) so the shell can be viewed without a backend. */
  readonly VITE_MOCK_AUTH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

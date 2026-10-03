/** One declared placeholder of a post. `key` is a valid v2 variable key; `column` is the v1 column it came from. */
export interface Variable {
  key: string
  label: string
  type: 'text'
}

/** The payload of `POST /api/integration/v1/legacy/news` (one element of `posts`). */
export interface LegacyPost {
  key: string
  title: string
  publishedOn: string
  bodyMd: string
  variables: Variable[]
  rows: Record<string, Record<string, string>[]>
  seriesName: string | null
  tagNames: string[]
  audienceAll: boolean | null
  pinnedUntil: string | null
}

/** What the tool learned about one file besides the payload (never posted). */
export interface PostInfo {
  file: string
  rows: number
  employees: number
  unusedColumns: number
  warnings: string[]
}

export interface BuiltPost {
  post: LegacyPost
  info: PostInfo
}

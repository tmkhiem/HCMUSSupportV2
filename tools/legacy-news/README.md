# legacy-news

D15 step 4 of [docs/LEGACY-MIGRATION.md](../../docs/LEGACY-MIGRATION.md): converts the v1 news posts (baked HTML) into v2 GFM
Markdown posts and sends them to `POST /api/integration/v1/legacy/notifications`.

- Input: the v1 data repo (`tmkhiem/SupportHCMUSData`, cloned **outside** this repo): `notifications/news/*.json` and
  `notifications/request-update-info/request-update-info-0.json`. `*.old`, `backup/` and `*-test.json` are ignored.
- Output: one payload item and one review preview per post, plus `report.md` and `report.json`.
- Node 24, ESM, TypeScript run with `tsx`. Dependencies: `turndown` + `turndown-plugin-gfm` (HTML to Markdown),
  `@mixmark-io/domino` (the DOM turndown uses on Node, also used for cleaning), `markdown-it` (the client-side validator).

```
cd tools/legacy-news
npm install

# 1. convert (writes outside the repo; the default is %LOCALAPPDATA%\HCMUSSupportV2\legacy\news)
npm run convert -- --path C:\Users\me\Documents\SupportHCMUSData [--out <dir>] [--banner-pinned-until 2027-12-31T23:59:59+07:00]

# 2. read <out>\report.md, open a few <out>\preview\*.md, then validate against the server without writing
$env:LEGACY_API_TOKEN = "<token of an API client with scope legacy.import>"
npm run post -- --api http://localhost:5161 --dry-run [--in <out>] [--only news/2025-05-15-NLTX-2025.json,request-update-info]

# 3. for real
npm run post -- --api http://localhost:5161

# convert + post in one go (same options)
npm run all -- --path <SupportHCMUSData> --api http://localhost:5161 [--dry-run]

npm test            # vitest, synthetic fixtures only
npm run typecheck
```

Step 4 needs steps 1 and 2 of the migration first (employees and emails exist). It is idempotent: a second run reports
`unchanged`.

## PII

The v1 files and everything this tool writes contain personal data (names, MSCBs, salary values).

- `convert` **refuses an out dir inside a git work tree** (any parent with a `.git`). Nothing is written then.
- The console shows counts and flags only. `report.md` / `report.json` hold titles, tags, flags and counts, never values.
  `<out>\preview\*.md` and `<out>\posts\*.payload.json` do contain recipients: keep them out of the repo and out of chats.
- Test fixtures are synthetic. Never paste real v1 content into the repo.
- `post` prints totals (and the keys and codes of rejected posts). The server's detailed report, which lists MSCBs, goes to
  `<out>\post-report.json`.

## What `convert` writes

```
<out>/posts/<name>.payload.json    one item of { posts: [...] }, as in the contract
<out>/preview/<name>.md            flags, variables, Markdown source and a sample rendering for the first recipient
<out>/report.md, report.json       totals, flags by kind, tag/series guesses, one line per post
```

## Conversion rules

**Body.** The template HTML is parsed with domino, cleaned, then converted by turndown. Word/Outlook junk is removed
(`mso-*` styles, `<o:p>`, conditional comments, `class=Mso*`, empty spans); bold, italic and strike given as inline styles on
spans become Markdown; non-breaking and zero-width spaces and entities are normalised. Kept: headings, bold, italic,
strike, lists (nested, with unclosed `<li>`, Word's `<li><div>` wrappers and bare text inside `<ul>` repaired), links
(`http`, `https`, `mailto` only; whitespace inside the URL is repaired), blockquotes and simple tables as GFM tables.
Runs of `<br>` become paragraph breaks; a single `<br>` becomes `\` + newline. Raw HTML is never written: `<` and other
Markdown-significant characters in text are escaped. Every body is checked by a client-side copy of the server validator
(`src/validate.ts`, including the contract's 54 test vectors) and a failure is reported as `invalid_body`.

**Placeholders.** v1 replaced the exact text of each column name (`{Col}`, but also `{0}`, `(7)`, `{9x}`) in `header` and
`template`. Every column name found in `values` becomes `:var[Key]`, also when Word split it across tags
(`{<span>Col</span>}`). The key is the column name without braces, transliterated (Vietnamese diacritics, đ), joined in
PascalCase, with bad characters dropped, `Cot` prefixed when it does not start with a letter (`{0}` becomes `Cot0`), cut to
64 characters and deduplicated (`HoTen`, `HoTen_2`). `variables` lists the columns used in the body in order of use, then the
unused ones (kept, counted as `unused_columns`).

- `label`: the words in front of the placeholder in the body ("Hệ số lương: :var[K]" gives "Hệ số lương"), because v1 columns
  are often bare letters or numbers. With no usable words it is the column name (`Cột 7`). Equal labels get the column name
  appended.
- `type`: `date` for dd/MM/yyyy, `number` for plain integers of up to 3 digits (so MSCBs and insurance numbers stay text) and
  decimals, `money` for thousands separators or a money-like label, else `text` (at least 90 % of the values must agree).
- A `{name}` in the body that is no column stays literal text and is flagged `unknown_placeholder`.
- A colon right before a placeholder gets a space (`Tên:{X}` becomes `Tên: :var[X]`), because the directive is not recognised
  after a colon. A `{` right after one is escaped.

**Title.** From `header` (tags and entities stripped). Placeholders in it are dropped (`title_placeholder`). An empty header
falls back to the file name (`title_from_filename`). The banner is titled "Cập nhật thông tin cá nhân".

**publishedAt.** The date at 08:00 `+07:00`. `datestr` is used when it is within 3 days of the file-name date; otherwise the
file-name date is used and `date_mismatch` is flagged.

**Recipients.** `{MSCB: rows}` with column names mapped to variable keys. Values are trimmed, inner whitespace is collapsed
and entities are decoded. Empty values are left out. A value that holds HTML is reduced to its text (`<br>` and the boundary
between `<li>` items become ` ; `) and flagged `recipient_html`, because v2 renders variables as text. Several rows for one
MSCB stay several rows. `audienceAll` is false and `markRead` true for every news post.

**Tags and series.** Guessed from the file name, title and the start of the body with the keyword table in
`src/classify.ts` (first match wins): vượt khung, phụ cấp ưu đãi, thâm niên / TNNG, nâng lương trước hạn / NLS / đề nghị
ĐHQG, NLTX / nâng bậc lương, đánh giá xếp loại, khảo sát, sáng kiến, NCKH, CCCD / BHXH, else Chung. The report lists every
guess with the rule and which inputs matched. `title_disagrees` flags a title that points to another rule than the content
(v1 sometimes copied a header from another post).

**Banner.** `request-update-info-0.json` becomes `legacyKey: request-update-info`, `audienceAll: true`,
`recipients: null`, `markRead: false`, tag Chung, no series, `pinnedUntil` from `--banner-pinned-until`.

## Flags

| Kind | Severity | Meaning |
|---|---|---|
| `merged_cells`, `nested_table` | error | A table with `colspan`/`rowspan`, or a table inside a table (flattened to text). Check the preview. |
| `image` | error | An image was removed (v2 images must be uploaded files). |
| `html_removed` | error | An element with no Markdown form (`iframe`, `svg`, form controls...) was removed. |
| `placeholder_in_url` | error | A placeholder inside a link URL; the link was dropped, its text kept. |
| `invalid_body` | error | The client-side validator found a contract violation (detail: the code). The server would reject it. |
| `empty_body`, `no_recipients` | error | Nothing to show, or nobody to send to. |
| `link_dropped` | warn | A link with another scheme (or a relative URL) was unwrapped to its text. |
| `table_cell_blocks` | warn | A list or heading inside a table cell was flattened to text. |
| `code_block` | warn | A `<pre>` was turned into a paragraph. |
| `unknown_placeholder` | warn | A `{name}` in the body that no column explains. |
| `title_placeholder`, `title_from_filename`, `title_truncated`, `title_disagrees` | warn | See Title and Tags. |
| `date_mismatch` | warn | `datestr` is far from the file-name date; the file name was used. |
| `recipient_html` | warn | Values with HTML were reduced to text. |
| `date_differs`, `unused_columns`, `bare_placeholder`, `layout_table`, `title_html` | info | `bare_placeholder`: a placeholder alone in a list item or paragraph shows a dash when its value is empty. |

## `post`

Posts `{ posts: [...] }` as gzip JSON to `/api/integration/v1/legacy/notifications` (`?dryRun=true` with `--dry-run`) with
`Authorization: ApiKey $LEGACY_API_TOKEN`. Posts are packed into requests of at most 8 MiB before compression (the server
limit is 20 MB after decompression); a bigger post goes alone. 502, 503, 504 and connection errors are retried twice (the
endpoint is idempotent). The exit code is 1 when a request failed or any post was `rejected`, 2 for a usage error.

## Tests

`npm test` runs 170+ vitest cases: Word junk, entities, placeholders (including tag-split ones), keys, types, tables and
merged cells, titles, dates, recipients, tag guesses, the banner, the out-dir guard, the batch splitter, the contract's
Markdown vectors, a conversion run on a synthetic data repo and `post` against a local `node:http` stub.

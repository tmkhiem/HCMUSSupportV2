# Notification Markdown contract

Status: D07a. This is the contract between the editor (MDXEditor, D09), the renderer (`NotificationBody`, D08) and the
server validator (Markdig, D07). PLAN section 3.3 gives the decision (v2 stores GFM Markdown, placeholders are text
directives, raw HTML is off); this file makes it exact. The backend implements section 4 and must pass the vectors in
section 8. The frontend behaviour in sections 5 to 7 is covered by tests in `HCMUSSupportV2.Frontend`
(`NotificationBody.test.tsx`, `mdxRoundTrip.test.tsx`, `e2e/markdown.spec.ts`).

`notifications.body_md` is a UTF-8 string, at most 100 000 characters, in CommonMark + the GFM subset below, with one
extension: the `var` text directive.

## 1. Allowed syntax

| Construct | Syntax | Notes |
|---|---|---|
| Paragraph, soft break, hard break | text; newline; `\` + newline or two trailing spaces | A soft break renders as a space (CommonMark). The editor writes hard breaks as `\` + newline. |
| Headings | ATX `#` to `######` (setext also accepted) | Rendered one level lower (`#` is an `h2`) because the page owns the `h1`. The editor offers levels 1 to 4. |
| Emphasis | `*i*`, `**b**`, `~~s~~`, `` `code` `` | `_` and `__` are accepted when read; the editor writes `*`. No underline (see 3). |
| Lists | `-`, `*`, `+` bullets; `1.` and `1)` numbers; nesting; task items `- [ ]` / `- [x]` | The editor writes `-` and renumbers from 1. Task items render as read-only boxes; the editor has no button for them. |
| Quote, thematic break | `> q`; `---`, `***`, `___` | The editor writes `***`. |
| Table | GFM pipe table with a delimiter row; `:--`, `:-:`, `--:` alignment | Cells hold inline content only: no line breaks, no block content. A literal `\|` is `\\|`. |
| Link | `[text](url)`, bare `http(s)://...` / `www....`, `<https://...>` | URL rule in section 2. The editor turns bare URLs and autolinks into `[url](url)`. Titles allowed. |
| Image | `![alt](/api/files/{uuid})`, optional `"title"` | URL rule in section 2. No width/height, no `<img>`. |
| Placeholder | `:var[Key]` | Section 4. |
| Escapes | any ASCII punctuation after `\` | `\:`, `\<`, `\[`, `\*` ... are literal characters. |

Allowed anywhere inline text is: paragraph, heading, list item, quote, table cell, and inside emphasis, strong, strikethrough
and link text.

## 2. Links and images

- **Link URL** (after the parser has decoded it): scheme `http`, `https`, `mailto` or `tel` (case-insensitive); or a
  root-relative path starting with exactly one `/`; or a `#fragment`. Anything else is invalid: `javascript:`, `data:`,
  `vbscript:`, `file:`, `//host`, a relative path like `a/b`, an unknown scheme, and any URL containing whitespace or
  control characters. Reference-style links and link reference definitions (`[a]: url`) are not allowed.
- **Image URL**: exactly `/api/files/` + a lowercase hyphenated UUID (`^/api/files/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`).
  No host, no query string, no trailing slash, no other path. The file must exist and be an image the author may use
  (D07 checks that against `files`; the contract only fixes the syntax).
- Rendering: links open in a new tab with `rel="noopener noreferrer"`. A link that fails the rule renders as its text with
  no `<a>`. An image that fails the rule renders as nothing.

## 3. Forbidden

Each of these makes the body invalid (error code in brackets, for the validator's problem details):

1. Raw HTML of any kind, block or inline, including comments, `<u>`, `<br>`, `<img>`, `<script>`, `<details>` (`RAW_HTML`).
   Autolinks `<https://x>` are not HTML and stay allowed. A literal `<` is written `\<` (the editor does this); a `<` that does
   not start an HTML tag or autolink (`a < b`, `5<6`) is plain text and valid.
2. Fenced and indented code blocks (`CODE_BLOCK`). Inline code is fine.
3. Any directive other than a valid `:var[Key]` (`UNKNOWN_DIRECTIVE`), defined in section 4.
4. Footnotes, math, front matter, definition lists, `==highlight==`, `<sub>`/`<sup>`, underline (`UNSUPPORTED_SYNTAX`).
   Underline is forbidden because MDXEditor can only write it as `<u>`; the editor strips it (Ctrl+U does nothing).
5. A link or image URL that breaks section 2 (`FORBIDDEN_URL`).
6. A placeholder key that is not declared in `variables` (`UNDECLARED_PLACEHOLDER`, checked by D07, not by syntax).
7. More than 100 000 characters (`TOO_LONG`).

## 4. The `var` text directive

```
:var[Key]
```

- The directive name is exactly `var` (lowercase); the label is exactly one plain-text run, the key; no attributes.
- **Key**: `^[A-Za-z][A-Za-z0-9_]{0,63}$`: letters, digits and underscore, first character a letter, 1 to 64 characters,
  case-sensitive. The first-letter rule is not cosmetic: a key such as `_a_` would parse as emphasis inside the label
  (`:var[_a_]` is read as `:var[<em>a</em>]`). Keys in `notifications.variables[].key` follow the same pattern.
- It is recognised as a placeholder where the character before the `:` is not `:` and not an unescaped backslash, in inline
  text only (section 1). It is not recognised inside inline code, link URLs, or image alt/title text, and `\:var[Key]` is the
  literal text `:var[Key]`.
- **Invalid** (all give `UNKNOWN_DIRECTIVE`): `:var[]`, `:var[bad key]`, `:var[**Key**]`, `:var[1Key]`, `:var[Key]{a=1}`,
  `:var{a=1}`, `:var` with a label that is not a single valid key, and `::var[Key]` or `:::var` (leaf and container directives).
  Any other `:name[label]` or `:name{attrs}` (a name starts with a letter and continues with letters, digits, `-` or `_`) is
  invalid as well. `::name` or `:::name` at the start of a line is invalid.
- **Bare colons are text.** `:name` without a label or attributes, as in `a:b`, `Ghi chú:abc`, `10:30` and `mailto:x`, is
  ordinary text and valid. (remark-directive would call `a:b` a directive; the renderer prints it back as typed and the
  editor shows it as a warning chip, which is why the editor escapes such colons as `a\:b` when you type them.)
- **Extraction**: `placeholders` is the ordered list of keys in document order with duplicates removed. `content_text`
  and `summary` ignore the directive (it contributes no text).

## 5. Rendering (`NotificationBody`)

- `react-markdown` + `remark-gfm` + `remark-directive` + `remarkVars`; `skipHtml`; no `rehype-raw`.
- Each valid `:var[Key]` becomes a **text node** with the recipient's value, so a value is never parsed as Markdown or HTML.
  `<img onerror>`, `**bold**`, `[x](javascript:...)`, `# heading` and `:var[Other]` inside a value are shown literally.
- A value is looked up with an own-property check (`constructor` and `toString` are legal keys and are simply missing).
- **Missing value** renders as `—` (U+2014): the key is absent from the row, or the value is `null`, empty or only
  whitespace. With no `vars` at all the body renders once with every placeholder `—`.
- **Multi-row** (`vars` has several row objects): one rendered block per row, in order, with a divider between blocks. Each
  block is the whole body with that row's values.
- Anything the directive parser recognises that is not a valid placeholder prints as its literal source text (`:b`,
  `:var[bad key]`, `::x`, `:::note` ...). The server rejects it on save, so this only matters for legacy or hand-edited text.
- Markdown headings render one level lower; tables use the theme's `MuiTableCell` head style; `<script>` and event
  handlers cannot occur (HTML is dropped: an inline tag is removed and the text between tags stays as inert text; an HTML
  block is removed with its content).

## 6. Editor behaviour (MDXEditor 4.3.1, spike findings)

Configuration: `suppressHtmlProcessing`, `toMarkdownOptions.bullet = '-'`, plugins for headings, lists, quote, thematic break,
link and link dialog, table, image (own upload-only dialog), directives, markdown shortcuts, diff/source; no code block,
JSX, frontmatter or admonition plugin. Two extra visitors and one text transform (`contractPlugin.ts`).

**Why `suppressHtmlProcessing: true`.** Without it MDXEditor parses the body as MDX: a lone `<` or `a<b` is a parse error,
`<b>` and `<u>` are silently converted to formatting, and `<https://x>` autolinks fail with "Unexpected character `/`". With
it, `<` is plain text and is exported as `\<`, raw HTML is a clean parse error, and autolinks work: the same reading as
CommonMark and Markdig. `{` and `}` are plain text in both modes.

What the editor does to text that is **typed** in rich-text mode (verified in a browser):

| Typed | Written to Markdown |
|---|---|
| `Họp 10:30 ngày 5/6`, `tỉ lệ 3:2` | unchanged (a colon before a digit is not a directive) |
| `a:b`, `Ghi chú:abc` | `a\:b`, `Ghi chú\:abc` (a colon before a letter is escaped) |
| `cho {biến} và }{` | unchanged |
| `a < b > c` | `a \< b > c` (`<` is always escaped, `>` is not) |
| `<b>x</b> <script>` | `\<b>x\</b> \<script>` (plain text, not HTML) |
| `:var[HeSoLuong]` | `\:var\[HeSoLuong]`: **typing the syntax is literal text; only the "Chèn biến" menu makes a placeholder** |
| `**x**` | the markdown shortcut turns it into bold; `*y*`, `_y_` and `` `z` `` likewise |
| `https://example.test/p?a=1` | `[https://example.test/p?a\=1](https://example.test/p?a=1)` (auto-linked) |
| `a==b==c`, `![i](u)` | `a\=\=b\=\=c`, `\![i](u)` |

**Pasted** plain text is inserted literally: `**b**` becomes `\*\*b\*\*`, `:var[X]` becomes `\:var\[X]`, and a pasted Markdown
document (`# h`, `- a`, a table) comes out escaped, one paragraph per line. Use source mode to paste Markdown. Pasted HTML
keeps bold, italic, strikethrough and links, and drops underline, sub/superscript, colours and `<script>`.

What happens to Markdown that is **loaded** (all asserted in `mdxRoundTrip.test.tsx`):

- Unchanged: everything in section 1 except the rows below, including `:var[Key]` alone, in sentences, headings, lists,
  quotes, table cells and link text, adjacent (`:var[A]:var[A]`), glued to letters (`a:var[A]b`), and wrapped in
  `**`, `*`, `~~` or `***`.
- Rewritten to an equal form: `*`/`+` bullets become `-`; `1)` and any start number become `1.` renumbered from 1; two-space
  hard breaks become `\`; a bare URL or `<url>` becomes `[url](url)`; table columns are padded to equal width and `:--`
  alignment padding changes; `---` becomes `***`; needless escapes (`\]`) are dropped; an indented code block becomes a paragraph;
  attributes of an unknown directive are re-quoted (`{y=1}` to `{y="1"}`).
- Rewritten **lossily by design**: `<u>x</u>` becomes `x`, `==x==` becomes `x`. The text transform strips underline, subscript,
  superscript and highlight from every text node.
- Refused with `onError` (the wrapper then shows an alert and a plain text box so the author can fix the text and press
  "Thử lại"): raw HTML (`<z>`, `<b>`, `<div>`, comments, `<script>`), fenced code blocks. Raw HTML inside a table cell is
  *thrown* from the nested editor instead of reported; the wrapper catches that with an error boundary.

**Limitations and decisions**

1. **Formatting around a placeholder was lost** by plain MDXEditor (`**:var[X]**` came back as `:var[X]`) because a directive
   is a decorator node and cannot carry a text format. `contractPlugin` fixes the round trip: the import visitor copies the
   parent format onto the directive (`data.format`) and the export visitor wraps it again in `strong`/`emphasis`/`delete`,
   re-using an open wrapper (`**a :var[X] b**` stays one run). The chip shows bold, italic or strike. The editor has no way
   to *apply* bold to a chip; it only preserves what was loaded.
2. **Line breaks.** MDXEditor writes Shift+Enter as a bare newline, which CommonMark renders as a space. `contractPlugin`
   exports line breaks as `\` + newline instead. A soft break typed in source mode stays a soft break.
3. **Underline** is hidden from the toolbar and stripped (above). **Image**: MDXEditor's dialog accepts any URL, so
   `NotificationImageDialog` replaces it: upload (through `onUploadImage`, which must return `/api/files/{uuid}`) and alt text only;
   resize is disabled because it would write `<img>`. The link dialog still accepts any URL: the server validator and the
   renderer enforce section 2.
4. **Unknown directives** crash plain MDXEditor ("Parsing of the following markdown structure failed") and with
   `escapeUnknownTextDirectives` silently lose the label and attributes. A fallback descriptor keeps the node untouched and
   shows a warning chip (deletable) so nothing is lost; the server rejects it.
5. **Table cells** are nested editors: their text reaches `onChange` when the cell loses focus, not on each keystroke (click
   Save only after the focus has moved, which a button click does). Line breaks inside a cell and raw HTML in a cell were not
   made to work: the contract forbids both.
6. The editor may rewrite the loaded text once on mount (bullets, table padding). `onChange` reports it with
   `meta.initialNormalize = true`; do not treat that as a user edit.
7. `[role=toolbar]` text and tooltips are translated in `viTranslation.ts`; icons are Material outlined icons.

## 7. Spike results (D07a)

| Check | Result |
|---|---|
| (a) `:var[HeSoLuong]` round-trips through `MDXEditor` and `getMarkdown()` unchanged | **Pass** in 29 shapes (vitest) and in the browser. Needed `contractPlugin` only for formatting wrapped around a chip. |
| (b) switching rich text -> source -> rich text, and the diff view, preserves it | **Pass** (Playwright, with a table and bold chip in the document; typing `:var[...]` in source mode becomes a chip). |
| (c) `{`, `}`, `<`, `>`, `:` typed or pasted are not mangled or turned into directives | **Pass** with `suppressHtmlProcessing`; the exact escaping is in the table above. `a:b` is escaped to `a\:b`; `10:30` is not. Typed `:var[X]` is text, never a placeholder. |
| (d) tables survive | **Pass**: load, cell edit (on blur), source mode, and chips inside cells. Columns get padded. |

The `:var[...]` text directive was kept: no alternative syntax was needed.

## 8. Test vectors for the server validator

`valid` means no error. `placeholders` is the ordered distinct keys. `text` is `content_text`: blocks (paragraph, heading,
list item, quote paragraph, table row) joined by `\n`; table cells of a row joined by a space; inline text with runs of
whitespace collapsed to one space and each block trimmed; a link contributes its text, an image its alt text, a placeholder
nothing. `summary` (not listed) is the first paragraph's `text`, cut at 200 characters on a word boundary.

| # | Markdown | Valid | Placeholders | Text / error |
|---|---|---|---|---|
| 1 | `Hệ số lương mới: :var[HeSoLuong]` | yes | `HeSoLuong` | `Hệ số lương mới:` |
| 2 | `:var[A]` | yes | `A` | (empty) |
| 3 | `:var[A]:var[B] và :var[A]` | yes | `A`, `B` | `và` |
| 4 | `**:var[HeSoLuong]**` | yes | `HeSoLuong` | (empty) |
| 5 | `a:var[A]b` | yes | `A` | `ab` |
| 6 | `:var[Ten_Day_Du] :var[a1] :var[x]` | yes | `Ten_Day_Du`, `a1`, `x` | (empty) |
| 7 | `:var[` + 64 letters + `]` | yes | that key | (empty) |
| 8 | `:var[` + 65 letters + `]` | no | - | `UNKNOWN_DIRECTIVE` |
| 9 | `:var[]` | no | - | `UNKNOWN_DIRECTIVE` |
| 10 | `:var[bad key]` | no | - | `UNKNOWN_DIRECTIVE` |
| 11 | `:var[1Key]` | no | - | `UNKNOWN_DIRECTIVE` |
| 12 | `:var[_a_]` | no | - | `UNKNOWN_DIRECTIVE` |
| 13 | `:var[**Key**]` | no | - | `UNKNOWN_DIRECTIVE` |
| 14 | `:var[Key]{a=1}` | no | - | `UNKNOWN_DIRECTIVE` |
| 15 | `::var[Key]` | no | - | `UNKNOWN_DIRECTIVE` |
| 16 | `:::note` + newline + `x` + newline + `:::` | no | - | `UNKNOWN_DIRECTIVE` |
| 17 | `:note[abc]{x=1}` | no | - | `UNKNOWN_DIRECTIVE` |
| 18 | `\:var[A]` | yes | none | `:var[A]` |
| 19 | `` `:var[A]` `` | yes | none | `:var[A]` |
| 20 | `Họp lúc 10:30 sáng` | yes | none | `Họp lúc 10:30 sáng` |
| 21 | `a:b và Ghi chú:abc` | yes | none | `a:b và Ghi chú:abc` |
| 22 | `Liên hệ mailto:a@b.vn` | yes | none | `Liên hệ mailto:a@b.vn` |
| 23 | `Dòng 1` + `\` + newline + `Dòng 2` | yes | none | `Dòng 1 Dòng 2` (hard break is whitespace) |
| 24 | `a < b và 5<6 và a > b` | yes | none | `a < b và 5<6 và a > b` |
| 25 | `cho {biến} và }{` | yes | none | `cho {biến} và }{` |
| 26 | `Có thẻ <b>đậm</b>` | no | - | `RAW_HTML` |
| 27 | `<script>alert(1)</script>` | no | - | `RAW_HTML` |
| 28 | `<!-- ghi chú -->` | no | - | `RAW_HTML` |
| 29 | `x<br>y` | no | - | `RAW_HTML` |
| 30 | `<u>gạch chân</u>` | no | - | `RAW_HTML` |
| 31 | `<https://example.test/x>` | yes | none | `https://example.test/x` |
| 32 | `[Trang](https://example.test/x "t")` | yes | none | `Trang` |
| 33 | `[a](mailto:a@b.vn) [b](tel:+84123) [c](/news/1) [d](#top)` | yes | none | `a b c d` |
| 34 | `[a](javascript:alert(1))` | no | - | `FORBIDDEN_URL` |
| 35 | `[a](JaVaScRiPt:alert(1))` | no | - | `FORBIDDEN_URL` |
| 36 | `[a](data:text/html;base64,AAAA)` | no | - | `FORBIDDEN_URL` |
| 37 | `[a](//evil.test)` | no | - | `FORBIDDEN_URL` |
| 38 | `[a](relative/path)` | no | - | `FORBIDDEN_URL` |
| 39 | `![ảnh](/api/files/0197a3c2-5b1e-7c4a-8d2f-3e9b6a1c4d5e)` | yes | none | `ảnh` |
| 40 | `![x](https://tracker.test/p.gif)` | no | - | `FORBIDDEN_URL` |
| 41 | `![x](/api/files/0197a3c2-5b1e-7c4a-8d2f-3e9b6a1c4d5e?w=1)` | no | - | `FORBIDDEN_URL` |
| 42 | `![x](/api/files/0197A3C2-5B1E-7C4A-8D2F-3E9B6A1C4D5E)` | no | - | `FORBIDDEN_URL` (uppercase) |
| 43 | `![x](/api/admin/secret.png)` | no | - | `FORBIDDEN_URL` |
| 44 | fenced block: three backticks, `code`, three backticks | no | - | `CODE_BLOCK` |
| 45 | four-space indented line `    code` after a blank line | no | - | `CODE_BLOCK` |
| 46 | `` `inline` `` | yes | none | `inline` |
| 47 | `[^1] text` + newline + `[^1]: note` | no | - | `UNSUPPORTED_SYNTAX` |
| 48 | `a ==hl== b` | no | - | `UNSUPPORTED_SYNTAX` |
| 49 | `[a][ref]` + newline + `[ref]: https://a.test` | no | - | `FORBIDDEN_URL` |
| 50 | `# Tiêu đề :var[A]` + blank + `- mục :var[B]` + blank + `> trích` | yes | `A`, `B` | `Tiêu đề` / `mục` / `trích` (three lines) |
| 51 | a pipe table, written out below the table | yes | `A` | two lines: `H K` and `x` |
| 52 | `- [ ] việc` + newline + `- [x] xong` | yes | none | `việc` / `xong` |
| 53 | `~~gạch~~ **đậm** *nghiêng*` | yes | none | `gạch đậm nghiêng` |
| 54 | body of 100 001 characters | no | - | `TOO_LONG` |

Row 51 written out, three lines: `| H | K |`, `| - | - |`, `| :var[A] | x |`.

Cross-checks the server performs with the notification, not on the Markdown alone: every key in `placeholders` must be in
`variables[].key` (`UNDECLARED_PLACEHOLDER`); every `variables[].key` matches the key pattern; image URLs must name a file the
author may reference. Variables that are declared but unused are allowed.

## 9. Frontend entry points

- `src/features/notifications/body/NotificationBody.tsx`: `{ markdown, vars?: Array<Record<string,string>> | null }`.
- `src/features/notifications/body/remarkVars.ts`: the plugin and `VAR_KEY_PATTERN`; `urls.ts`: `isSafeLinkUrl`, `isAllowedImageUrl`.
- `src/features/notifications/editor/LazyNotificationMarkdownEditor.tsx`: use this from pages (own ~1.4 MB chunk, 457 kB gzip,
  plus 50 kB CSS; the inbox never loads it). Props: `value`, `onChange(markdown, { initialNormalize })`, `variables: {key,label}[]`,
  `onUploadImage(file) => Promise<string>`, `diffMarkdown`, `readOnly`, `minHeight`.
- `src/features/notifications/editor/MarkdownPreviewPane.tsx`: `{ markdown, vars, recipientLabel }`; D09 supplies the chosen
  MSCB's rows.
- `/dev/markdown` (dev server only): the playground behind `e2e/markdown.spec.ts`.

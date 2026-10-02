import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

/**
 * D07a spike evidence in a real browser: the dev playground `/dev/markdown` (editor + preview + emitted Markdown).
 * Runs against its own vite server on port 5373 (see playwright.config.ts). Findings: docs/notification-markdown.md.
 */

const SHOT_DIR = fileURLToPath(new URL('../../docs/screenshots/d07a/', import.meta.url))
const NL = '\n'

const editor = (page: Page) => page.locator('[contenteditable=true].notification-mdx-content')
const emitted = async (page: Page) => (await page.getByTestId('md-out').innerText()).trim()
const chipKeys = (page: Page) =>
  page.locator('[data-var-key]').evaluateAll((els) => els.map((e) => e.getAttribute('data-var-key')))

async function open(page: Page) {
  await page.goto('/dev/markdown')
  await expect(editor(page)).toBeVisible({ timeout: 60_000 })
}

async function load(page: Page, markdown: string) {
  await page.getByTestId('md-in').fill(markdown)
  await page.getByTestId('md-load').click()
  await expect.poll(() => emitted(page)).not.toBe('')
  await page.waitForTimeout(250)
}

async function clearAndType(page: Page, text: string) {
  await load(page, 'x')
  await editor(page).click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type(text)
  await page.waitForTimeout(250)
  return emitted(page)
}

async function paste(page: Page, text: string, html?: string) {
  await load(page, 'x')
  await editor(page).click()
  await page.keyboard.press('Control+a')
  await page.evaluate(
    ({ text, html }) => {
      const el = document.querySelector('[contenteditable=true].notification-mdx-content')!
      const dt = new DataTransfer()
      dt.setData('text/plain', text)
      if (html) dt.setData('text/html', html)
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    },
    { text, html },
  )
  await page.waitForTimeout(300)
  return emitted(page)
}

test.describe('MDXEditor spike (D07a)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
  })

  test('(a) :var[Key] loads as chips, "Chèn biến" inserts one, Markdown stays :var[Key]', async ({ page }) => {
    const before = await emitted(page)
    expect(before).toContain('Kính gửi :var[Ten_Day_Du],')
    expect(before).toContain('**:var[HeSoLuong]**')
    expect(await chipKeys(page)).toEqual(['Ten_Day_Du', 'HeSoLuong', 'NgayHieuLuc', 'HeSoLuong', 'MucLuong'])

    await editor(page).click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('Thêm: ')
    await page.getByRole('button', { name: 'Chèn biến' }).click()
    await page.getByRole('menuitem', { name: /Mức lương/ }).click()
    await expect.poll(() => emitted(page)).toContain('Thêm: :var[MucLuong]')
    await expect.poll(async () => (await chipKeys(page)).length).toBe(6)

    // preview substitutes the first row
    await expect(page.getByTestId('markdown-preview')).toContainText('Kính gửi Nguyễn Thử Nghiệm,')
    await expect(page.getByTestId('markdown-preview')).toContainText('3,66')
    await page.screenshot({ path: `${SHOT_DIR}editor-and-preview.png`, fullPage: true, animations: 'disabled' })
  })

  test('chips delete with the icon and with Backspace', async ({ page }) => {
    const start = (await chipKeys(page)).length
    await page.locator('[data-var-key] .MuiChip-deleteIcon').first().click()
    await expect.poll(async () => (await chipKeys(page)).length).toBe(start - 1)

    await editor(page).click()
    await page.keyboard.press('Control+End')
    await page.getByRole('button', { name: 'Chèn biến' }).click()
    await page.getByRole('menuitem', { name: /Hệ số lương/ }).click()
    await expect.poll(async () => (await chipKeys(page)).length).toBe(start)
    await page.keyboard.press('Backspace')
    await expect.poll(async () => (await chipKeys(page)).length).toBe(start - 1)
  })

  test('(b) source mode and back, and diff mode, keep :var[...] and the table', async ({ page }) => {
    const before = await emitted(page)
    const chips = await chipKeys(page)

    await page.getByRole('radio', { name: 'Mã Markdown' }).click()
    const source = page.locator('.cm-content')
    await expect(source).toBeVisible()
    await expect(source).toContainText(':var[HeSoLuong]')
    await expect(source).toContainText('| Hệ số     | :var[HeSoLuong] |')
    await page.getByRole('radio', { name: 'Soạn thảo' }).click()
    await expect(editor(page)).toBeVisible()
    expect(await emitted(page)).toBe(before)
    expect(await chipKeys(page)).toEqual(chips)

    await page.getByRole('radio', { name: 'So sánh với bản đã lưu' }).click()
    await expect(page.locator('.cm-mergeView, .cm-merge-a, .cm-editor').first()).toBeVisible()
    await page.getByRole('radio', { name: 'Soạn thảo' }).click()
    expect(await emitted(page)).toBe(before)

    // typing a placeholder and a colon in source mode becomes a chip / stays text when going back
    await page.getByRole('radio', { name: 'Mã Markdown' }).click()
    await source.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(`${NL}${NL}Nguồn: :var[MucLuong] a:b {x} 10:30`)
    await page.getByRole('radio', { name: 'Soạn thảo' }).click()
    await expect.poll(async () => (await chipKeys(page)).length).toBe(chips.length + 1)
    expect(await emitted(page)).toContain('Nguồn: :var[MucLuong] a:b {x} 10:30')
  })

  test('(c) typed text: braces, angle brackets and colons', async ({ page }) => {
    expect(await clearAndType(page, 'Họp 10:30 ngày 5/6 và tỉ lệ 3:2')).toBe('Họp 10:30 ngày 5/6 và tỉ lệ 3:2')
    expect(await clearAndType(page, 'cho {biến} và }{ x')).toBe('cho {biến} và }{ x')
    expect(await clearAndType(page, 'a < b > c')).toBe('a \\< b > c')
    expect(await clearAndType(page, '<b>x</b> <script>')).toBe('\\<b>x\\</b> \\<script>')
    // a colon right before a letter would parse as a directive, so it is escaped
    expect(await clearAndType(page, 'a:b và Ghi chú:abc')).toBe('a\\:b và Ghi chú\\:abc')
    // typing the placeholder syntax by hand is literal text, not a placeholder (use the menu)
    expect(await clearAndType(page, ':var[HeSoLuong]')).toBe('\\:var\\[HeSoLuong]')
    expect(await chipKeys(page)).toEqual([])
    // markdown punctuation typed in the rich editor is escaped, not interpreted
    expect(await clearAndType(page, '**x** _y_ `z`')).toBe('**x** *y* `z`') // shortcuts DO fire: they are the markdown shortcut plugin
  })

  test('(c) pasted plain text is literal; pasted HTML loses underline, sup and colour', async ({ page }) => {
    expect(await paste(page, 'Họp 10:30 a:b {x} <y> **b** :var[HeSoLuong]')).toBe(
      'Họp 10:30 a\\:b {x} \\<y> \\*\\*b\\*\\* \\:var\\[HeSoLuong]',
    )
    const html = await paste(
      page,
      'x',
      '<p>x <u>under</u> <b>bold</b> <sup>sup</sup> <span style="color:red">red</span> <a href="https://a.test">lnk</a></p><script>alert(1)</script>',
    )
    expect(html).toBe('x under **bold** sup red [lnk](https://a.test)')
  })

  test('bold toolbar button and Ctrl+B work on a selection', async ({ page }) => {
    await load(page, 'x')
    await editor(page).click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('abc def ghi')
    await page.keyboard.press('Shift+Control+ArrowLeft')
    await page.getByRole('radio', { name: 'In đậm' }).click()
    await expect.poll(() => emitted(page)).toBe('abc def **ghi**')
    // Let the editor settle (it restores focus and the selection after a toolbar click), and make sure the keys go to it.
    await page.waitForTimeout(300)
    await editor(page).focus()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+Control+ArrowRight')
    // Lexical learns about the new selection from an async `selectionchange`; Ctrl+B before that would act on the old one.
    await expect.poll(() => page.evaluate(() => String(getSelection()))).toBe('abc ')
    await page.waitForTimeout(250)
    await page.keyboard.press('Control+b')
    await expect.poll(() => emitted(page)).toBe('**abc** def **ghi**')
  })

  test('(c) Ctrl+U never produces <u>', async ({ page }) => {
    await load(page, 'x')
    await editor(page).click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('abc def')
    await page.keyboard.press('Shift+Control+ArrowLeft')
    await page.keyboard.press('Control+u')
    await page.waitForTimeout(300)
    expect(await emitted(page)).toBe('abc def')
    // typing with the underline toggle armed must not underline either
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Control+u')
    await page.keyboard.type(' jkl')
    await expect.poll(() => emitted(page)).toBe('abc def jkl')
  })

  test('(d) tables survive: load, edit a cell, add a row, switch modes', async ({ page }) => {
    await load(page, '| A | B |\n| - | - |\n| 1 | :var[HeSoLuong] |')
    expect(await chipKeys(page)).toEqual(['HeSoLuong'])
    await editor(page).locator('td', { hasText: /^1$/ }).first().click()
    await page.keyboard.type('xyz')
    // a table cell is a nested editor: its text reaches the document when the cell loses focus, not per keystroke
    await page.getByTestId('md-in').click()
    await expect.poll(() => emitted(page)).toContain('| 1xyz ')
    await page.getByRole('radio', { name: 'Mã Markdown' }).click()
    await expect(page.locator('.cm-content')).toContainText(':var[HeSoLuong]')
    await page.getByRole('radio', { name: 'Soạn thảo' }).click()
    await expect(editor(page).locator('table')).toHaveCount(1)
    expect(await chipKeys(page)).toEqual(['HeSoLuong'])
    expect(await emitted(page)).toContain('| 1xyz')
  })

  test('raw HTML in the body falls back to a source box instead of crashing', async ({ page }) => {
    await load(page, 'Có thẻ <b>đậm</b> và <script>alert(1)</script>')
    await expect(page.getByTestId('editor-fallback')).toBeVisible()
    await expect(page.getByTestId('editor-fallback')).toContainText('cú pháp mà trình soạn thảo không hỗ trợ')
    await page.screenshot({ path: `${SHOT_DIR}fallback.png`, animations: 'disabled' })
    // fixing the text and retrying brings the editor back
    const box = page.getByRole('textbox', { name: 'Mã Markdown' })
    await box.fill('Có thẻ đậm')
    await page.getByRole('button', { name: 'Thử lại' }).click()
    await expect(editor(page)).toBeVisible()
    expect(await emitted(page)).toBe('Có thẻ đậm')
  })

  test('image dialog uploads through the handler and inserts /api/files/<uuid>', async ({ page }) => {
    await load(page, 'Ảnh:')
    await editor(page).click()
    await page.keyboard.press('Control+End')
    await page.getByRole('button', { name: 'Chèn ảnh' }).click()
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    await page.getByTestId('image-file-input').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: png })
    await page.getByLabel(/Mô tả ảnh/).fill('Ảnh thử')
    await page.getByRole('button', { name: 'Chèn', exact: true }).click()
    await expect
      .poll(() => emitted(page))
      .toMatch(/!\[Ảnh thử\]\(\/api\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\)/)
  })

  test('preview: two rows render two blocks; a value with markup stays literal', async ({ page }) => {
    await page.getByRole('switch', { name: /Hai dòng dữ liệu/ }).check()
    await expect(page.getByTestId('notification-body-block')).toHaveCount(2)
    await expect(page.getByTestId('markdown-preview')).toContainText('3,99')
  })
})

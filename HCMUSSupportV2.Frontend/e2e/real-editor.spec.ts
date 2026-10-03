import { expect, test } from '@playwright/test'
import type { Page, PlaywrightWorkerArgs } from '@playwright/test'
import { makeXlsx } from './xlsx.ts'

/**
 * D09 "Done when", against the real backend (project `e2e-real`, see playwright.real.config.ts): an editor makes
 * "Nâng lương thường xuyên 2026" by cloning the 2025 post and uploading a synthetic xlsx, previews it as a recipient and
 * publishes it; the recipient then sees it with the substituted values. Synthetic roster only (T0001 admin, T0003 and
 * T0004 plain employees).
 */

async function devLogin(page: Page, code: string, returnUrl: string) {
  await page.goto(`/login?returnUrl=${encodeURIComponent(returnUrl)}`)
  await expect(page.getByTestId('dev-login')).toBeVisible()
  await page.getByLabel('MSCB đăng nhập thử').fill(code)
  await page.getByRole('button', { name: 'Đăng nhập thử' }).click()
  await expect(page).toHaveURL(returnUrl)
}

async function apiSession(playwright: PlaywrightWorkerArgs['playwright'], baseURL: string, code: string) {
  const ctx = await playwright.request.newContext({ baseURL })
  const login = await ctx.post('/api/auth/dev-login', { data: { employeeCode: code } })
  expect(login.ok(), `dev-login ${code}`).toBe(true)
  const xsrf = (await ctx.storageState()).cookies.find((c) => c.name === 'XSRF-TOKEN')?.value
  expect(xsrf).toBeTruthy()
  const headers = { 'X-XSRF-TOKEN': decodeURIComponent(xsrf!) }
  return {
    get: (url: string) => ctx.get(url),
    post: (url: string, data?: unknown) => ctx.post(url, { headers, data }),
    put: (url: string, data: unknown) => ctx.put(url, { headers, data }),
    delete: (url: string) => ctx.delete(url, { headers }),
    dispose: () => ctx.dispose(),
  }
}

test('D09: clone last year, upload a sheet, preview as a recipient, publish; the recipient sees the substituted values', async ({
  page,
  playwright,
  baseURL,
}) => {
  test.setTimeout(240_000)
  const stamp = String(Date.now())
  const token = `E2E${stamp}`
  const title2025 = `Nâng lương thường xuyên 2025 ${token}`
  const title2026 = `Nâng lương thường xuyên 2026 ${token}`

  const admin = await apiSession(playwright, baseURL!, 'T0001')
  const recipient = await apiSession(playwright, baseURL!, 'T0003')
  const created: string[] = []
  let seriesId: number | undefined

  try {
    // Last year's post, made through the API: a series, two declared variables, one named recipient, published.
    const series = await admin.post('/api/manage/series', { name: `Nâng lương thường xuyên ${token}`, description: 'Chuỗi thử nghiệm' })
    expect(series.status(), await series.text()).toBe(201)
    seriesId = ((await series.json()) as { id: number }).id

    const body2025 = '# Nâng lương năm 2025\n\nKính gửi anh/chị, hệ số lương mới của anh/chị là **:var[HeSoLuong]**, hiệu lực từ :var[NgayHieuLuc].'
    const draft = await admin.post('/api/manage/notifications', {
      title: title2025,
      seriesId,
      bodyMd: body2025,
      variables: [
        { key: 'HeSoLuong', label: 'Hệ số lương', type: 'number' },
        { key: 'NgayHieuLuc', label: 'Ngày hiệu lực', type: 'date' },
      ],
      tagIds: [],
      audienceAll: false,
      groupIds: [],
      employeeCodes: ['T0003'],
    })
    expect(draft.status(), await draft.text()).toBe(201)
    const id2025 = ((await draft.json()) as { id: string }).id
    created.push(id2025)
    const publish2025 = await admin.post(`/api/manage/notifications/${id2025}/publish`)
    expect(publish2025.ok(), await publish2025.text()).toBe(true)

    // --- the editor (T0001): find last year's post in the list and copy it
    await devLogin(page, 'T0001', '/manage/notifications')
    await expect(page.getByRole('heading', { level: 1, name: 'Quản lý thông báo' })).toBeVisible()
    await page.getByLabel('Tìm thông báo').fill(token)
    const row = page.getByTestId('manage-row').filter({ hasText: title2025 })
    await expect(row).toBeVisible()
    await expect(row.getByTestId('status-chip')).toHaveText('Đã đăng')
    await row.getByRole('button', { name: /^Thao tác với/ }).click()
    await page.getByRole('menuitem', { name: 'Sao chép thành bản nháp' }).click()

    await expect(page).toHaveURL(/\/manage\/notifications\/[0-9a-f-]{36}$/)
    const id2026 = page.url().split('/').pop()!
    created.push(id2026)
    const titleInput = page.getByTestId('title-input')
    await expect(titleInput).toHaveValue(title2025)
    await expect(page.getByTestId('status-chip')).toHaveText('Bản nháp')

    // Retitle it and add a sentence in the rich editor; the live preview follows the unsaved draft.
    await titleInput.fill(title2026)
    const editorContent = page.locator('.notification-mdx-content')
    await expect(editorContent).toContainText('Nâng lương năm 2025')
    await editorContent.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' Cảm ơn sự đóng góp của anh/chị.')
    await expect(page.getByTestId('markdown-preview')).toContainText('Cảm ơn sự đóng góp của anh/chị.')
    await expect(page.getByTestId('dirty-flag')).toBeVisible()

    // Upload the recipient sheet (saves the draft first). Two recipients and one code that is not an employee.
    await page.getByRole('button', { name: 'Tải danh sách' }).click()
    const dialog = page.getByRole('dialog', { name: 'Tải danh sách người nhận' })
    await expect(dialog).toBeVisible()
    const sheet = makeXlsx([
      ['MSCB', 'Hệ số lương', 'Ngày hiệu lực'],
      ['T0003', '4,06', '01/07/2026'],
      ['T0004', '3,66', '01/07/2026'],
      ['ZZ9999', '2,34', '01/07/2026'],
    ])
    await dialog.getByTestId('import-file').setInputFiles({
      name: 'nang-luong-2026.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: sheet,
    })
    const report = dialog.getByTestId('import-report')
    await expect(report).toBeVisible()
    await expect(report).toContainText('3 dòng')
    await expect(report).toContainText('không có trong danh sách nhân sự')
    await expect(report).toContainText('ZZ9999')
    await dialog.getByRole('button', { name: 'Áp dụng danh sách' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('import-summary')).toContainText('Đang dùng danh sách')
    await expect(page.getByTestId('dirty-flag')).toHaveCount(0) // saved with the import

    // The live count: T0003 (named and in the sheet) and T0004 (sheet only); ZZ9999 does not exist.
    await expect(page.getByTestId('recipient-count')).toContainText('2')

    // Preview as a recipient: their own values replace the placeholders in the unsaved draft.
    const picker = page.getByLabel('Xem trước với tư cách…')
    await picker.fill('T0003')
    await page.getByRole('option', { name: /T0003/ }).click()
    const preview = page.getByTestId('markdown-preview')
    await expect(preview).toContainText('4,06')
    await expect(preview).toContainText('01/07/2026')
    await expect(page.getByTestId('preview-status')).toContainText('Thuộc đối tượng nhận')
    await picker.fill('T0004')
    await page.getByRole('option', { name: /T0004/ }).click()
    await expect(preview).toContainText('3,66')
    await expect(page.getByTestId('preview-status')).toContainText('có trong tệp danh sách')

    // Publish.
    await page.getByRole('button', { name: 'Đăng ngay' }).click()
    await page.getByRole('dialog', { name: 'Đăng thông báo ngay?' }).getByRole('button', { name: 'Đăng ngay' }).click()
    await expect(page.getByTestId('status-chip')).toHaveText('Đã đăng')
    await expect(page.getByText('Đã đăng thông báo.')).toBeVisible()

    // --- the recipient (T0003) signs in, reloads and sees it with their own values
    await expect
      .poll(async () => {
        const inbox = (await (await recipient.get('/api/notifications?limit=50')).json()) as { items: Array<{ title: string }> }
        return inbox.items.some((i) => i.title === title2026)
      }, { timeout: 60_000, intervals: [500, 1000, 2000] })
      .toBe(true)

    await page.request.post('/api/auth/logout', {
      headers: { 'X-XSRF-TOKEN': decodeURIComponent((await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')!.value) },
    })
    await devLogin(page, 'T0003', '/news')
    await page.reload()
    const inboxRow = page.getByTestId('inbox-row').filter({ hasText: title2026 })
    await expect(inboxRow).toBeVisible()
    await inboxRow.click()
    const post = page.getByRole('dialog').getByTestId('notification-body')
    await expect(post).toContainText('4,06')
    await expect(post).toContainText('01/07/2026')
    await expect(post).toContainText('Cảm ơn sự đóng góp của anh/chị.')
    await expect(post).not.toContainText('3,66')
  } finally {
    for (const id of created) await admin.post(`/api/manage/notifications/${id}/archive`)
    if (seriesId !== undefined) await admin.delete(`/api/manage/series/${seriesId}`)
    await admin.dispose()
    await recipient.dispose()
  }
})

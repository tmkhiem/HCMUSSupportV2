import { expect, test } from '@playwright/test'
import type { Page, PlaywrightWorkerArgs } from '@playwright/test'

/**
 * `e2e-real`, D14c: "Nhân sự & email" against the REAL backend (Development, dev-login). Roster: T0001 admin, T0002
 * editor, T0003.. plain employees. Every test removes what it added, and uses addresses made unique by a timestamp.
 *
 * "That person can sign in": Google sign-in itself cannot run here, so the proof is `GET /api/auth/me` after a
 * dev-login (it lists the employee's mapped emails); the backend suite covers the Google rule (`GoogleSignInService`
 * accepts the freshly mapped address) in `EmployeeEmailsTests`.
 */

async function devLogin(page: Page, code: string, returnUrl = '/tin-tuc') {
  await page.goto(`/dang-nhap?returnUrl=${encodeURIComponent(returnUrl)}`)
  await expect(page.getByTestId('dev-login')).toBeVisible()
  await page.getByLabel('MSCB đăng nhập thử').fill(code)
  await page.getByRole('button', { name: 'Đăng nhập thử' }).click()
  await expect(page).toHaveURL(returnUrl)
}

/** A cookie-jar of its own: dev-login, then calls with the XSRF header. */
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
    put: (url: string) => ctx.put(url, { headers }),
    del: (url: string) => ctx.delete(url, { headers }),
    me: async () => (await (await ctx.get('/api/auth/me')).json()) as { code: string; emails: string[] },
    dispose: () => ctx.dispose(),
  }
}

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`

test('an editor maps a new email to an MSCB in the UI and that person then has it on the account', async ({ page, playwright, baseURL }) => {
  test.setTimeout(120_000)
  const email = `e2e.${stamp()}@example.test`
  const editor = await apiSession(playwright, baseURL!, 'T0002')
  const target = await apiSession(playwright, baseURL!, 'T0005')
  try {
    await devLogin(page, 'T0002', '/quan-ly/nhan-su?q=T0005')
    await expect(page.getByRole('heading', { level: 1, name: 'Nhân sự & email' })).toBeVisible()
    const row = page.getByTestId('employee-row').filter({ hasText: 'T0005' })
    await expect(row).toBeVisible()
    await row.click()

    const drawer = page.getByRole('presentation').filter({ has: page.getByRole('heading', { level: 2 }) })
    await expect(drawer.getByRole('heading', { level: 2 })).toBeVisible()
    const before = await drawer.getByTestId('email-row').count()

    // A malformed address is stopped in the form; a good one is saved.
    await drawer.getByLabel('Địa chỉ email').fill('khong-hop-le')
    await drawer.getByRole('button', { name: 'Thêm email' }).click()
    await expect(drawer.getByText('Địa chỉ email không hợp lệ.')).toBeVisible()
    await drawer.getByLabel('Địa chỉ email').fill(email.toUpperCase())
    await drawer.getByLabel('Ghi chú (không bắt buộc)').fill('Kiểm thử e2e')
    await drawer.getByRole('button', { name: 'Thêm email' }).click()
    await expect(drawer.getByTestId('email-row')).toHaveCount(before + 1)
    await expect(drawer.getByTestId('email-row').filter({ hasText: email })).toBeVisible() // stored lower-cased

    // The mapping is on the server: T0005's own session shows it, so that address now belongs to T0005.
    await expect.poll(async () => (await target.me()).emails).toContain(email)

    // Mapping the same address to someone else is refused with the owner named.
    const clash = await editor.post('/api/manage/employees/T0006/emails', { email })
    expect(clash.status()).toBe(409)
    expect(await clash.text()).toContain('T0005')

    // The directory finds the person by the new address.
    await page.getByRole('button', { name: 'Đóng' }).click()
    await page.getByLabel('Tìm kiếm nhân sự').fill(email)
    await expect(page.getByTestId('employee-row')).toHaveCount(1)
    await expect(page.getByTestId('employee-row')).toHaveAttribute('data-code', 'T0005')

    // Removing it again through the UI asks for a confirmation.
    await page.getByTestId('employee-row').click()
    await drawer.getByRole('button', { name: `Gỡ ${email}` }).click()
    await page.getByRole('dialog', { name: 'Gỡ email này?' }).getByRole('button', { name: 'Gỡ email' }).click()
    await expect(drawer.getByTestId('email-row')).toHaveCount(before)
    await expect.poll(async () => (await target.me()).emails).not.toContain(email)

    // Every write left an audit trail (admin reads it).
    const admin = await apiSession(playwright, baseURL!, 'T0001')
    const audit = (await (await admin.get('/api/admin/audit?action=employee_email.*&targetId=T0005&limit=20')).json()) as {
      items: Array<{ action: string; actorCode: string }>
    }
    const actions = audit.items.filter((a) => a.actorCode === 'T0002').map((a) => a.action)
    expect(actions).toContain('employee_email.added')
    expect(actions).toContain('employee_email.removed')
    await admin.dispose()
  } finally {
    await editor.del(`/api/manage/employees/T0005/emails/${encodeURIComponent(email)}`)
    await editor.dispose()
    await target.dispose()
  }
})

test('the import flow: a dry run writes nothing, applying adds the emails', async ({ page, playwright, baseURL }) => {
  test.setTimeout(120_000)
  const id = stamp()
  const fresh = `e2e.import.${id}@example.test`
  const taken = 't0001@dev.hcmus.local' // seeded for T0001
  const editor = await apiSession(playwright, baseURL!, 'T0002')
  try {
    await devLogin(page, 'T0002', '/quan-ly/nhan-su')
    await page.getByRole('button', { name: 'Nhập từ tệp' }).click()
    const dialog = page.getByRole('dialog', { name: 'Nhập MSCB và email từ tệp' })
    const csv = ['MSCB,Họ tên,Email 1', `T0006,,${fresh}`, `T0007,,${taken}`, 'T9999,,nobody@example.test', 'T0008,,khong-hop-le'].join('\n')
    await dialog.getByTestId('import-file').setInputFiles({ name: 'nhan-su.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') })
    await dialog.getByRole('button', { name: 'Kiểm tra tệp' }).click()
    await expect(dialog.getByTestId('count-added')).toContainText('1')
    await expect(dialog.getByTestId('count-conflicts')).toContainText('1')
    await expect(dialog.getByTestId('count-unknown')).toContainText('1')
    await expect(dialog.getByTestId('count-invalid')).toContainText('1')
    await expect(dialog.getByTestId('section-conflicts')).toContainText('T0001')

    // Dry run: nothing was written.
    const dry = (await (await editor.get(`/api/manage/employees?q=${encodeURIComponent(fresh)}`)).json()) as { total: number }
    expect(dry.total).toBe(0)

    await dialog.getByRole('button', { name: 'Áp dụng (1)' }).click()
    await expect(dialog.getByTestId('import-applied')).toContainText('thêm 1 email')
    const applied = (await (await editor.get(`/api/manage/employees?q=${encodeURIComponent(fresh)}`)).json()) as {
      items: Array<{ code: string; emails: Array<{ email: string }> }>
    }
    expect(applied.items.map((i) => i.code)).toEqual(['T0006'])
    await dialog.getByRole('button', { name: 'Xong' }).click()
  } finally {
    await editor.del(`/api/manage/employees/T0006/emails/${encodeURIComponent(fresh)}`)
    await editor.dispose()
  }
})

test('an editor gets 403 on /quan-tri/* (UI and API); a plain employee gets 403 on the directory', async ({ page, playwright, baseURL }) => {
  const editor = await apiSession(playwright, baseURL!, 'T0002')
  for (const url of ['/api/admin/audit', '/api/admin/dashboard']) {
    expect((await editor.get(url)).status(), url).toBe(403)
  }
  expect((await editor.put('/api/admin/employees/T0003/status')).status()).toBe(403)
  expect((await editor.get('/api/manage/employees?limit=1')).status()).toBe(200)
  await editor.dispose()

  const employee = await apiSession(playwright, baseURL!, 'T0003')
  expect((await employee.get('/api/manage/employees')).status()).toBe(403)
  expect((await employee.post('/api/manage/employees/T0003/emails', { email: 'x@example.test' })).status()).toBe(403)
  await employee.dispose()

  await devLogin(page, 'T0002', '/quan-ly/nhan-su')
  await expect(page.getByRole('heading', { level: 1, name: 'Nhân sự & email' })).toBeVisible()
  await page.goto('/quan-tri/phan-quyen')
  await expect(page.getByText('Bạn không có quyền truy cập trang này')).toBeVisible()
  await page.goto('/quan-tri')
  await expect(page.getByText('Bạn không có quyền truy cập trang này')).toBeVisible()
})

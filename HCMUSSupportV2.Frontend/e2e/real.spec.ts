import { expect, test } from '@playwright/test'
import type { Page, PlaywrightWorkerArgs } from '@playwright/test'

/**
 * `e2e-real` project: real backend (Development, dev-login enabled), no stubs. Roster: T0001 admin, T0002 editor,
 * T0003.. plain employees.
 */

async function devLogin(page: Page, code: string, returnUrl = '/tin-tuc') {
  await page.goto(`/dang-nhap?returnUrl=${encodeURIComponent(returnUrl)}`)
  await expect(page.getByTestId('dev-login')).toBeVisible()
  await page.getByLabel('MSCB đăng nhập thử').fill(code)
  await page.getByRole('button', { name: 'Đăng nhập thử' }).click()
  await expect(page).toHaveURL(returnUrl)
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' })

async function xsrfHeader(page: Page): Promise<Record<string, string>> {
  const token = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value
  expect(token).toBeTruthy()
  return { 'X-XSRF-TOKEN': decodeURIComponent(token!) }
}

test('anonymous visitors are sent to the login page', async ({ page }) => {
  await page.goto('/ho-so')
  await expect(page).toHaveURL(/\/dang-nhap\?returnUrl=%2Fho-so$/)
  await expect(page.getByRole('button', { name: 'Đăng nhập với Google' })).toBeEnabled()
})

test('the backend error redirect /login?error= shows the Vietnamese message', async ({ page }) => {
  await page.goto('/login?error=inactive')
  await expect(page).toHaveURL('/dang-nhap?error=inactive')
  await expect(page.getByRole('alert')).toContainText('không còn hoạt động')
})

test('T0001 (admin) dev-logs in and sees the shell with the admin nav', async ({ page }) => {
  await devLogin(page, 'T0001')
  await expect(nav(page).getByRole('link', { name: 'Quản trị' })).toBeVisible()
  await expect(nav(page).getByRole('link', { name: 'Quản lý thông báo' })).toBeVisible()

  await page.getByRole('button', { name: 'Tài khoản' }).click()
  const menu = page.getByRole('presentation').filter({ hasText: 'T0001' })
  await expect(menu).toContainText('Nhân viên Thử nghiệm 01')
  await expect(menu).toContainText('Quản trị viên')
  await expect(menu).toContainText(/Phiên bản \S+/)
  await expect(menu).not.toContainText('Phiên bản —')

  await page.keyboard.press('Escape')
  await page.goto('/quan-tri')
  await expect(page.getByText('Bạn không có quyền truy cập trang này')).toHaveCount(0)
})

test('T0003 (plain employee) has no editor/admin nav and gets the forbidden card', async ({ page }) => {
  await devLogin(page, 'T0003')
  await expect(nav(page).getByRole('link', { name: 'Tin tức' })).toBeVisible()
  await expect(nav(page).getByRole('link', { name: 'Quản lý thông báo' })).toHaveCount(0)
  await expect(nav(page).getByRole('link', { name: 'Quản trị' })).toHaveCount(0)

  await page.goto('/quan-tri')
  await expect(page.getByText('Bạn không có quyền truy cập trang này')).toBeVisible()
  await page.goto('/quan-ly/thong-bao')
  await expect(page.getByText('Bạn không có quyền truy cập trang này')).toBeVisible()
})

test('an unknown MSCB is rejected with a message', async ({ page }) => {
  await page.goto('/dang-nhap')
  await page.getByLabel('MSCB đăng nhập thử').fill('X9999')
  await page.getByRole('button', { name: 'Đăng nhập thử' }).click()
  await expect(page.getByTestId('dev-login').getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/dang-nhap$/)
})

test('an unsafe call without X-XSRF-TOKEN gets 400; with the token it is accepted', async ({ page }) => {
  await devLogin(page, 'T0003')

  const without = await page.request.post('/api/auth/logout')
  expect(without.status()).toBe(400)
  await page.reload()
  await expect(nav(page).getByRole('link', { name: 'Tin tức' })).toBeVisible() // still signed in

  const withToken = await page.request.post('/api/auth/logout', { headers: await xsrfHeader(page) })
  expect(withToken.status()).toBe(204)
})

test('logout clears the session cookie and returns to the login page', async ({ page, context }) => {
  await devLogin(page, 'T0001')
  expect((await context.cookies()).some((c) => c.name === 'hcmus')).toBe(true)

  await page.getByRole('button', { name: 'Tài khoản' }).click()
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click()

  await expect(page).toHaveURL(/\/dang-nhap/)
  await expect(page.getByRole('button', { name: 'Đăng nhập với Google' })).toBeVisible()
  await expect.poll(async () => (await context.cookies()).some((c) => c.name === 'hcmus')).toBe(false)
  expect((await page.request.get('/api/auth/me')).status()).toBe(401)

  await page.goto('/tin-tuc')
  await expect(page).toHaveURL(/\/dang-nhap\?returnUrl=%2Ftin-tuc$/)
})

test('switching user: a second dev-login refreshes me and the XSRF token', async ({ page }) => {
  await devLogin(page, 'T0001')
  await expect(nav(page).getByRole('link', { name: 'Quản trị' })).toBeVisible()
  expect((await page.request.post('/api/auth/logout', { headers: await xsrfHeader(page) })).status()).toBe(204)
  await devLogin(page, 'T0003', '/ho-so')
  await expect(nav(page).getByRole('link', { name: 'Tin tức' })).toBeVisible()
  await expect(nav(page).getByRole('link', { name: 'Quản trị' })).toHaveCount(0)
})

/** A cookie-jar of its own that signs in with dev-login and sends the XSRF header on unsafe calls (the admin side of the inbox test). */
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
    dispose: () => ctx.dispose(),
  }
}

test('inbox: a post published by T0001 reaches T0003, the badge counts it, opening it decrements the badge, ack persists', async ({
  page,
  playwright,
  baseURL,
}) => {
  test.setTimeout(120_000)
  const title = `E2E hộp thư ${Date.now()}`
  const streamRequests: string[] = []
  page.on('request', (r) => r.url().includes('/api/notifications/stream') && streamRequests.push(r.url()))

  const admin = await apiSession(playwright, baseURL!, 'T0001')
  const employee = await apiSession(playwright, baseURL!, 'T0003')
  const unreadOf = async () => ((await (await employee.get('/api/notifications/unread-count')).json()) as { count: number }).count
  let notificationId: string | undefined

  try {
    const before = await unreadOf()

    // T0001: create -> set the audience to employee T0003 -> publish.
    const created = await admin.post('/api/manage/notifications', {
      title,
      bodyMd: 'Thông báo thử nghiệm cho hộp thư.\n\nNội dung **in đậm**.',
      variables: [],
      tagIds: [],
      requiresAck: true,
      audienceAll: false,
    })
    expect(created.status(), await created.text()).toBe(201)
    const draft = (await created.json()) as { id: string; version: number }
    notificationId = draft.id
    const updated = await admin.put(`/api/manage/notifications/${draft.id}`, {
      version: draft.version,
      title,
      bodyMd: 'Thông báo thử nghiệm cho hộp thư.\n\nNội dung **in đậm**.',
      variables: [],
      tagIds: [],
      requiresAck: true,
      audienceAll: false,
      groupIds: [],
      employeeCodes: ['T0003'],
    })
    expect(updated.ok(), await updated.text()).toBe(true)
    const published = await admin.post(`/api/manage/notifications/${draft.id}/publish`)
    expect(published.ok(), await published.text()).toBe(true)

    // The fan-out is a background job: wait until T0003's unread count has moved.
    await expect.poll(unreadOf, { timeout: 60_000, intervals: [500, 1000, 2000] }).toBe(before + 1)

    // T0003 signs in and reloads: the post and the badge are there.
    await devLogin(page, 'T0003', '/tin-tuc')
    await page.reload()
    const badge = page.locator('nav[aria-label="Điều hướng chính"] a[href="/tin-tuc"] .MuiBadge-badge').filter({ visible: true })
    await expect(badge).toHaveText(String(before + 1))
    const row = page.getByTestId('inbox-row').filter({ hasText: title })
    await expect(row).toBeVisible()
    await expect(row).toHaveAttribute('data-unread', 'true')
    await expect(page.getByTestId('avatar-dot').filter({ visible: true })).toBeVisible()

    // Open it: the body renders, it is marked read and the badge goes down by one (and the server agrees).
    await row.click()
    await expect(page).toHaveURL(new RegExp(`/tin-tuc/${draft.id}$`))
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { level: 2, name: title })).toBeVisible()
    await expect(dialog.getByTestId('notification-body')).toContainText('Thông báo thử nghiệm cho hộp thư.')
    if (before === 0) await expect(badge).toHaveCount(0)
    else await expect(badge).toHaveText(String(before))
    await expect.poll(unreadOf).toBe(before)

    // The post asks for an acknowledgement: it is persisted (still acknowledged after a reload).
    await expect(row).toContainText('Cần xác nhận')
    await dialog.getByRole('button', { name: 'Xác nhận đã đọc' }).click()
    await expect(dialog.getByText(/Đã xác nhận lúc/)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(/\/tin-tuc$/)
    await expect(row).toHaveAttribute('data-unread', 'false')
    await expect(row).not.toContainText('Cần xác nhận')
    await page.reload()
    await expect(row).toBeVisible()
    await expect(row).not.toContainText('Cần xác nhận')
    await row.click()
    await expect(page.getByRole('dialog')).toContainText('Đã xác nhận lúc')
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Xác nhận đã đọc' })).toHaveCount(0)

    // No live stream is ever requested (employees reload to see new posts).
    expect(streamRequests, 'the app does not open a live stream').toEqual([])
  } finally {
    if (notificationId) await admin.post(`/api/manage/notifications/${notificationId}/archive`)
    await admin.dispose()
    await employee.dispose()
  }
})

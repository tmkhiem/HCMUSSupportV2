import { expect, test } from '@playwright/test'
import type { Page, PlaywrightWorkerArgs } from '@playwright/test'

/**
 * `e2e-real` project: real backend (Development, dev-login enabled), no stubs. Roster: T0001 admin, T0002 editor,
 * T0003.. plain employees.
 */

async function devLogin(page: Page, code: string, returnUrl = '/news') {
  await page.goto(`/login?returnUrl=${encodeURIComponent(returnUrl)}`)
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
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fprofile$/)
  await expect(page.getByRole('button', { name: 'Đăng nhập với Google' })).toBeEnabled()
})

test('the backend error redirect /login?error= shows the Vietnamese message', async ({ page }) => {
  await page.goto('/login?error=inactive')
  await expect(page).toHaveURL('/login?error=inactive')
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
  await page.goto('/admin')
  await expect(page.getByText('Bạn không có quyền truy cập trang này')).toHaveCount(0)
})

test('T0003 (plain employee) has no editor/admin nav and gets the forbidden card', async ({ page }) => {
  await devLogin(page, 'T0003')
  await expect(nav(page).getByRole('link', { name: 'Tin tức' })).toBeVisible()
  await expect(nav(page).getByRole('link', { name: 'Quản lý thông báo' })).toHaveCount(0)
  await expect(nav(page).getByRole('link', { name: 'Quản trị' })).toHaveCount(0)

  await page.goto('/admin')
  await expect(page.getByText('Bạn không có quyền truy cập trang này')).toBeVisible()
  await page.goto('/manage/notifications')
  await expect(page.getByText('Bạn không có quyền truy cập trang này')).toBeVisible()
})

test('an unknown MSCB is rejected with a message', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('MSCB đăng nhập thử').fill('X9999')
  await page.getByRole('button', { name: 'Đăng nhập thử' }).click()
  await expect(page.getByTestId('dev-login').getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
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

  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: 'Đăng nhập với Google' })).toBeVisible()
  await expect.poll(async () => (await context.cookies()).some((c) => c.name === 'hcmus')).toBe(false)
  expect((await page.request.get('/api/auth/me')).status()).toBe(401)

  await page.goto('/news')
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fnews$/)
})

test('switching user: a second dev-login refreshes me and the XSRF token', async ({ page }) => {
  await devLogin(page, 'T0001')
  await expect(nav(page).getByRole('link', { name: 'Quản trị' })).toBeVisible()
  expect((await page.request.post('/api/auth/logout', { headers: await xsrfHeader(page) })).status()).toBe(204)
  await devLogin(page, 'T0003', '/profile')
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

test('inbox: a post published by T0001 reaches T0003 and opens', async ({
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
  const delivered = async () =>
    ((await (await employee.get('/api/notifications?limit=100')).json()) as { items: Array<{ title: string }> }).items.some((i) => i.title === title)
  let notificationId: string | undefined

  try {
    // T0001: create -> set the audience to employee T0003 -> publish.
    const created = await admin.post('/api/manage/notifications', {
      title,
      bodyMd: 'Thông báo thử nghiệm cho hộp thư.\n\nNội dung **in đậm**.',
      variables: [],
      tagIds: [],
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
      audienceAll: false,
      groupIds: [],
      employeeCodes: ['T0003'],
    })
    expect(updated.ok(), await updated.text()).toBe(true)
    const published = await admin.post(`/api/manage/notifications/${draft.id}/publish`)
    expect(published.ok(), await published.text()).toBe(true)

    // The fan-out is a background job: wait until T0003 has the delivery.
    await expect.poll(delivered, { timeout: 60_000, intervals: [500, 1000, 2000] }).toBe(true)

    // T0003 signs in and reloads: the post is there.
    await devLogin(page, 'T0003', '/news')
    await page.reload()
    const row = page.getByTestId('inbox-row').filter({ hasText: title })
    await expect(row).toBeVisible()

    // Open it: the body renders.
    await row.click()
    await expect(page).toHaveURL(new RegExp(`/news/${draft.id}$`))
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { level: 2, name: title })).toBeVisible()
    await expect(dialog.getByTestId('notification-body')).toContainText('Thông báo thử nghiệm cho hộp thư.')

    // No live stream is ever requested (employees reload to see new posts).
    expect(streamRequests, 'the app does not open a live stream').toEqual([])
  } finally {
    if (notificationId) await admin.post(`/api/manage/notifications/${notificationId}/archive`)
    await admin.dispose()
    await employee.dispose()
  }
})

test('admin pages: T0001 grants editor to T0004 on Phân quyền, T0004 then sees Quản lý thông báo', async ({ page, playwright, baseURL }) => {
  test.setTimeout(120_000)
  const admin = await apiSession(playwright, baseURL!, 'T0001')
  const revoke = () => admin.put('/api/admin/roles/T0004', { roles: [] })
  try {
    expect((await revoke()).ok()).toBe(true) // known starting point (also clears a previous failed run)

    await devLogin(page, 'T0004')
    await expect(nav(page).getByRole('link', { name: 'Quản lý thông báo' })).toHaveCount(0)
    expect((await page.request.post('/api/auth/logout', { headers: await xsrfHeader(page) })).status()).toBe(204)

    // T0001 grants the editor role through the page.
    await devLogin(page, 'T0001', '/admin/roles')
    await expect(page.getByRole('heading', { level: 1, name: 'Phân quyền' })).toBeVisible()
    await page.getByLabel('Tìm cán bộ').fill('T0004')
    await page.getByRole('button', { name: /^Mở / }).filter({ hasText: 'T0004' }).click()
    const drawer = page.getByRole('presentation').filter({ hasText: 'Chi tiết phân quyền' })
    await expect(drawer.getByText(/^T0004 · /)).toBeVisible()
    await drawer.getByRole('switch', { name: /Biên tập viên/ }).check()
    await drawer.getByRole('button', { name: 'Lưu' }).click()
    await expect(drawer.getByText('Đã lưu phân quyền')).toBeVisible()
    // The grant is in the server's own view of T0004 and shows up in the list's role chips.
    const detail = (await (await admin.get('/api/admin/roles/T0004')).json()) as { roles: string[] }
    expect(detail.roles).toContain('editor')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('row').filter({ hasText: 'T0004' })).toContainText('Biên tập viên')

    // T0004 signs in (the role applies at once) and sees the editor nav, but still not the admin one.
    expect((await page.request.post('/api/auth/logout', { headers: await xsrfHeader(page) })).status()).toBe(204)
    await devLogin(page, 'T0004')
    await expect(nav(page).getByRole('link', { name: 'Quản lý thông báo' })).toBeVisible()
    await expect(nav(page).getByRole('link', { name: 'Quản trị' })).toHaveCount(0)
    await page.goto('/manage/groups')
    await expect(page.getByRole('heading', { level: 1, name: 'Nhóm' })).toBeVisible()
    await page.goto('/admin')
    await expect(page.getByText('Bạn không có quyền truy cập trang này')).toBeVisible()
  } finally {
    await revoke()
    await admin.dispose()
  }
})

test('admin pages: T0001 starts and stops view-as as T0003; both are audited', async ({ page, playwright, baseURL }) => {
  test.setTimeout(120_000)
  const admin = await apiSession(playwright, baseURL!, 'T0001')
  try {
    await devLogin(page, 'T0001', '/admin/view-as')
    await expect(page.getByRole('heading', { level: 1, name: 'Xem thử' })).toBeVisible()
    await page.getByLabel('Cán bộ cần xem').fill('T0003')
    await page.getByRole('option', { name: /T0003/ }).click()
    await page.getByRole('button', { name: 'Bắt đầu xem thử' }).click()

    // The session was refreshed: we land on Tin tức with the warning bar. `me` still describes T0001 (the nav keeps its
    // admin items); `actingAs` names the viewed employee.
    await expect(page).toHaveURL(/\/news$/)
    const bar = page.getByRole('status').filter({ hasText: 'Đang xem với tư cách' })
    await expect(bar).toContainText('T0003')
    const acting = (await (await page.request.get('/api/auth/me')).json()) as { code: string; actingAs: { code: string } | null }
    expect(acting.code).toBe('T0001')
    expect(acting.actingAs?.code).toBe('T0003')

    // "Thoát" calls DELETE admin/view-as and reloads me.
    const deleted = page.waitForRequest((r) => r.method() === 'DELETE' && r.url().endsWith('/api/admin/view-as'))
    await bar.getByRole('button', { name: 'Thoát' }).click()
    await deleted
    await expect(bar).toHaveCount(0)
    const after = (await (await page.request.get('/api/auth/me')).json()) as { actingAs: unknown }
    expect(after.actingAs).toBeNull()

    // Both ends are in the audit log, and the Nhật ký page shows them.
    for (const action of ['viewas.started', 'viewas.stopped']) {
      const res = await admin.get(`/api/admin/audit?action=${action}&limit=5`)
      expect(res.ok(), action).toBe(true)
      const body = (await res.json()) as { items: { actorCode?: string }[] }
      expect(body.items.some((i) => i.actorCode === 'T0001'), action).toBe(true)
    }
    await page.goto('/admin/audit')
    const table = page.getByRole('table', { name: 'Nhật ký thao tác' })
    await expect(table.getByText('Bắt đầu xem thử').first()).toBeVisible()
    await expect(table.getByText('Kết thúc xem thử').first()).toBeVisible()
  } finally {
    await admin.dispose()
  }
})

test('groups: T0001 creates a rule group (live preview, computed members) and a static group (typeahead add), then archives both', async ({ page }) => {
  test.setTimeout(120_000)
  const stamp = Date.now()
  await devLogin(page, 'T0001', '/manage/groups')
  await expect(page.getByRole('heading', { level: 1, name: 'Nhóm' })).toBeVisible()
  const list = page.getByRole('list', { name: 'Danh sách nhóm' })

  // Rule group: everybody with an email.
  await page.getByRole('button', { name: 'Tạo nhóm' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Tên nhóm').fill(`E2E quy tắc ${stamp}`)
  await dialog.getByRole('radio', { name: /Quy tắc/ }).check()
  await dialog.getByRole('group', { name: 'Điều kiện 1' }).getByLabel('Trường').click()
  await page.getByRole('option', { name: 'Có email', exact: true }).click()
  await dialog.getByRole('button', { name: 'Tạo nhóm' }).click()
  await expect(page).toHaveURL(/\/manage\/groups\/\d+$/)
  await expect(page.getByText(/\d+ cán bộ khớp quy tắc/)).toBeVisible()
  await expect(page.getByRole('table', { name: 'Thành viên' }).getByRole('row').nth(1)).toBeVisible()
  await page.getByRole('button', { name: 'Lưu trữ' }).click()
  await expect(page).toHaveURL(/\/manage\/groups$/)
  await expect(list.getByText(`E2E quy tắc ${stamp}`)).toHaveCount(0)

  // Static group: add T0003 through the employee typeahead.
  await page.getByRole('button', { name: 'Tạo nhóm' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Tên nhóm').fill(`E2E tĩnh ${stamp}`)
  await dialog.getByRole('button', { name: 'Tạo nhóm' }).click()
  await expect(page).toHaveURL(/\/manage\/groups\/\d+$/)
  await page.getByRole('combobox', { name: 'Thêm thành viên' }).fill('T0003')
  await page.getByRole('option', { name: /T0003/ }).click()
  await page.getByRole('button', { name: 'Thêm 1 người' }).click()
  await expect(page.getByRole('table', { name: 'Thành viên' }).getByText('T0003')).toBeVisible()
  await page.getByRole('button', { name: 'Lưu trữ' }).click()
  await expect(page).toHaveURL(/\/manage\/groups$/)
})

test('admin pages: every Quản trị page loads real data without an error', async ({ page }) => {
  test.setTimeout(120_000)
  await devLogin(page, 'T0001', '/admin')
  const h1 = (name: string) => page.getByRole('heading', { level: 1, name })
  await expect(h1('Quản trị')).toBeVisible()
  await expect(page.getByText('Hoạt động gần đây')).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)

  for (const [path, title] of [
    ['/admin/roles', 'Phân quyền'],
    ['/admin/audit', 'Nhật ký'],
    ['/admin/sync', 'Đồng bộ'],
    ['/admin/datasets', 'Dữ liệu'],
    ['/admin/api-clients', 'API clients'],
    ['/manage/groups', 'Nhóm'],
  ]) {
    await page.goto(path)
    await expect(h1(title)).toBeVisible()
    await expect(page.getByRole('progressbar')).toHaveCount(0)
    await expect(page.getByRole('alert'), `${path} shows no error`).toHaveCount(0)
  }
  // Audit rows exist (the dev-logins above are audited) and the role list has the dev roster.
  await page.goto('/admin/audit')
  await expect(page.getByRole('table', { name: 'Nhật ký thao tác' }).getByRole('row').nth(1)).toBeVisible()
  await page.goto('/admin/roles')
  await expect(page.getByRole('button', { name: /^Mở / }).filter({ hasText: 'T0002' })).toBeVisible()
})

test('API clients: an admin creates a key, it is shown once and the integration API accepts it until it is revoked', async ({ page, request }) => {
  test.setTimeout(90_000)
  await devLogin(page, 'T0001', '/admin/api-clients')
  await expect(page.getByRole('heading', { level: 1, name: 'API clients' })).toBeVisible()

  const name = `e2e-${Date.now()}`
  await page.getByRole('button', { name: 'Tạo API client' }).click()
  const create = page.getByRole('dialog', { name: 'Tạo API client' })
  await create.getByLabel(/^Tên/).fill(name)
  await create.getByRole('checkbox', { name: /hrm\.ingest/ }).check()
  await create.getByRole('button', { name: 'Tạo', exact: true }).click()

  const tokenDialog = page.getByRole('dialog', { name: /Token của/ })
  const token = await tokenDialog.getByTestId('api-token').inputValue()
  expect(token.length).toBeGreaterThanOrEqual(40)
  await tokenDialog.getByRole('button', { name: 'Tôi đã lưu token' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(token)).toHaveCount(0)

  const row = page.getByRole('table', { name: 'API clients' }).getByRole('row', { name })
  await expect(row).toContainText('Đang hoạt động')
  const ingest = () => request.post('/api/integration/v1/employees', { headers: { Authorization: `ApiKey ${token}` }, data: [] })
  // A deliberately malformed body (400): authentication and the scope check pass, yet nothing is ingested (a real snapshot would replace data).
  expect((await ingest()).status()).toBe(400)

  // The list endpoint never echoes the token.
  const listed = await page.evaluate(async () => (await fetch('/api/admin/api-clients')).text())
  expect(listed).not.toContain(token)

  await row.getByRole('button', { name: `Thu hồi ${name}` }).click()
  await page.getByRole('dialog', { name: /Thu hồi/ }).getByRole('button', { name: 'Thu hồi', exact: true }).click()
  await expect(row).toContainText('Đã thu hồi')
  expect((await ingest()).status()).toBe(401)

  // Both actions are in the audit log.
  await page.goto('/admin/audit')
  await expect(page.getByRole('table', { name: 'Nhật ký thao tác' })).toContainText('Thu hồi API client')
})

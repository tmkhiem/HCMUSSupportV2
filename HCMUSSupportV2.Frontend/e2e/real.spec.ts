import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

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

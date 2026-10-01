import { expect, test } from '@playwright/test'
import { DESKTOP, ME, MOBILE, expectNoHorizontalScroll, shoot } from './helpers.ts'

/** Runs against a plain `vite` (no mock user). `/api/auth/me` is stubbed per test. */

const systemInfo = { json: { version: '2.0.0-dev' } }
const unauthorized = { status: 401, contentType: 'application/problem+json', body: '{"status":401}' }

test.describe('login', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/system/info', (route) => route.fulfill(systemInfo))
    await page.route('**/api/auth/me', (route) => route.fulfill(unauthorized))
  })

  test('redirects to the login page with a returnUrl and shows the two tiles', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/ho-so')
    await expect(page).toHaveURL(/\/dang-nhap\?returnUrl=%2Fho-so$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Support HCMUS' })).toBeVisible()
    await expect(page.getByText('Chào mừng quý Thầy Cô')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Đăng nhập với Google' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Đăng nhập với VNeID' })).toBeDisabled()
    await shoot(page, 'login-1440')
  })

  test('Google tile goes to /api/auth/login with the returnUrl', async ({ page }) => {
    await page.route('**/api/auth/login**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: 'google' }),
    )
    await page.goto('/ho-so/luong')
    const request = page.waitForRequest('**/api/auth/login**')
    await page.getByRole('button', { name: 'Đăng nhập với Google' }).click()
    expect(new URL((await request).url()).searchParams.get('returnUrl')).toBe('/ho-so/luong')
  })

  test('shows a message for a rejected sign-in', async ({ page }) => {
    await page.goto('/dang-nhap?error=unknown_email')
    await expect(page.getByRole('alert')).toContainText('chưa được liên kết')
  })

  test('mobile layout has no horizontal scroll', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/dang-nhap')
    await expect(page.getByRole('button', { name: 'Đăng nhập với Google' })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await shoot(page, 'login-375')
  })
})

test.describe('roles', () => {
  test.use({ viewport: DESKTOP })
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/system/info', (route) => route.fulfill(systemInfo))
  })

  test('a plain employee has no editor/admin nav and gets the forbidden page', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: ME.employee }))
    await page.goto('/tin-tuc')
    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' })
    await expect(nav.getByRole('link', { name: 'Tin tức' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Quản lý thông báo' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Quản trị' })).toHaveCount(0)

    await page.goto('/quan-tri')
    await expect(page.getByText('Bạn không có quyền truy cập trang này')).toBeVisible()
  })

  test('an editor sees the manage entry but not the admin one', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: { ...ME.employee, roles: ['editor'] } }))
    await page.goto('/quan-ly/thong-bao')
    await expect(page.getByRole('heading', { level: 1, name: 'Quản lý thông báo' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Quản trị' })).toHaveCount(0)
    await page.goto('/quan-tri/nhat-ky')
    await expect(page.getByText('Bạn không có quyền truy cập trang này')).toBeVisible()
  })

  test('a failing auth check shows the error screen with a retry', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 500, contentType: 'application/problem+json', body: '{"detail":"Máy chủ đang bận."}' }))
    await page.goto('/tin-tuc')
    await expect(page.getByText('Lỗi xác thực')).toBeVisible()
    await expect(page.getByText('Máy chủ đang bận.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tải lại' })).toBeVisible()
  })
})

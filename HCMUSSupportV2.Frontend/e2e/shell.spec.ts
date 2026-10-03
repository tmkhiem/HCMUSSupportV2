import { expect, test } from '@playwright/test'
import { DESKTOP, MOBILE, expectNoHorizontalScroll, shoot } from './helpers.ts'

/** Runs against `vite` with VITE_MOCK_AUTH=1 (synthetic user T0001, editor + admin). */

const NAV_LABELS = [
  'Tin tức',
  'Hồ sơ cá nhân',
  'Sáng kiến',
  'Giảng dạy',
  'Nghiên cứu khoa học',
  'Quản lý thông báo',
  'Quản trị',
]

test.describe('desktop shell', () => {
  test.use({ viewport: DESKTOP })

  test('lands on Tin tức with the full sidebar and a sliding indicator', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/news$/)
    await expect(page).toHaveTitle(/Tin tức · Support HCMUS/)
    await expect(page.getByRole('heading', { level: 1, name: 'Tin tức' })).toBeVisible()

    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' })
    for (const label of NAV_LABELS) await expect(nav.getByRole('link', { name: label })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Tin tức' })).toHaveAttribute('aria-current', 'page')

    await shoot(page, 'shell-1440')
  })

  test('nav moves the indicator and changes the page', async ({ page }) => {
    await page.goto('/news')
    const indicator = page.getByTestId('nav-indicator')
    await expect(indicator).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')

    await page.getByRole('link', { name: 'Nghiên cứu khoa học' }).click()
    await expect(page).toHaveURL(/\/research\/projects$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Đề tài nghiên cứu' })).toBeVisible()
    // Row 5 (index 4) x 64 px.
    await expect(indicator).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 256)')

    await page.getByRole('link', { name: 'Quản lý thông báo' }).click()
    await expect(page).toHaveURL(/\/manage\/notifications$/)
    await page.goto('/manage/groups')
    await expect(page.getByRole('heading', { level: 1, name: 'Nhóm' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Quản lý thông báo' })).toHaveAttribute('aria-current', 'page')
  })

  test('account menu shows name, MSCB, roles and logout', async ({ page }) => {
    await page.goto('/news')
    await page.getByRole('button', { name: 'Tài khoản' }).click()
    const menu = page.getByRole('presentation').filter({ hasText: 'Nguyễn Thử Nghiệm' })
    await expect(menu).toContainText('T0001')
    await expect(menu).toContainText('Quản trị viên')
    await expect(menu.getByRole('menuitem', { name: 'Đăng xuất' })).toBeVisible()
    await shoot(page, 'account-menu-1440')

    await menu.getByRole('menuitem', { name: 'Đăng xuất' }).click()
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fnews$/)
  })

  test('every planned route renders its Vietnamese title', async ({ page }) => {
    const routes: Record<string, string> = {
      '/news': 'Tin tức', // the detail (/news/:id) is a dialog over the list, covered by inbox.spec.ts
      '/profile': 'Hồ sơ cá nhân',
      '/profile/general': 'Thông tin chung',
      '/profile/detailed': 'Thông tin chi tiết',
      '/profile/salary': 'Quá trình lương',
      '/profile/positions': 'Chức vụ',
      '/profile/commendations': 'Khen thưởng',
      '/profile/degrees': 'Quá trình đào tạo',
      '/profile/training': 'Quá trình bồi dưỡng',
      '/profile/business-trips': 'Đi công tác',
      '/innovations': 'Sáng kiến',
      '/teaching': 'Giảng dạy',
      '/research/publications': 'Bài báo khoa học',
      '/manage/notifications/new': 'Soạn thông báo mới', // a saved id would need the API; `new` renders the empty editor
      '/manage/employees': 'Nhân sự & email',
      '/manage/groups/1': 'Nhóm', // master-detail: the detail pane sits beside the list under the same heading
      '/admin': 'Quản trị',
      '/admin/roles': 'Phân quyền',
      '/admin/view-as': 'Xem thử',
      '/admin/audit': 'Nhật ký',
      '/admin/sync': 'Đồng bộ',
      '/admin/datasets': 'Dữ liệu',
      '/admin/api-clients': 'API clients',
    }
    for (const [path, title] of Object.entries(routes)) {
      await page.goto(path)
      // The overview's h1 is the employee's name once loaded (its "Hồ sơ cá nhân" heading only shows while loading): use the tab title.
      if (path === '/profile') await expect(page, path).toHaveTitle(new RegExp(`^${title} · Support HCMUS`))
      else await expect(page.getByRole('heading', { level: 1, name: title, exact: true }), path).toBeVisible()
    }
    await page.goto('/khong-ton-tai')
    await expect(page.getByRole('heading', { level: 1, name: 'Không tìm thấy trang' })).toBeVisible()
  })

  test('view-as bar appears when acting as another employee', async ({ page }) => {
    await page.goto('/news?mock-view-as=1')
    const bar = page.getByRole('status').filter({ hasText: 'Đang xem với tư cách' })
    await expect(bar).toContainText('Trần Mẫu Thử · T0002')
    await shoot(page, 'view-as-1440')
    await bar.getByRole('button', { name: 'Thoát' }).click()
    await expect(bar).toBeHidden()
  })
})

test.describe('mobile shell', () => {
  test.use({ viewport: MOBILE })

  test('top bar, drawer and navigation at 375 px', async ({ page }) => {
    await page.goto('/news')
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Mở menu' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Tin tức' })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await shoot(page, 'shell-375')

    await page.getByRole('button', { name: 'Mở menu' }).click()
    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' })
    await expect(nav).toBeVisible()
    await page.waitForTimeout(600)
    const box = await page.locator('.MuiDrawer-paper').last().boundingBox()
    expect(box?.width).toBeCloseTo(375 * 0.9, 0)
    await shoot(page, 'drawer-375')

    await nav.getByRole('link', { name: 'Giảng dạy' }).click()
    await expect(page).toHaveURL(/\/teaching$/)
    await expect(nav).toBeHidden()
    await expect(page.getByRole('heading', { level: 1, name: 'Giảng dạy' })).toBeVisible()
  })
})

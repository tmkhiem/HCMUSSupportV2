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
    await expect(page).toHaveURL(/\/tin-tuc$/)
    await expect(page).toHaveTitle(/Tin tức · Support HCMUS/)
    await expect(page.getByRole('heading', { level: 1, name: 'Tin tức' })).toBeVisible()

    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' })
    for (const label of NAV_LABELS) await expect(nav.getByRole('link', { name: label })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Tin tức' })).toHaveAttribute('aria-current', 'page')

    await shoot(page, 'shell-1440')
  })

  test('nav moves the indicator and changes the page', async ({ page }) => {
    await page.goto('/tin-tuc')
    const indicator = page.getByTestId('nav-indicator')
    await expect(indicator).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')

    await page.getByRole('link', { name: 'Nghiên cứu khoa học' }).click()
    await expect(page).toHaveURL(/\/nckh\/de-tai$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Đề tài nghiên cứu' })).toBeVisible()
    // Row 5 (index 4) x 64 px.
    await expect(indicator).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 256)')

    await page.getByRole('link', { name: 'Quản lý thông báo' }).click()
    await expect(page).toHaveURL(/\/quan-ly\/thong-bao$/)
    await page.goto('/quan-ly/nhom')
    await expect(page.getByRole('heading', { level: 1, name: 'Nhóm' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Quản lý thông báo' })).toHaveAttribute('aria-current', 'page')
  })

  test('account menu shows name, MSCB, roles and logout', async ({ page }) => {
    await page.goto('/tin-tuc')
    await page.getByRole('button', { name: 'Tài khoản' }).click()
    const menu = page.getByRole('presentation').filter({ hasText: 'Nguyễn Thử Nghiệm' })
    await expect(menu).toContainText('T0001')
    await expect(menu).toContainText('Quản trị viên')
    await expect(menu.getByRole('menuitem', { name: 'Đăng xuất' })).toBeVisible()
    await shoot(page, 'account-menu-1440')

    await menu.getByRole('menuitem', { name: 'Đăng xuất' }).click()
    await expect(page).toHaveURL(/\/dang-nhap\?returnUrl=%2Ftin-tuc$/)
  })

  test('every planned route renders its Vietnamese title', async ({ page }) => {
    const routes: Record<string, string> = {
      '/tin-tuc/abc': 'Chi tiết thông báo',
      '/ho-so': 'Hồ sơ cá nhân',
      '/ho-so/thong-tin-chung': 'Thông tin chung',
      '/ho-so/thong-tin-chi-tiet': 'Thông tin chi tiết',
      '/ho-so/luong': 'Quá trình lương',
      '/ho-so/chuc-vu': 'Chức vụ',
      '/ho-so/khen-thuong': 'Khen thưởng',
      '/ho-so/dao-tao': 'Quá trình đào tạo',
      '/ho-so/boi-duong': 'Quá trình bồi dưỡng',
      '/ho-so/cong-tac': 'Đi công tác',
      '/sang-kien': 'Sáng kiến',
      '/giang-day': 'Giảng dạy',
      '/nckh/bai-bao': 'Bài báo khoa học',
      '/quan-ly/thong-bao/xyz': 'Soạn thông báo',
      '/quan-ly/nhan-su': 'Nhân sự & email',
      '/quan-ly/nhom/1': 'Chi tiết nhóm',
      '/quan-tri': 'Quản trị',
      '/quan-tri/phan-quyen': 'Phân quyền',
      '/quan-tri/xem-thu': 'Xem thử',
      '/quan-tri/nhat-ky': 'Nhật ký',
      '/quan-tri/dong-bo': 'Đồng bộ',
      '/quan-tri/du-lieu': 'Dữ liệu',
    }
    for (const [path, title] of Object.entries(routes)) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true }), path).toBeVisible()
    }
    await page.goto('/khong-ton-tai')
    await expect(page.getByRole('heading', { level: 1, name: 'Không tìm thấy trang' })).toBeVisible()
  })

  test('view-as bar appears when acting as another employee', async ({ page }) => {
    await page.goto('/tin-tuc?mock-view-as=1')
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
    await page.goto('/tin-tuc')
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
    await expect(page).toHaveURL(/\/giang-day$/)
    await expect(nav).toBeHidden()
    await expect(page.getByRole('heading', { level: 1, name: 'Giảng dạy' })).toBeVisible()
  })
})

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { DESKTOP, MOBILE, expectNoHorizontalScroll } from './helpers.ts'

/** D10 smoke tests. Runs against `vite` with VITE_MOCK_AUTH=1 (synthetic T0001 data, no backend). */

const SHOT_DIR = fileURLToPath(new URL('../../docs/screenshots/d10/', import.meta.url))

async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `${SHOT_DIR}${name}.png`, animations: 'disabled', fullPage: false })
}

const CARD_LINKS: Array<[string, string]> = [
  ['Thông tin chung', '/ho-so/thong-tin-chung'],
  ['Thông tin chi tiết', '/ho-so/thong-tin-chi-tiet'],
  ['Quá trình lương', '/ho-so/luong'],
  ['Khen thưởng', '/ho-so/khen-thuong'],
  ['Chức vụ', '/ho-so/chuc-vu'],
  ['Quá trình đào tạo', '/ho-so/dao-tao'],
  ['Quá trình bồi dưỡng', '/ho-so/boi-duong'],
  ['Đi công tác', '/ho-so/cong-tac'],
]

test.describe('overview /ho-so', () => {
  test('desktop: hero and 8 linked summary cards with real data', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/ho-so')
    await expect(page.getByRole('heading', { level: 1, name: 'Nguyễn Thử Nghiệm' })).toBeVisible()
    await expect(page.getByText('T0001').first()).toBeVisible()
    await expect(page.getByText('Giảng viên chính — Khoa Công nghệ thông tin')).toBeVisible()
    await expect(page.getByText('t0001@example.test').first()).toBeVisible()

    for (const [title, to] of CARD_LINKS) {
      const card = page.getByRole('region', { name: title })
      await expect(card).toBeVisible()
      await expect(card.getByRole('link', { name: `Chi tiết ${title}` })).toHaveAttribute('href', to)
    }
    // Real figures, not placeholders.
    await expect(page.getByRole('region', { name: 'Thông tin chung' })).toContainText('07/03/1985')
    await expect(page.getByRole('region', { name: 'Quá trình lương' })).toContainText('Bậc 4')
    await expect(page.getByRole('region', { name: 'Khen thưởng' })).toContainText('5')
    await expect(page.getByRole('region', { name: 'Đi công tác' })).toContainText('4')

    const cols = await page.getByRole('region', { name: 'Chức vụ' }).evaluate((el) => {
      const grid = el.parentElement as HTMLElement
      return getComputedStyle(grid).gridTemplateColumns.split(' ').length
    })
    expect(cols).toBe(3)
    await shoot(page, 'overview-1440')
  })

  test('mobile 375: single column, no horizontal scroll', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/ho-so')
    await expect(page.getByRole('heading', { level: 1, name: 'Nguyễn Thử Nghiệm' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Đi công tác' })).toBeAttached()
    await expectNoHorizontalScroll(page)
    const cols = await page.getByRole('region', { name: 'Chức vụ' }).evaluate((el) =>
      getComputedStyle(el.parentElement as HTMLElement).gridTemplateColumns.split(' ').length,
    )
    expect(cols).toBe(1)
    await shoot(page, 'overview-375')
  })

  test('a card link navigates', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/ho-so')
    await page.getByRole('link', { name: 'Chi tiết Thông tin chung' }).click()
    await expect(page).toHaveURL(/\/ho-so\/thong-tin-chung$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Thông tin chung' })).toBeVisible()
  })
})

test.describe('Thông tin chung', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('desktop: sections, partial date, dashes, copy', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/ho-so/thong-tin-chung')
    await expect(page).toHaveTitle(/Thông tin chung/)
    await expect(page.getByRole('heading', { level: 1, name: 'Thông tin chung' })).toBeVisible()
    for (const s of ['Cá nhân', 'Liên hệ', 'Địa chỉ']) await expect(page.getByRole('region', { name: s })).toBeVisible()

    const personal = page.getByRole('region', { name: 'Cá nhân' })
    await expect(personal).toContainText('07/03/1985')
    await expect(personal).toContainText('Kinh')

    // Missing values render a dash (home phone, contact address).
    await expect(page.getByRole('region', { name: 'Liên hệ' }).getByLabel('Không có dữ liệu').first()).toBeVisible()

    await page.getByRole('button', { name: 'Sao chép số điện thoại di động' }).click()
    await expect(page.getByRole('tooltip', { name: 'Đã sao chép' })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('0901 000 001')
    await page.mouse.move(0, 0)
    await shoot(page, 'general-1440')
  })

  test('mobile 375: no horizontal scroll', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/ho-so/thong-tin-chung')
    await expect(page.getByRole('region', { name: 'Địa chỉ' })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await shoot(page, 'general-375')
  })
})

test.describe('Thông tin chi tiết', () => {
  test('desktop: sections and one-at-a-time reveal', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/ho-so/thong-tin-chi-tiet')
    await expect(page.getByRole('heading', { level: 1, name: 'Thông tin chi tiết' })).toBeVisible()
    for (const s of ['Công tác', 'Học hàm và học vị', 'Đoàn thể', 'Tài chính và bảo hiểm'])
      await expect(page.getByRole('region', { name: s })).toBeVisible()

    await shoot(page, 'detailed-1440')

    const money = page.getByRole('region', { name: 'Tài chính và bảo hiểm' })
    await money.scrollIntoViewIfNeeded()
    const values = money.getByTestId('masked-value')
    await expect(values.filter({ hasText: '•••• 4321' })).toBeVisible()
    await expect(money).not.toContainText('079085004321')

    await money.getByRole('button', { name: 'Hiện Số CCCD' }).click()
    await expect(money).toContainText('079085004321')
    // Other fields stay masked.
    await expect(money).toContainText('•••• 7788')
    await expect(money).not.toContainText('8412347788')
    await shoot(page, 'detailed-reveal-1440')

    await money.getByRole('button', { name: 'Ẩn Số CCCD' }).click()
    await expect(money).not.toContainText('079085004321')
    await expect(money).toContainText('•••• 4321')
  })

  test('mobile 375: no horizontal scroll', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/ho-so/thong-tin-chi-tiet')
    await expect(page.getByRole('region', { name: 'Tài chính và bảo hiểm' })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await shoot(page, 'detailed-375')
  })
})

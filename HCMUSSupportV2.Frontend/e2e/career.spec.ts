import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { DESKTOP, MOBILE, expectNoHorizontalScroll } from './helpers.ts'

/**
 * D11 smoke tests: Quá trình lương, Chức vụ, Khen thưởng against the synthetic mock data
 * (`careerMock.ts`, VITE_MOCK_AUTH=1 on port 5383). `?career=empty|error` switches the mock to the other page states.
 * Screenshots go to docs/screenshots/d11/.
 */

const SHOT_DIR = fileURLToPath(new URL('../../docs/screenshots/d11/', import.meta.url))

/** Pages scroll inside <main>, so grow the viewport to the content height for a full-page shot. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  const vp = page.viewportSize()!
  const height = await page.evaluate(() => {
    // The scroll container is whichever element overflows most (a <main> or one of its wrappers).
    let extra = 0
    for (const el of document.querySelectorAll<HTMLElement>('main, main *, #root, #root > *')) {
      extra = Math.max(extra, el.scrollHeight - el.clientHeight)
    }
    return window.innerHeight + extra
  })
  await page.setViewportSize({ width: vp.width, height: Math.min(Math.max(height, vp.height), 4000) })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOT_DIR}${name}.png`, animations: 'disabled' })
  await page.setViewportSize(vp)
}

test.describe.configure({ timeout: 60_000 })

const h1 = (page: Page, name: string) => page.getByRole('heading', { level: 1, name })

for (const [label, viewport, suffix] of [
  ['desktop', DESKTOP, '1440'],
  ['mobile', MOBILE, '375'],
] as const) {
  test.describe(`${label}`, () => {
    test.use({ viewport })

    test('Quá trình lương: stats, step chart, timeline', async ({ page }) => {
      await page.goto('/ho-so/luong')
      await expect(h1(page, 'Quá trình lương')).toBeVisible()
      const stats = page.getByTestId('salary-stats')
      await expect(stats).toContainText('Giảng viên chính (hạng II)')
      await expect(stats).toContainText('5,08')
      await expect(stats).toContainText('5%')
      await expect(stats).toContainText('còn 17 tháng')
      await expect(page.getByTestId('salary-chart').locator('svg').first()).toBeVisible()
      const items = page.getByTestId('salary-timeline').getByRole('listitem')
      await expect(items).toHaveCount(6)
      await expect(items.first()).toContainText('412/QĐ-KHTN')
      await expect(items.first()).toContainText('14/02/2025')
      await expect(items.first()).toContainText('01/03/2025')
      await expect(items.first()).toContainText('Nâng bậc lương thường xuyên.')
      await expect(page.getByRole('link', { name: 'Hồ sơ cá nhân' }).first()).toHaveAttribute('href', '/ho-so')
      if (label === 'mobile') await expectNoHorizontalScroll(page)
      await shot(page, `salary-${suffix}`)
    })

    test('Chức vụ: timeline with the current position emphasised', async ({ page }) => {
      await page.goto('/ho-so/chuc-vu')
      await expect(h1(page, 'Chức vụ')).toBeVisible()
      const timeline = page.getByTestId('position-timeline')
      await expect(timeline.getByRole('listitem')).toHaveCount(3)
      const current = timeline.locator('li[data-current="true"]')
      await expect(current).toHaveCount(1)
      await expect(current).toContainText('Phó trưởng bộ môn')
      await expect(current).toContainText('Hiện tại')
      await expect(current).toContainText('3 năm 2 tháng')
      await expect(timeline).toContainText('4 năm 11 tháng')
      await expect(timeline).toContainText('8 năm 7 tháng')
      if (label === 'mobile') await expectNoHorizontalScroll(page)
      await shot(page, `positions-${suffix}`)
    })

    test('Khen thưởng: counts, tabs and năm học groups', async ({ page }) => {
      await page.goto('/ho-so/khen-thuong')
      await expect(h1(page, 'Khen thưởng')).toBeVisible()
      await expect(page.getByRole('tab', { name: /Khen thưởng \(5\)/ })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tab', { name: /Danh hiệu \(3\)/ })).toBeVisible()
      const awards = page.getByTestId('commendation-groups-award')
      await expect(awards.getByRole('heading', { level: 3 })).toHaveCount(5)
      await expect(awards).toContainText('Năm học 2023-2024')
      await expect(awards).toContainText('Năm học 2019-2020')
      await expect(awards).toContainText('QĐ 1204/QĐ-ĐHQG')
      await expect(awards).toContainText('Chưa có số quyết định')
      if (label === 'mobile') await expectNoHorizontalScroll(page)
      await shot(page, `commendations-awards-${suffix}`)

      await page.getByRole('tab', { name: /Danh hiệu/ }).click()
      const titles = page.getByTestId('commendation-groups-title')
      await expect(titles).toContainText('Chiến sĩ thi đua cơ sở')
      await expect(titles).toContainText('Chưa rõ năm học')
      await expect(page.getByTestId('commendation-groups-award')).toHaveCount(0)
      await shot(page, `commendations-titles-${suffix}`)
    })
  })
}

test.describe('page states', () => {
  test.use({ viewport: DESKTOP })

  const pages = [
    { path: '/ho-so/luong', title: 'Quá trình lương', empty: 'Chưa có thông tin lương.', error: 'Không tải được quá trình lương.' },
    { path: '/ho-so/chuc-vu', title: 'Chức vụ', empty: 'Chưa có thông tin chức vụ.', error: 'Không tải được danh sách chức vụ.' },
    { path: '/ho-so/khen-thuong', title: 'Khen thưởng', empty: 'Chưa có thông tin khen thưởng.', error: 'Không tải được danh sách khen thưởng.' },
  ]

  for (const p of pages) {
    test(`${p.title}: empty`, async ({ page }) => {
      await page.goto(`${p.path}?career=empty`)
      await expect(h1(page, p.title)).toBeVisible()
      await expect(page.getByText(p.empty)).toBeVisible()
      await expect(page.getByRole('link', { name: 'Hồ sơ cá nhân' }).first()).toBeVisible()
    })

    test(`${p.title}: error with retry`, async ({ page }) => {
      await page.goto(`${p.path}?career=error`)
      await expect(h1(page, p.title)).toBeVisible()
      await expect(page.getByRole('alert')).toContainText(p.error, { timeout: 15_000 })
      await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible()
    })
  }
})

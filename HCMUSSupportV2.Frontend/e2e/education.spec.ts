import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { DESKTOP, MOBILE, expectNoHorizontalScroll } from './helpers.ts'

/**
 * D12 smoke tests: Quá trình đào tạo, Bồi dưỡng, Đi công tác against the synthetic mock data
 * (`educationMock.ts`, VITE_MOCK_AUTH=1 on port 5583). `?education=empty|error` switches the mock to the other page states.
 * Screenshots go to docs/screenshots/d12/.
 */

const SHOT_DIR = fileURLToPath(new URL('../../docs/screenshots/d12/', import.meta.url))

/** Pages scroll inside <main>, so grow the viewport to the content height for a full-page shot. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  const vp = page.viewportSize()!
  const height = await page.evaluate(() => {
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

    test('Quá trình đào tạo: diploma cards, newest first', async ({ page }) => {
      await page.goto('/ho-so/dao-tao')
      await expect(h1(page, 'Quá trình đào tạo')).toBeVisible()
      const cards = page.getByTestId('degree-cards')
      await expect(cards.getByRole('article')).toHaveCount(4)
      const headlines = cards.getByRole('heading', { level: 2 })
      await expect(headlines).toHaveText(['Tiến sĩ', 'Thạc sĩ', 'Cử nhân', 'Chứng chỉ'])
      const first = cards.getByRole('article').first()
      await expect(first).toContainText('Khoa học máy tính')
      await expect(first).toContainText('Đại học Tổng hợp Mẫu · Nhật Bản')
      await expect(first).toContainText('2014 – 2018')
      await expect(first).toContainText('Chính quy')
      await expect(first).toContainText('Phương pháp học sâu')
      await expect(cards.getByRole('article').last()).toContainText('—')
      await expect(page.getByRole('link', { name: 'Hồ sơ cá nhân' }).first()).toHaveAttribute('href', '/ho-so')
      if (label === 'mobile') await expectNoHorizontalScroll(page)
      await shot(page, `degrees-${suffix}`)
    })

    test('Quá trình bồi dưỡng: table grouped by year', async ({ page }) => {
      await page.goto('/ho-so/boi-duong')
      await expect(h1(page, 'Quá trình bồi dưỡng')).toBeVisible()
      const groups = page.getByTestId('training-groups')
      await expect(groups.getByRole('heading', { level: 2 })).toHaveText(['Năm 2025', 'Năm 2023', 'Chưa rõ năm'])
      await expect(groups).toContainText('2 khóa')
      await expect(groups).toContainText('3 khóa')
      await expect(groups).toContainText('Trung tâm Giáo dục quốc phòng TP.HCM')
      await expect(groups).toContainText('09/06/2025 – 20/06/2025')
      await expect(groups).toContainText('03/2023 – 08/2023')
      await expect(groups.getByRole('listitem')).toHaveCount(6)
      if (label === 'desktop') await expect(page.getByText('Nơi bồi dưỡng')).toBeVisible()
      else await expect(page.getByText('Nơi bồi dưỡng')).toBeHidden()
      if (label === 'mobile') await expectNoHorizontalScroll(page)
      await shot(page, `training-${suffix}`)
    })

    test('Đi công tác: stats follow the year filter', async ({ page }) => {
      await page.goto('/ho-so/cong-tac')
      await expect(h1(page, 'Đi công tác')).toBeVisible()
      const stats = page.getByTestId('trip-stats')
      const rows = page.getByTestId('trip-table').getByRole('listitem')
      await expect(stats).toContainText('Số chuyến')
      await expect(stats).toContainText('5')
      await expect(stats).toContainText('33')
      await expect(rows).toHaveCount(5)
      await expect(rows.first()).toContainText('Singapore')
      await expect(rows.first()).toContainText('07/04/2025 – 12/04/2025')
      await expect(rows.first()).toContainText('6 ngày')
      await expect(rows.first()).toContainText('QĐ 502/QĐ-KHTN')
      await expect(rows.first()).toContainText('20/03/2025')
      if (label === 'mobile') await expectNoHorizontalScroll(page)
      await shot(page, `trips-${suffix}`)

      await page.getByRole('combobox', { name: 'Năm' }).click()
      await page.getByRole('option', { name: '2025' }).click()
      await expect(stats).toContainText('Năm 2025')
      await expect(stats).toContainText('9')
      await expect(rows).toHaveCount(2)
      await shot(page, `trips-2025-${suffix}`)

      await page.getByRole('combobox', { name: 'Năm' }).click()
      await page.getByRole('option', { name: 'Tất cả' }).click()
      await expect(rows).toHaveCount(5)
    })
  })
}

test.describe('page states', () => {
  test.use({ viewport: DESKTOP })

  const pages = [
    { path: '/ho-so/dao-tao', title: 'Quá trình đào tạo', empty: 'Chưa có thông tin đào tạo.', error: 'Không tải được quá trình đào tạo.' },
    { path: '/ho-so/boi-duong', title: 'Quá trình bồi dưỡng', empty: 'Chưa có thông tin bồi dưỡng.', error: 'Không tải được quá trình bồi dưỡng.' },
    { path: '/ho-so/cong-tac', title: 'Đi công tác', empty: 'Chưa có thông tin đi công tác.', error: 'Không tải được danh sách đi công tác.' },
  ]

  for (const p of pages) {
    test(`${p.title}: empty`, async ({ page }) => {
      await page.goto(`${p.path}?education=empty`)
      await expect(h1(page, p.title)).toBeVisible()
      await expect(page.getByText(p.empty)).toBeVisible()
      await expect(page.getByRole('link', { name: 'Hồ sơ cá nhân' }).first()).toBeVisible()
    })

    test(`${p.title}: error with retry`, async ({ page }) => {
      await page.goto(`${p.path}?education=error`)
      await expect(h1(page, p.title)).toBeVisible()
      await expect(page.getByRole('alert')).toContainText(p.error, { timeout: 15_000 })
      await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible()
    })
  }
})

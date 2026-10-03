import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { DESKTOP, MOBILE, expectNoHorizontalScroll } from './helpers.ts'

/**
 * D13 smoke tests: Sáng kiến, Giảng dạy and Nghiên cứu khoa học (Đề tài, Bài báo) against the synthetic mock data
 * (`innovationMock.ts`, `teachingMock.ts`, `researchMock.ts`; VITE_MOCK_AUTH=1 on port 5593). `?scenario=empty|error`
 * switches the mocks to the other page states. Screenshots go to docs/screenshots/d13/.
 */

const SHOT_DIR = fileURLToPath(new URL('../../docs/screenshots/d13/', import.meta.url))

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

    test('Sáng kiến: stats, search, load more, detail dialog', async ({ page }) => {
      await page.goto('/innovations')
      await expect(h1(page, 'Sáng kiến')).toBeVisible()
      const stats = page.getByTestId('innovation-stats')
      await expect(stats).toContainText('Tổng số sáng kiến')
      await expect(stats).toContainText('9')
      await expect(stats).toContainText('Cấp cơ sở')
      await expect(stats).toContainText('Cấp trường')
      await expect(stats).toContainText('Chưa phân loại')
      const rows = page.getByTestId('innovation-list').getByRole('button')
      await expect(rows).toHaveCount(9)
      if (label === 'mobile') await expectNoHorizontalScroll(page)
      await shot(page, `innovation-${suffix}`)

      await page.getByRole('searchbox', { name: 'Tìm sáng kiến' }).fill('lớp học đảo ngược')
      await expect(rows).toHaveCount(1)
      await expect(rows.first()).toContainText('SK-2024-008')
      // Stats are the employee's totals, not the filtered ones.
      await expect(stats).toContainText('9')

      await rows.first().click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toContainText('SK-2024-008')
      await expect(dialog).toContainText('Cấp trường')
      await expect(dialog).toContainText('455/QĐ-ĐHQG')
      await expect(dialog).toContainText('Năm 2024')
      await shot(page, `innovation-detail-${suffix}`)
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)

      await page.getByRole('searchbox', { name: 'Tìm sáng kiến' }).fill('không có kết quả nào')
      await expect(page.getByText('Không tìm thấy sáng kiến nào khớp với')).toBeVisible()
    })

    test('Giảng dạy: year pill, program sections with stats, học kỳ and học phần groups, source caption', async ({ page }) => {
      await page.goto('/teaching')
      await expect(h1(page, 'Giảng dạy')).toBeVisible()
      const programs = page.getByTestId('teaching-programs').getByRole('heading', { level: 2 })
      await expect(programs).toHaveText(['Đại học', 'Cao học', 'Tiến sĩ'])

      // Đại học: học kỳ groups.
      const dh = page.getByTestId('program-dai_hoc')
      await expect(page.getByTestId('program-dai_hoc-stats')).toContainText('279')
      await expect(page.getByTestId('program-dai_hoc-stats')).toContainText('Giờ quy đổi')
      await expect(dh.getByTestId('term-1')).toContainText('3 lớp · 198 giờ quy đổi')
      await expect(dh.getByTestId('term-2')).toContainText('2 lớp · 81 giờ quy đổi')
      await expect(dh.getByTestId('term-1').getByRole('heading', { level: 3 })).toHaveText('Học kỳ 1')
      await expect(dh.getByTestId('term-1')).toContainText('CLC')
      await expect(dh.getByTestId('term-1')).toContainText('Lý thuyết')

      // Cao học and Tiến sĩ: no học kỳ, grouped by học phần / chuyên đề; a missing module goes last.
      const ch = page.getByTestId('program-cao_hoc')
      await expect(page.getByTestId('program-cao_hoc-stats')).toContainText('187,5')
      await expect(ch.getByRole('heading', { level: 3 })).toHaveText(['Hệ thống thông tin', 'Học phần 3', 'Chưa rõ học phần'])
      await expect(ch.getByText('Học kỳ')).toHaveCount(0)
      const ts = page.getByTestId('program-tien_si')
      await expect(page.getByTestId('program-tien_si-stats')).toContainText('90')
      await expect(ts.getByRole('heading', { level: 3 })).toHaveText(['CĐTS', 'HPTS'])

      await expect(page.getByTestId('teaching-source')).toHaveText(
        'Nguồn: Phòng Đào tạo (dữ liệu thử nghiệm), cập nhật 28/09/2026',
      )
      if (label === 'mobile') await expectNoHorizontalScroll(page)
      await shot(page, `teaching-${suffix}`)

      await page.getByTestId('year-select').getByRole('combobox').click()
      await page.getByRole('option', { name: '2022-2023' }).click()
      await expect(page.getByTestId('program-dai_hoc-stats')).toContainText('126')
      await expect(page.getByTestId('program-cao_hoc')).toHaveCount(0)
      await expect(page.getByTestId('program-tien_si')).toHaveCount(0)
      await expect(page.getByTestId('term-1')).toHaveCount(0)
      await expect(page.getByTestId('term-2')).toBeVisible()
      await expect(page.getByTestId('teaching-source')).toHaveCount(0)
    })

    test('Đề tài: switcher, role chips, detail with members', async ({ page }) => {
      await page.goto('/research/projects')
      const switcher = page.getByRole('navigation', { name: 'Nghiên cứu khoa học' })
      await expect(switcher.locator('a[aria-current="page"]')).toContainText(label === 'mobile' ? 'Đề tài' : 'Đề tài nghiên cứu')
      await expect(h1(page, 'Đề tài nghiên cứu')).toBeVisible()
      const rows = page.getByTestId('project-list').getByRole('button')
      await expect(rows).toHaveCount(5)
      await expect(rows.first()).toContainText('Chủ nhiệm')
      await expect(rows.first()).toContainText('Cấp trường')
      await expect(rows.first()).toContainText('60.000.000 đ')
      await expect(rows.nth(1)).toContainText('Thành viên')
      if (label === 'mobile') await expectNoHorizontalScroll(page)
      await shot(page, `projects-${suffix}`)

      await page.getByRole('button', { name: 'Tải thêm đề tài' }).click()
      await expect(rows).toHaveCount(7)
      await expect(page.getByRole('button', { name: 'Tải thêm đề tài' })).toHaveCount(0)

      await rows.nth(1).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toContainText('B2024-21')
      await expect(dialog).toContainText('180.000.000 đ')
      const members = page.getByTestId('project-members').getByRole('listitem')
      await expect(members).toHaveCount(3)
      await expect(members.first()).toContainText('Phạm Cộng Sự')
      await expect(members.first()).toContainText('Chủ nhiệm')
      await expect(dialog.getByText('Bạn', { exact: true })).toBeVisible()
      await shot(page, `projects-detail-${suffix}`)
    })

    test('Bài báo: switcher link, venue, DOI link, co-authors', async ({ page }) => {
      await page.goto('/research/projects')
      await page.getByRole('navigation', { name: 'Nghiên cứu khoa học' }).locator('a').nth(1).click()
      await expect(page).toHaveURL(/\/research\/publications$/)
      await expect(h1(page, 'Bài báo khoa học')).toBeVisible()
      const first = page.getByTestId('publication-list').getByRole('article').first()
      await expect(first).toContainText('Journal of Educational Computing')
      await expect(first).toContainText('· 2025')
      await expect(first).toContainText('Đồng tác giả: Trần Biên Tập')
      const doi = first.getByRole('link', { name: /DOI: 10\.1000\/synthetic\.2025\.0061/ })
      await expect(doi).toHaveAttribute('href', 'https://doi.org/10.1000/synthetic.2025.0061')
      await expect(doi).toHaveAttribute('target', '_blank')
      await expect(page.getByTestId('publication-list').getByRole('article')).toHaveCount(5)
      await page.getByRole('button', { name: 'Tải thêm bài báo' }).click()
      await expect(page.getByTestId('publication-list').getByRole('article')).toHaveCount(6)
      if (label === 'mobile') await expectNoHorizontalScroll(page)
      await shot(page, `publications-${suffix}`)
    })
  })
}

test.describe('page states', () => {
  test.use({ viewport: DESKTOP })

  const pages = [
    { path: '/innovations', title: 'Sáng kiến', empty: 'Chưa có sáng kiến nào được ghi nhận.', error: 'Không tải được danh sách sáng kiến.' },
    { path: '/teaching', title: 'Giảng dạy', empty: 'Chưa có dữ liệu giảng dạy.', error: 'Không tải được danh sách năm học giảng dạy.' },
    { path: '/research/projects', title: 'Đề tài nghiên cứu', empty: 'Chưa có đề tài nghiên cứu nào được ghi nhận.', error: 'Không tải được danh sách đề tài nghiên cứu.' },
    { path: '/research/publications', title: 'Bài báo khoa học', empty: 'Chưa có bài báo khoa học nào được ghi nhận.', error: 'Không tải được danh sách bài báo khoa học.' },
  ]

  for (const p of pages) {
    test(`${p.title}: empty`, async ({ page }) => {
      await page.goto(`${p.path}?scenario=empty`)
      await expect(page.getByText(p.empty)).toBeVisible()
    })

    test(`${p.title}: error with retry`, async ({ page }) => {
      await page.goto(`${p.path}?scenario=error`)
      await expect(page.getByRole('alert')).toContainText(p.error, { timeout: 15_000 })
      await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible()
    })
  }
})

test('Giảng dạy: a học kỳ divider docks at the top while its table scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 420 })
  await page.goto('/teaching')
  const divider = page.getByTestId('term-1').locator('[data-sticky-divider]')
  await expect(divider).toBeVisible()
  const main = page.locator('#main-content')
  // Scroll until the divider's section is 80 px past the top, i.e. its natural position would be above the viewport.
  await main.evaluate((el) => {
    const section = el.querySelector<HTMLElement>('[data-testid="term-1"]')!
    el.scrollBy(0, section.getBoundingClientRect().top - el.getBoundingClientRect().top + 80)
  })
  await page.waitForTimeout(200)
  const top = await divider.evaluate((el) => el.getBoundingClientRect().top)
  const mainTop = await main.evaluate((el) => el.getBoundingClientRect().top)
  expect(Math.abs(top - mainTop)).toBeLessThan(4)
})

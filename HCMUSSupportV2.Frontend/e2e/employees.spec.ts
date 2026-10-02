import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { DESKTOP, MOBILE, expectNoHorizontalScroll } from './helpers.ts'

/**
 * D14c smoke tests: "Nhân sự & email" (`/quan-ly/nhan-su`) against the synthetic mock directory (`employeesMock.ts`,
 * VITE_MOCK_AUTH=1 on port 5693). `?employees=empty|error` switches the mock to the other page states.
 * Screenshots go to docs/screenshots/d14c/.
 */

const SHOT_DIR = fileURLToPath(new URL('../../docs/screenshots/d14c/', import.meta.url))

async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOT_DIR}${name}.png`, animations: 'disabled' })
}

test.describe.configure({ timeout: 60_000 })

const h1 = (page: Page) => page.getByRole('heading', { level: 1, name: 'Nhân sự & email' })
const rows = (page: Page) => page.getByTestId('employee-row')
const drawer = (page: Page) => page.getByRole('presentation').filter({ has: page.getByRole('heading', { level: 2 }) })

for (const [label, viewport, suffix] of [
  ['desktop', DESKTOP, '1440'],
  ['mobile', MOBILE, '375'],
] as const) {
  test.describe(label, () => {
    test.use({ viewport })

    test('directory: list, search, filters and load more', async ({ page }) => {
      await page.goto('/quan-ly/nhan-su')
      await expect(h1(page)).toBeVisible()
      await expect(rows(page).first()).toBeVisible()
      await expect(page.getByText(/40 cán bộ/)).toBeVisible()
      await expect(rows(page)).toHaveCount(40)
      await expectNoHorizontalScroll(page)
      await shot(page, `directory-${suffix}`)

      // Search by MSCB prefix, then by an email fragment, then by a name without accents.
      const search = page.getByLabel('Tìm kiếm nhân sự')
      await search.fill('T0002')
      await expect(rows(page)).toHaveCount(1)
      await expect(page).toHaveURL(/q=T0002/)
      await search.fill('t0003.alt')
      await expect(rows(page)).toHaveCount(1)
      await expect(rows(page).first()).toHaveAttribute('data-code', 'T0003')
      await search.fill('')
      await expect(rows(page)).toHaveCount(40)

      // Filters.
      await page.getByRole('button', { name: 'Chỉ hiện người chưa có email' }).click()
      await expect(page).toHaveURL(/chuaemail=1/)
      await expect(rows(page)).toHaveCount(5)
      await page.getByRole('button', { name: 'Chỉ hiện người chưa có email' }).click()
      await expect(rows(page)).toHaveCount(40)
      await page.getByRole('button', { name: 'Chỉ hiện email trùng với HRM' }).click()
      await expect(rows(page)).toHaveCount(1)
      await expect(rows(page).first()).toHaveAttribute('data-code', 'T0012')
      await shot(page, `filtered-${suffix}`)
    })

    test('drawer: add (validated), set primary, remove with confirmation', async ({ page }) => {
      await page.goto('/quan-ly/nhan-su?q=T0007')
      await rows(page).first().click()
      await expect(page).toHaveURL(/ma=T0007/)
      const d = drawer(page)
      await expect(d.getByText('Chưa có email nào, cán bộ này chưa thể đăng nhập.')).toBeVisible()

      // Validation first, then a real add: it becomes the primary email.
      await d.getByLabel('Địa chỉ email').fill('khong-hop-le')
      await d.getByRole('button', { name: 'Thêm email' }).click()
      await expect(d.getByText('Địa chỉ email không hợp lệ.')).toBeVisible()
      await d.getByLabel('Địa chỉ email').fill('Cán.Bộ@Example.test'.replace('Cán.Bộ', 'can.bo'))
      await d.getByLabel('Ghi chú (không bắt buộc)').fill('Email trường')
      await d.getByRole('button', { name: 'Thêm email' }).click()
      await expect(d.getByTestId('email-row')).toHaveCount(1)
      await expect(d.getByText('can.bo@example.test')).toBeVisible()
      await expect(d.getByTestId('email-row').getByText('Email chính')).toBeVisible()

      // A second email; the server refuses a duplicate owned by another MSCB.
      await d.getByLabel('Địa chỉ email').fill('t0001@example.test')
      await d.getByRole('button', { name: 'Thêm email' }).click()
      await expect(d.getByRole('alert').filter({ hasText: 'MSCB T0001' })).toBeVisible()
      await d.getByLabel('Địa chỉ email').fill('second@example.test')
      await d.getByLabel('Đặt làm email chính').check()
      await d.getByRole('button', { name: 'Thêm email' }).click()
      await expect(d.getByTestId('email-row')).toHaveCount(2)
      await expect(d.getByTestId('email-row').first()).toContainText('second@example.test')
      await expect(d.getByTestId('email-row').first()).toContainText('Email chính')
      await expectNoHorizontalScroll(page)
      await shot(page, `drawer-${suffix}`)

      // Set primary back, then remove with a confirmation.
      await d.getByRole('button', { name: 'Đặt can.bo@example.test làm email chính' }).click()
      await expect(d.getByTestId('email-row').first()).toContainText('can.bo@example.test')
      await d.getByRole('button', { name: 'Gỡ second@example.test' }).click()
      const dialog = page.getByRole('dialog', { name: 'Gỡ email này?' })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Giữ lại' }).click()
      await expect(d.getByTestId('email-row')).toHaveCount(2)
      await d.getByRole('button', { name: 'Gỡ second@example.test' }).click()
      await dialog.getByRole('button', { name: 'Gỡ email' }).click()
      await expect(d.getByTestId('email-row')).toHaveCount(1)

      // Closing keeps the list; the row now shows the new address.
      await d.getByRole('button', { name: 'Đóng' }).click()
      await expect(page).not.toHaveURL(/ma=/)
      await expect(rows(page).first()).toContainText('can.bo@example.test')
    })

    test('import: dry run report, then apply', async ({ page }) => {
      await page.goto('/quan-ly/nhan-su')
      await expect(rows(page).first()).toBeVisible()
      await page.getByRole('button', { name: 'Nhập từ tệp' }).click()
      const dialog = page.getByRole('dialog', { name: 'Nhập MSCB và email từ tệp' })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Kiểm tra tệp' })).toBeDisabled()
      await shot(page, `import-start-${suffix}`)

      const csv = [
        'MSCB,Họ tên,Email 1,Email 2',
        'T0014,,t0014@example.test,',
        'T0021,,t0021@example.test,t0021.bis@example.test',
        'T0028,,t0001@example.test,',
        'T9999,,t9999@example.test,',
        'T0035,,khong-hop-le,',
        'T0001,,t0001@example.test,',
      ].join('\n')
      await dialog.getByTestId('import-file').setInputFiles({ name: 'nhan-su.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') })
      await dialog.getByRole('button', { name: 'Kiểm tra tệp' }).click()
      await expect(dialog.getByTestId('import-report')).toBeVisible()
      await expect(dialog.getByTestId('count-added')).toContainText('3')
      await expect(dialog.getByTestId('count-unchanged')).toContainText('1')
      await expect(dialog.getByTestId('count-conflicts')).toContainText('1')
      await expect(dialog.getByTestId('count-unknown')).toContainText('1')
      await expect(dialog.getByTestId('count-invalid')).toContainText('1')
      await expect(dialog.getByTestId('section-conflicts')).toContainText('T0001')
      await expect(dialog.getByTestId('section-unknown')).toContainText('T9999')
      await shot(page, `import-report-${suffix}`)

      await dialog.getByRole('button', { name: 'Áp dụng (3)' }).click()
      await expect(dialog.getByTestId('import-applied')).toContainText('thêm 3 email')
      await shot(page, `import-applied-${suffix}`)
      await dialog.getByRole('button', { name: 'Xong' }).click()
      await expect(dialog).toBeHidden()

      await page.getByLabel('Tìm kiếm nhân sự').fill('t0021.bis')
      await expect(rows(page)).toHaveCount(1)
      await expect(rows(page).first()).toHaveAttribute('data-code', 'T0021')
    })

    test('states: empty and error', async ({ page }) => {
      await page.goto('/quan-ly/nhan-su?employees=empty')
      await expect(page.getByText('Danh bạ nhân sự đang trống.')).toBeVisible()
      await shot(page, `empty-${suffix}`)

      await page.goto('/quan-ly/nhan-su?employees=error')
      await expect(page.getByRole('alert')).toContainText('Không tải được danh sách cán bộ.')
      await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible()
      await shot(page, `error-${suffix}`)
    })
  })
}

test('the nav has a "Nhân sự & email" entry for editors', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await page.goto('/quan-ly/nhan-su')
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' })
  await expect(nav.getByRole('link', { name: 'Nhân sự & email' })).toHaveAttribute('aria-current', 'page')
})

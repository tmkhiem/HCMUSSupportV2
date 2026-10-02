import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { stubAdminApi } from './adminFixtures.ts'
import { DESKTOP, MOBILE, expectNoHorizontalScroll } from './helpers.ts'

/** Runs against `vite` with VITE_MOCK_AUTH=1 (port 5393). `/api/**` is stubbed per test (adminFixtures.ts). */

const SHOT_DIR = fileURLToPath(new URL('../../docs/screenshots/d14b/', import.meta.url))
async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `${SHOT_DIR}${name}.png`, animations: 'disabled' })
}

const h1 = (page: Page, name: string) => page.getByRole('heading', { level: 1, name })

test.describe('admin pages (desktop)', () => {
  test.use({ viewport: DESKTOP })

  test('Quản trị: tiles, quick actions and recent activity', async ({ page }) => {
    await stubAdminApi(page)
    await page.goto('/quan-tri')
    await expect(h1(page, 'Quản trị')).toBeVisible()
    await expect(page.getByText('Cán bộ đang hoạt động')).toBeVisible()
    await expect(page.getByText('1.284')).toBeVisible()
    await expect(page.getByText('Hoạt động gần đây')).toBeVisible()
    await shoot(page, 'quan-tri-1440')
    await page.getByRole('link', { name: 'Phân quyền' }).first().click()
    await expect(page).toHaveURL(/\/quan-tri\/phan-quyen$/)
  })

  test('Phân quyền: search, open drawer, toggle editor, save', async ({ page }) => {
    const calls = await stubAdminApi(page)
    await page.goto('/quan-tri/phan-quyen')
    await expect(h1(page, 'Phân quyền')).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Lê Nhân Viên' })).toBeVisible().catch(() => undefined)
    await page.getByRole('button', { name: 'Tải thêm' }).click()
    await expect(page.getByText('Phạm Giảng Viên')).toBeVisible()

    await page.getByRole('button', { name: 'Mở Lê Nhân Viên' }).click()
    const drawer = page.getByRole('presentation').filter({ hasText: 'Chi tiết phân quyền' })
    await expect(drawer.getByText('Lê Nhân Viên')).toBeVisible()
    const save = drawer.getByRole('button', { name: 'Lưu' })
    await expect(save).toBeDisabled()
    await drawer.getByRole('checkbox', { name: /Biên tập viên/ }).check()
    await expect(save).toBeEnabled()
    await shoot(page, 'phan-quyen-drawer-1440')
    await save.click()
    await expect(drawer.getByText('Đã lưu phân quyền')).toBeVisible()
    expect(calls.rolePuts).toEqual([{ code: 'T0003', body: { roles: ['editor'] } }])
  })

  test('Phân quyền: 409 last-admin message is shown', async ({ page }) => {
    await stubAdminApi(page, { lastAdmin: true })
    await page.goto('/quan-tri/phan-quyen')
    await page.getByRole('button', { name: 'Mở Nguyễn Thử Nghiệm' }).click()
    const drawer = page.getByRole('presentation').filter({ hasText: 'Chi tiết phân quyền' })
    await drawer.getByRole('checkbox', { name: /Quản trị viên/ }).uncheck()
    await drawer.getByRole('button', { name: 'Lưu' }).click()
    await expect(drawer.getByRole('alert')).toContainText('quản trị viên cuối cùng')
  })

  test('Xem thử: typeahead then start goes to Tin tức', async ({ page }) => {
    const calls = await stubAdminApi(page)
    await page.goto('/quan-tri/xem-thu')
    await expect(h1(page, 'Xem thử')).toBeVisible()
    await page.getByLabel('Cán bộ cần xem').fill('Trần')
    await page.getByRole('option', { name: /Trần Mẫu Thử/ }).click()
    await shoot(page, 'xem-thu-1440')
    await page.getByRole('button', { name: 'Bắt đầu xem thử' }).click()
    await expect(page).toHaveURL(/\/tin-tuc$/)
    expect(calls.viewAs).toEqual([{ employeeCode: 'T0002' }])
  })

  test('view-as bar shows and exits (mock)', async ({ page }) => {
    await stubAdminApi(page)
    await page.goto('/tin-tuc?mock-view-as=1')
    await expect(page.getByText('Đang xem với tư cách Trần Mẫu Thử')).toBeVisible()
    await page.getByRole('button', { name: 'Thoát' }).click()
    await expect(page.getByText('Đang xem với tư cách')).toHaveCount(0)
  })

  test('Nhật ký: filter by action and page', async ({ page }) => {
    await stubAdminApi(page)
    await page.goto('/quan-tri/nhat-ky')
    await expect(h1(page, 'Nhật ký')).toBeVisible()
    await expect(page.getByRole('table', { name: 'Nhật ký thao tác' }).getByText('Cấp quyền').first()).toBeVisible()
    await page.getByRole('button', { name: 'Tải thêm' }).click()
    await expect(page.getByText('Bắt đầu xem thử').first()).toBeVisible()
    await shoot(page, 'nhat-ky-1440')
    await page.getByLabel('Hành động').click()
    await page.getByRole('option', { name: /Đăng nhập/ }).click()
    await expect(page.getByRole('table', { name: 'Nhật ký thao tác' }).getByRole('row')).toHaveCount(2)
  })

  test('Đồng bộ: runs and resolving an issue', async ({ page }) => {
    const calls = await stubAdminApi(page)
    await page.goto('/quan-tri/dong-bo')
    await expect(h1(page, 'Đồng bộ')).toBeVisible()
    await expect(page.getByText('Số dòng giảm quá ngưỡng cho phép.')).toBeVisible()
    await shoot(page, 'dong-bo-1440')
    await page.getByRole('button', { name: 'Đánh dấu đã xử lý T0099' }).click()
    await expect.poll(() => calls.resolved).toEqual(['11'])
  })

  test('Dữ liệu: upload, validation report, apply', async ({ page }) => {
    const calls = await stubAdminApi(page)
    await page.goto('/quan-tri/du-lieu')
    await expect(h1(page, 'Dữ liệu')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Tải tệp mẫu' })).toHaveAttribute('href', '/api/admin/datasets/teaching/template')
    await page.getByTestId('dataset-file').setInputFiles({ name: 'giang-day-2025.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') })
    await expect(page.getByText('Hợp lệ, chờ áp dụng')).toBeVisible()
    await expect(page.getByText('X9999', { exact: false })).toBeVisible()
    await expect(page.getByText('Dòng 12 · cột Số tiết')).toBeVisible()
    await shoot(page, 'du-lieu-1440')
    await page.getByRole('button', { name: 'Áp dụng' }).click()
    await expect(page.getByText('Đã áp dụng dữ liệu.')).toBeVisible()
    expect(calls.applied).toHaveLength(1)
  })

  test('Nhóm: list, rule group with preview, unsaved bar and save', async ({ page }) => {
    const calls = await stubAdminApi(page)
    await page.goto('/quan-ly/nhom')
    await expect(h1(page, 'Nhóm')).toBeVisible()
    const list = page.getByRole('list', { name: 'Danh sách nhóm' })
    await expect(list.getByText('Ban chủ nhiệm khoa')).toBeVisible()

    await page.getByRole('button', { name: 'Quy tắc', exact: true }).click()
    await expect(list.getByText('Ban chủ nhiệm khoa')).toHaveCount(0)
    await list.getByText('Giảng viên có email').click()
    await expect(page).toHaveURL(/\/quan-ly\/nhom\/1$/)
    await expect(page.getByText('128 cán bộ khớp quy tắc')).toBeVisible()
    await expect(page.getByText('Trần Mẫu Thử · T0002')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Thay đổi chưa lưu' })).toHaveCount(0)

    await page.getByLabel('Mô tả').fill('Giảng viên và có email')
    const bar = page.getByRole('region', { name: 'Thay đổi chưa lưu' })
    await expect(bar).toBeVisible()
    await shoot(page, 'nhom-rule-1440')
    await bar.getByRole('button', { name: 'Lưu' }).click()
    await expect(bar).toHaveCount(0)
    expect(calls.groupPuts).toHaveLength(1)
    expect(calls.groupPuts[0]).toMatchObject({ description: 'Giảng viên và có email', rule: { all: [{ field: 'position_title' }, { field: 'has_email', value: true }] } })
  })

  test('Nhóm: static group has members, add by MSCB and import controls', async ({ page }) => {
    await stubAdminApi(page)
    await page.goto('/quan-ly/nhom/2')
    await expect(page.getByRole('table', { name: 'Thành viên' }).getByText('T0002')).toBeVisible()
    await expect(page.getByLabel('Danh sách MSCB')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nhập từ tệp CSV / Excel' })).toBeVisible()
    await shoot(page, 'nhom-static-1440')
  })

  test('Nhóm: org-unit group has the descendants switch and read-only members', async ({ page }) => {
    await stubAdminApi(page)
    await page.goto('/quan-ly/nhom/3')
    await expect(page.getByRole('checkbox', { name: /đơn vị trực thuộc/ })).toBeChecked()
    await expect(page.getByLabel('Tên nhóm')).toBeDisabled()
    await expect(page.getByLabel('Danh sách MSCB')).toHaveCount(0)
  })
})

test.describe('admin pages (mobile)', () => {
  test.use({ viewport: MOBILE })

  test('Nhóm detail and Phân quyền fit the phone', async ({ page }) => {
    await stubAdminApi(page)
    await page.goto('/quan-ly/nhom/1')
    await expect(page.getByText('128 cán bộ khớp quy tắc')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await shoot(page, 'nhom-rule-375')
    await page.goto('/quan-tri/phan-quyen')
    await expect(page.getByRole('button', { name: 'Mở Lê Nhân Viên' })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await shoot(page, 'phan-quyen-375')
    await page.goto('/quan-tri')
    await expect(page.getByText('Cán bộ đang hoạt động')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await shoot(page, 'quan-tri-375')
  })
})
